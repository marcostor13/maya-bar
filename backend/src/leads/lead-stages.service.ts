import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Lead } from './lead.schema';
import { LeadStageEntry } from './lead-stage.schema';
import { CreateLeadStageDto, UpdateLeadStageDto } from './dto/lead.dto';
import { LEAD_STAGES, LeadStage } from './lead-stages.catalog';

/** Cuánto vive la copia en memoria del embudo de un tenant. */
const CACHE_TTL_MS = 30_000;

/** Colores para las etapas nuevas que no traen uno. */
const STAGE_PALETTE = [
  '#6366F1',
  '#0EA5E9',
  '#8B5CF6',
  '#F59E0B',
  '#F97316',
  '#EC4899',
  '#14B8A6',
  '#64748B',
];

/** Clave legible y estable: slug de la etiqueta + sufijo aleatorio corto. */
export function stageKeyFor(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = randomBytes(3).toString('hex').slice(0, 4);
  return `${slug || 'etapa'}-${suffix}`;
}

/**
 * Embudo configurable por tenant. Se siembra con las etapas de fábrica la
 * primera vez que se lee, así que las oportunidades ya guardadas con esas
 * claves siguen funcionando sin migrar.
 *
 * Reglas: siempre queda al menos una etapa abierta, y exactamente una ganada y
 * una perdida (esas se pueden renombrar y recolorear, pero no borrar).
 */
@Injectable()
export class LeadStagesService {
  private cache = new Map<string, { at: number; stages: LeadStage[] }>();

  constructor(
    @InjectModel(LeadStageEntry.name)
    private stageModel: Model<LeadStageEntry>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
  ) {}

  /** Etapas del tenant ordenadas. */
  async list(tenantId: string): Promise<LeadStage[]> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.stages;

