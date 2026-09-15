import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { RecoveryPlan } from './recovery-plan.schema';
import {
  AnalysisAbortedError,
  MAX_ANALYSIS_ATTEMPTS,
  NothingToAnalyzeError,
  RecoveryAnalysisService,
} from './recovery-analysis.service';
import { validateTemplateBody } from './recovery.helpers';

/** Análisis simultáneos por instancia: cada uno lanza varias llamadas a la IA. */
const MAX_PARALLEL_ANALYSES = 2;
const MAX_PARALLEL_REWRITES = 3;
/** Duración del candado; se renueva cada HEARTBEAT_MS mientras el proceso vive. */
const LOCK_MS = 3 * 60_000;
const HEARTBEAT_MS = 60_000;
/** Espera antes de reintentar un análisis que falló: 1, 2… minutos. */
const RETRY_BASE_MS = 60_000;
/** Una reescritura "en curso" más vieja que esto murió con su proceso. */
const STALE_REWRITE_MS = 6 * 60_000;

/**
 * Worker de la recuperación de clientes. Todo lo que tarda (el análisis con IA
 * y las reescrituras de mensajes) se encola en Mongo y se procesa aquí, fuera
 * de la petición HTTP:
 *
 * - La petición solo marca el trabajo y responde al instante.
 * - El worker lo reclama con un candado atómico, así dos instancias no hacen
 *   el mismo trabajo, y lo renueva mientras trabaja.
 * - Si el proceso muere (un despliegue), el candado caduca y el trabajo se
 *   retoma en la siguiente pasada desde lo ya guardado.
 * - Los errores se reintentan con espera creciente; al agotar los intentos el
 *   plan queda fallido y se avisa a quien lo creó.
 */
