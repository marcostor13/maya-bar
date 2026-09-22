import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProspectSearch } from './prospect-search.schema';
import { Prospect } from './prospect.schema';
import { ProspectingResearchService } from './prospecting-research.service';
import { errorText } from './prospecting-sources';

const MAX_PARALLEL_SEARCHES = 1;
const MAX_PARALLEL_RESEARCH = 3;
const MAX_PARALLEL_MATERIAL = 2;
/** Candado del trabajo; se renueva mientras el proceso vive. */
const LOCK_MS = 4 * 60_000;
const HEARTBEAT_MS = 60_000;
/** Intentos antes de dar un trabajo por fallido. */
export const MAX_ATTEMPTS = 2;
const RETRY_MS = 60_000;

type Kind = 'research' | 'material';

/**
 * Worker de la prospección. Las búsquedas, investigaciones y materiales tardan
 * minutos (varias fuentes externas y la IA), así que la petición solo los
 * encola y este worker los procesa con un candado en Mongo: dos instancias no
 * repiten trabajo y lo que deja un proceso caído se retoma al caducar.
 */
@Injectable()
export class ProspectingWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(ProspectingWorker.name);
  private readonly running = {
    search: new Set<string>(),
    research: new Set<string>(),
    material: new Set<string>(),
  };
  private kicking = false;
  private stopping = false;

  constructor(
    @InjectModel(ProspectSearch.name)
    private searchModel: Model<ProspectSearch>,
    @InjectModel(Prospect.name) private prospectModel: Model<Prospect>,
    private research: ProspectingResearchService,
  ) {}

  onApplicationShutdown() {
    this.stopping = true;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  sweep(): void {
    void this.kick();
  }

  async kick(): Promise<void> {
    if (this.kicking || this.stopping) return;
    this.kicking = true;
    try {
      while (this.running.search.size < MAX_PARALLEL_SEARCHES) {
        const search = await this.claimSearch();
        if (!search) break;
        this.track('search', String(search._id), this.processSearch(search));
      }
      for (const [kind, max] of [
        ['research', MAX_PARALLEL_RESEARCH],
        ['material', MAX_PARALLEL_MATERIAL],
      ] as [Kind, number][]) {
        while (this.running[kind].size < max) {
          const prospect = await this.claimProspect(kind);
          if (!prospect) break;
          this.track(
            kind,
            String(prospect._id),
            this.processProspect(kind, prospect),
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Pasada del worker de prospección falló: ${errorText(err)}`,
      );
    } finally {
      this.kicking = false;
    }
  }

  private track(
    kind: keyof ProspectingWorker['running'],
    id: string,
    job: Promise<void>,
  ) {
    this.running[kind].add(id);
    void job.finally(() => this.running[kind].delete(id));
  }

  private heartbeat(
    model: Model<ProspectSearch> | Model<Prospect>,
    id: Types.ObjectId,
    field: string,
  ) {
    return setInterval(() => {
      void (model as Model<Prospect>)
        .updateOne(
          { _id: id },
          { $set: { [field]: new Date(Date.now() + LOCK_MS) } },
        )
        .exec()
        .catch(() => undefined);
    }, HEARTBEAT_MS);
  }

  // ── Búsquedas ──────────────────────────────────────────────────────────

  private claimSearch(): Promise<ProspectSearch | null> {
    const now = new Date();
    return this.searchModel
      .findOneAndUpdate(
        {
          status: 'searching',
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
        { sort: { createdAt: 1 }, new: true },
      )
      .exec();
  }

  private async processSearch(search: ProspectSearch): Promise<void> {
    const beat = this.heartbeat(this.searchModel, search._id, 'lockedUntil');
    try {
      await this.research.runSearch(search);
    } catch (err) {
      const attempts = (search.attempts ?? 0) + 1;
      const final = attempts >= MAX_ATTEMPTS;
      this.logger.warn(
        `Búsqueda ${String(search._id)} falló (${attempts}): ${errorText(err)}`,
      );
      await this.searchModel
        .updateOne(
          { _id: search._id, status: 'searching' },
          {
            $set: {
              attempts,
              error: errorText(err),
              progress: '',
              ...(final
                ? { status: 'failed', lockedUntil: null }
                : { lockedUntil: new Date(Date.now() + RETRY_MS) }),
            },
          },
        )
        .exec();
    } finally {
      clearInterval(beat);
    }
  }

  // ── Investigación y material por prospecto ─────────────────────────────

  private claimProspect(kind: Kind): Promise<Prospect | null> {
    const now = new Date();
    return this.prospectModel
      .findOneAndUpdate(
        {
          [`${kind}.state`]: { $in: ['queued', 'running'] },
          _id: { $nin: [...this.running[kind]] },
          $or: [
            { [`${kind}.lockedUntil`]: null },
            { [`${kind}.lockedUntil`]: { $exists: false } },
            { [`${kind}.lockedUntil`]: { $lte: now } },
          ],
        },
        {
          $set: {
            [`${kind}.state`]: 'running',
            [`${kind}.startedAt`]: now,
            [`${kind}.lockedUntil`]: new Date(now.getTime() + LOCK_MS),
          },
        },
        { sort: { [`${kind}.queuedAt`]: 1 }, new: true },
      )
      .exec();
  }

  private async processProspect(kind: Kind, prospect: Prospect): Promise<void> {
    const beat = this.heartbeat(
      this.prospectModel,
      prospect._id,
      `${kind}.lockedUntil`,
    );
    try {
      if (kind === 'research') await this.research.runResearch(prospect);
      else await this.research.runMaterial(prospect);
    } catch (err) {
      const attempts = (prospect[kind]?.attempts ?? 0) + 1;
      const final = attempts >= MAX_ATTEMPTS;
      this.logger.warn(
        `${kind} de ${String(prospect._id)} falló (${attempts}): ${errorText(err)}`,
      );
      await this.prospectModel
        .updateOne(
          { _id: prospect._id, [`${kind}.state`]: 'running' },
          {
            $set: {
              [`${kind}.attempts`]: attempts,
              [`${kind}.error`]: errorText(err),
              ...(final
                ? { [`${kind}.state`]: 'failed', [`${kind}.lockedUntil`]: null }
                : { [`${kind}.lockedUntil`]: new Date(Date.now() + RETRY_MS) }),
            },
          },
        )
        .exec();
    } finally {
      clearInterval(beat);
    }
  }
}