    const tid = new Types.ObjectId(tenantId);
    let rows = await this.stageModel
      .find({ tenantId: tid })
      .sort({ order: 1 })
      .lean<LeadStageEntry[]>()
      .exec();
    if (!rows.length) {
      await this.seed(tid);
      rows = await this.stageModel
        .find({ tenantId: tid })
        .sort({ order: 1 })
        .lean<LeadStageEntry[]>()
        .exec();
    }
    const stages = rows.map((r) => this.toStage(r));
    this.cache.set(tenantId, { at: Date.now(), stages });
    return stages;
  }

  /** La etapa o un 400: la clave viene del cliente. */
  async assertStage(tenantId: string, key: string): Promise<LeadStage> {
    const stage = (await this.list(tenantId)).find((s) => s.key === key);
    if (!stage) throw new BadRequestException(`Etapa inválida: ${key}`);
    return stage;
  }

  /** Donde entra lo que se crea sin etapa: la primera abierta. */
  async defaultKey(tenantId: string): Promise<string> {
    const stages = await this.list(tenantId);
    return (stages.find((s) => !s.outcome) ?? stages[0]).key;
  }

  async create(tenantId: string, dto: CreateLeadStageDto): Promise<LeadStage> {
    const stages = await this.list(tenantId);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Indica un nombre');
    this.assertUniqueLabel(stages, label);

    // Va detrás de la última etapa abierta: antes de ganada/perdida.
    const lastOpen = stages.reduce((idx, s, i) => (s.outcome ? idx : i), -1);
    const key = stageKeyFor(label);
    const created: LeadStage = {
      key,
      label,
      order: 0,
      color: dto.color ?? STAGE_PALETTE[stages.length % STAGE_PALETTE.length],
      probability: dto.probability ?? 50,
    };
    const next = [...stages];
    next.splice(lastOpen + 1, 0, created);

    await this.stageModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...created,
    });
    await this.persistOrder(
      tenantId,
      next.map((s) => s.key),
    );
    return this.assertStage(tenantId, key);
  }

  async update(
    tenantId: string,
    key: string,
    dto: UpdateLeadStageDto,
  ): Promise<LeadStage> {
    const stages = await this.list(tenantId);
    this.findOrThrow(stages, key);
    const set: Partial<LeadStage> = {};
    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) throw new BadRequestException('Indica un nombre');
      this.assertUniqueLabel(stages, label, key);
      set.label = label;
    }
    if (dto.color !== undefined) set.color = dto.color;
    if (dto.probability !== undefined) set.probability = dto.probability;

    if (Object.keys(set).length)
      await this.stageModel
        .updateOne(
          { tenantId: new Types.ObjectId(tenantId), key },
          { $set: set },
        )
        .exec();
    this.invalidate(tenantId);
    return this.assertStage(tenantId, key);
  }

  /** Nuevo orden: tiene que traer todas las claves, sin repetir. */
  async reorder(tenantId: string, keys: string[]): Promise<LeadStage[]> {
    const stages = await this.list(tenantId);
    const current = new Set(stages.map((s) => s.key));
    const given = new Set(keys);
    if (
      given.size !== keys.length ||
      given.size !== current.size ||
      keys.some((k) => !current.has(k))
    )
      throw new BadRequestException(
        'El orden debe incluir todas las etapas del embudo, una sola vez',
      );
    await this.persistOrder(tenantId, keys);
    return this.list(tenantId);
  }

  /**
   * Borra una etapa. Si tiene oportunidades, se mueven antes a `moveTo`, con
   * su estado recalculado (cerrarlas si el destino es ganada/perdida).
   */
  async remove(
    tenantId: string,
    key: string,
    moveTo?: string,
  ): Promise<{ deleted: boolean; moved: number }> {
    const stages = await this.list(tenantId);
    const stage = this.findOrThrow(stages, key);
    if (stage.outcome)
      throw new BadRequestException(
        'Las etapas de ganado y perdido no se pueden eliminar',
      );
    if (stages.filter((s) => !s.outcome).length <= 1)
      throw new BadRequestException(
        'El embudo necesita al menos una etapa abierta',
      );

    const tid = new Types.ObjectId(tenantId);
    const count = await this.leadModel
      .countDocuments({ tenantId: tid, stage: key })
      .exec();
    let moved = 0;
    if (count > 0) {
      if (!moveTo)
        throw new BadRequestException(
          'La etapa tiene oportunidades: indica a qué etapa moverlas',
        );
      if (moveTo === key)
        throw new BadRequestException('Elige otra etapa de destino');
      const target = stages.find((s) => s.key === moveTo);
      if (!target) throw new BadRequestException(`Etapa inválida: ${moveTo}`);

      const status = target.outcome ?? 'open';
      const update =
        status === 'open'
          ? {
              $set: { stage: moveTo, status },
              $unset: { closedAt: 1, lostReason: 1 },
            }
          : { $set: { stage: moveTo, status, closedAt: new Date() } };
      const res = await this.leadModel
        .updateMany({ tenantId: tid, stage: key }, update)
        .exec();
      moved = res.modifiedCount ?? count;
    }

    await this.stageModel.deleteOne({ tenantId: tid, key }).exec();
    await this.persistOrder(
      tenantId,
      stages.filter((s) => s.key !== key).map((s) => s.key),
    );
    return { deleted: true, moved };
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  // ------------------------------------------------------------------

  private async seed(tenantId: Types.ObjectId) {
    try {
      await this.stageModel.insertMany(
        LEAD_STAGES.map((s) => ({ ...s, tenantId })),
        { ordered: false },
      );
    } catch (err) {
      // Dos lecturas simultáneas sembrando a la vez: la otra ya lo hizo.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  private async persistOrder(tenantId: string, keys: string[]) {
    const tid = new Types.ObjectId(tenantId);
    await this.stageModel.bulkWrite(
      keys.map((key, order) => ({
        updateOne: {
          filter: { tenantId: tid, key },
          update: { $set: { order } },
        },
      })),
    );
    this.invalidate(tenantId);
  }

  private findOrThrow(stages: LeadStage[], key: string): LeadStage {
    const stage = stages.find((s) => s.key === key);
    if (!stage) throw new NotFoundException('Etapa no encontrada');
    return stage;
  }

  private assertUniqueLabel(
    stages: LeadStage[],
    label: string,
    exceptKey?: string,
  ) {
    const norm = label.toLocaleLowerCase('es');
    if (
      stages.some(
        (s) => s.key !== exceptKey && s.label.toLocaleLowerCase('es') === norm,
      )
    )
      throw new BadRequestException(`Ya existe una etapa llamada "${label}"`);
  }

  private toStage(r: LeadStageEntry): LeadStage {
    return {
      key: r.key,
      label: r.label,
      order: r.order,
      color: r.color,
      probability: r.probability ?? 0,
      ...(r.outcome ? { outcome: r.outcome } : {}),
    };
  }
}