@Injectable()
export class RecoveryWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(RecoveryWorker.name);
  private readonly analyses = new Set<string>();
  private readonly rewrites = new Set<string>();
  private kicking = false;
  private stopping = false;

  constructor(
    @InjectModel(RecoveryPlan.name) private planModel: Model<RecoveryPlan>,
    private analysis: RecoveryAnalysisService,
    private push: PushService,
    private nativePush: NativePushService,
  ) {}

  onApplicationShutdown() {
    this.stopping = true;
  }

  /** Pasada periódica: recoge lo encolado y lo que dejó un proceso caído. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  sweep(): void {
    void this.kick();
  }

  /** Arranca el trabajo pendiente sin esperar a la próxima pasada. */
  async kick(): Promise<void> {
    if (this.kicking || this.stopping) return;
    this.kicking = true;
    try {
      while (this.analyses.size < MAX_PARALLEL_ANALYSES) {
        const plan = await this.claimAnalysis();
        if (!plan) break;
        const id = String(plan._id);
        this.analyses.add(id);
        void this.processAnalysis(plan).finally(() => this.analyses.delete(id));
      }
      await this.startRewrites();
    } catch (err) {
      this.logger.error(`Pasada del worker falló: ${String(err)}`);
    } finally {
      this.kicking = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Análisis
  // ──────────────────────────────────────────────────────────────────────

  private claimAnalysis(): Promise<RecoveryPlan | null> {
    const now = new Date();
    return this.planModel
      .findOneAndUpdate(
        {
          status: 'analyzing',
          _id: { $nin: [...this.analyses].map((id) => new Types.ObjectId(id)) },
          $or: [
            { analysisLockedUntil: null },
            { analysisLockedUntil: { $lte: now } },
          ],
        },
        { $set: { analysisLockedUntil: new Date(now.getTime() + LOCK_MS) } },
        { sort: { analysisQueuedAt: 1, createdAt: 1 }, new: true },
      )
      .exec();
  }

  private async processAnalysis(plan: RecoveryPlan): Promise<void> {
    const id = String(plan._id);
    const heartbeat = setInterval(() => {
      void this.planModel
        .updateOne(
          { _id: plan._id, status: 'analyzing' },
          { $set: { analysisLockedUntil: new Date(Date.now() + LOCK_MS) } },
        )
        .exec()
        .catch(() => undefined);
    }, HEARTBEAT_MS);

    let error: unknown;
    try {
      await this.analysis.run(plan);
    } catch (err) {
      error = err;
    } finally {
      // Antes de tocar el candado: si no, el latido podría pisar la espera.
      clearInterval(heartbeat);
    }

    if (!error) {
      this.logger.log(`Plan ${id}: análisis terminado`);
      await this.notify(
        plan,
        'Tu plan de recuperación está listo',
        'Revisa a quién escribir y qué decirle.',
      );
      return;
    }
    if (error instanceof AnalysisAbortedError) return;

    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    const attempts = (plan.analysisAttempts ?? 0) + 1;
    const final =
      error instanceof NothingToAnalyzeError ||
      attempts >= MAX_ANALYSIS_ATTEMPTS;
    this.logger.warn(
      `Plan ${id}: intento ${attempts}/${MAX_ANALYSIS_ATTEMPTS} falló${final ? ' (definitivo)' : ''}: ${message}`,
    );

    await this.planModel
      .updateOne(
        { _id: plan._id, status: 'analyzing' },
        final
          ? {
              $set: {
                status: 'failed',
                analysisAttempts: attempts,
                'analysis.error': message,
              },
              $unset: { analysisLockedUntil: 1, analysisCheckpoint: 1 },
            }
          : {
              $set: {
                analysisAttempts: attempts,
                'analysis.error': message,
                analysisLockedUntil: new Date(
                  Date.now() + RETRY_BASE_MS * attempts,
                ),
              },
            },
      )
      .exec();

    if (final)
      await this.notify(
        plan,
        'No se pudo analizar tus conversaciones',
        message.slice(0, 140),
      );
  }

  private async notify(plan: RecoveryPlan, title: string, body: string) {
    const route = `/recuperacion/${String(plan._id)}`;
    const tag = `recovery-${String(plan._id)}`;
    const tenantId = String(plan.tenantId);
    const sends = plan.createdBy
      ? [
          this.push.sendToUser(String(plan.createdBy), {
            title,
            body,
            url: route,
            tag,
          }),
          this.nativePush.sendToUser(plan.createdBy, {
            title,
            body,
            data: { route },
          }),
        ]
      : [
          this.push.sendToTenant(
            tenantId,
            { title, body, url: route, tag },
            { moduleKey: 'campaigns' },
          ),
          this.nativePush.sendToTenantModule(tenantId, 'campaigns', {
            title,
            body,
            data: { route },
          }),
        ];
    // Una notificación que falla no debe marcar el análisis como fallido.
    await Promise.allSettled(sends);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Reescrituras de mensajes
  // ──────────────────────────────────────────────────────────────────────

  private async startRewrites(): Promise<void> {
    // Las que quedaron "en curso" de un proceso que murió vuelven a la cola.
    await this.planModel
      .updateMany(
        { 'segments.rewriteJob.state': 'running' },
        { $set: { 'segments.$[s].rewriteJob.state': 'pending' } },
        {
          arrayFilters: [
            {
              's.rewriteJob.state': 'running',
              's.rewriteJob.startedAt': {
                $lt: new Date(Date.now() - STALE_REWRITE_MS),
              },
            },
          ],
        },
      )
      .exec();

    while (this.rewrites.size < MAX_PARALLEL_REWRITES) {
      const startedAt = new Date();
      const plan = await this.planModel
        .findOneAndUpdate(
          { 'segments.rewriteJob.state': 'pending' },
          {
            $set: {
              'segments.$[s].rewriteJob.state': 'running',
              'segments.$[s].rewriteJob.startedAt': startedAt,
            },
          },
          { arrayFilters: [{ 's.rewriteJob.state': 'pending' }], new: true },
        )
        .exec();
      if (!plan) break;

      const claimed = plan.segments.filter(
        (s) =>
          s.rewriteJob?.state === 'running' &&
          new Date(s.rewriteJob.startedAt ?? 0).getTime() ===
            startedAt.getTime(),
      );
      for (const segment of claimed) {
        const key = `${String(plan._id)}:${segment.key}`;
        this.rewrites.add(key);
        void this.processRewrite(plan, segment.key).finally(() =>
          this.rewrites.delete(key),
        );
      }
    }
  }

  private async processRewrite(plan: RecoveryPlan, key: string): Promise<void> {
    const segment = plan.segments.find((s) => s.key === key);
    const job = segment?.rewriteJob;
    if (!segment || !job) return;

    let result: string | undefined;
    let error: string | undefined;
    try {
      result = await this.analysis.rewriteMessage(
        plan,
        segment,
        job.instruction,
      );
      const invalid = validateTemplateBody(result);
      if (invalid)
        error = `La IA propuso un mensaje que Meta rechazaría (${invalid}). Pide otra versión.`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    // Solo se guarda si nadie pidió otra versión mientras tanto.
    await this.planModel
      .updateOne(
        { _id: plan._id },
        {
          $set: {
            'segments.$[s].rewriteJob.state': error ? 'failed' : 'done',
            'segments.$[s].rewriteJob.result': error ? undefined : result,
            'segments.$[s].rewriteJob.error': error,
            'segments.$[s].rewriteJob.finishedAt': new Date(),
          },
        },
        {
          arrayFilters: [
            { 's.key': key, 's.rewriteJob.requestedAt': job.requestedAt },
          ],
        },
      )
      .exec();
  }
}
