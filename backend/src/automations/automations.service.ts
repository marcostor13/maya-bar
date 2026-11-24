import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { Automation, AutomationRun } from './automation.schema';
import {
  STEP_TYPES,
  TRIGGER_TYPES,
  stepError,
  triggerError,
  type AutomationStep,
  type AutomationTrigger,
  type SendWindow,
} from './automation-steps';
import { AUTOMATION_TEMPLATES } from './automation-templates';

export interface AutomationInput {
  name: string;
  trigger: AutomationTrigger;
  steps: Partial<AutomationStep>[];
  exitOnReply?: boolean;
  sendWindow?: SendWindow | null;
  active?: boolean;
}

export interface AutomationStats {
  entered: number;
  active: number;
  completed: number;
  replied: number;
  exited: number;
}

const STEP_KEYS: (keyof AutomationStep)[] = [
  'type',
  'minutes',
  'untilHour',
  'hoursBeforeEvent',
  'text',
  'subject',
  'accountId',
  'template',
  'tag',
  'stage',
  'userId',
  'title',
  'dueMinutes',
  'url',
  'condition',
  'otherwise',
];
const MAX_STEPS = 30;

/** CRUD, plantillas y métricas de las automatizaciones (HU58). */
@Injectable()
export class AutomationsService {
  constructor(
    @InjectModel(Automation.name) private automations: Model<Automation>,
    @InjectModel(AutomationRun.name) private runs: Model<AutomationRun>,
  ) {}

  templates() {
    return AUTOMATION_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      trigger: t.trigger,
      steps: t.steps,
      exitOnReply: t.exitOnReply,
      sendWindow: t.sendWindow,
    }));
  }

  async list(tenantId: string) {
    const rows = await this.automations
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .select('-webhookSecret')
      .lean()
      .exec();
    const stats = await this.statsFor(rows.map((r) => r._id));
    return rows.map((r) => ({
      ...r,
      stats: stats.get(String(r._id)) ?? emptyStats(),
    }));
  }

  async get(tenantId: string, id: string) {
    const a = await this.owned(tenantId, id);
    const stats = await this.statsFor([a._id]);
    const recent = await this.runs
      .find({ automationId: a._id })
      .sort({ updatedAt: -1 })
      .limit(30)
      .populate('customerId', 'name email phone')
      .lean()
      .exec();
    return {
      ...a.toObject(),
      stats: stats.get(String(a._id)) ?? emptyStats(),
      recent,
    };
  }

  async create(tenantId: string, userId: string, input: AutomationInput) {
    const clean = this.validate(input);
    return this.automations.create({
      ...clean,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : undefined,
      webhookSecret: randomBytes(24).toString('hex'),
      active: input.active ?? false,
    });
  }

  async fromTemplate(tenantId: string, userId: string, key: string) {
    const t = AUTOMATION_TEMPLATES.find((x) => x.key === key);
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    const a = await this.create(tenantId, userId, {
      name: t.name,
      trigger: { ...t.trigger },
      steps: t.steps.map((s) => ({ ...s })),
      exitOnReply: t.exitOnReply,
      sendWindow: t.sendWindow,
      active: false,
    });
    await this.automations
      .updateOne({ _id: a._id }, { $set: { templateKey: key } })
      .exec();
    return a;
  }

  async update(tenantId: string, id: string, input: AutomationInput) {
    const a = await this.owned(tenantId, id);
    const clean = this.validate(input);
    // Los pasos que ya existían conservan su id: las ejecuciones en curso siguen por índice.
    Object.assign(a, clean);
    if (input.active !== undefined) a.active = input.active;
    await a.save();
    return a;
  }

  async setActive(tenantId: string, id: string, active: boolean) {
    const a = await this.owned(tenantId, id);
    if (active) this.validate(a.toObject());
    a.active = active;
    await a.save();
    return { active: a.active };
  }

  async remove(tenantId: string, id: string) {
    const a = await this.owned(tenantId, id);
    await this.runs
      .updateMany(
        { automationId: a._id, status: 'active' },
        {
          $set: {
            status: 'exited',
            exitReason: 'deleted',
            finishedAt: new Date(),
          },
        },
      )
      .exec();
    await this.automations.deleteOne({ _id: a._id }).exec();
    return { deleted: true };
  }

  /** Saca a un contacto de la secuencia a mano. */
  async exitRun(tenantId: string, runId: string) {
    if (!Types.ObjectId.isValid(runId))
      throw new NotFoundException('Ejecución no encontrada');
    const res = await this.runs
      .updateOne(
        {
          _id: new Types.ObjectId(runId),
          tenantId: new Types.ObjectId(tenantId),
          status: 'active',
        },
        {
          $set: {
            status: 'exited',
            exitReason: 'paused',
            finishedAt: new Date(),
          },
          $unset: { lockedUntil: '' },
        },
      )
      .exec();
    if (!res.modifiedCount)
      throw new NotFoundException('Ejecución no encontrada o ya terminada');
    return { ok: true };
  }

  private async owned(tenantId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Automatización no encontrada');
    const a = await this.automations
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!a) throw new NotFoundException('Automatización no encontrada');
    return a;
  }

  private validate(input: AutomationInput) {
    const name = input.name?.trim();
    if (!name)
      throw new BadRequestException('Ponle un nombre a la automatización.');
    if (!input.trigger || !TRIGGER_TYPES.includes(input.trigger.type))
      throw new BadRequestException('Elige el disparador.');
    const trigger: AutomationTrigger = {
      type: input.trigger.type,
      ...(input.trigger.formId ? { formId: String(input.trigger.formId) } : {}),
      ...(input.trigger.tag?.trim() ? { tag: input.trigger.tag.trim() } : {}),
      ...(input.trigger.stage?.trim()
        ? { stage: input.trigger.stage.trim() }
        : {}),
      ...(input.trigger.eventId
        ? { eventId: String(input.trigger.eventId) }
        : {}),
      ...(input.trigger.hours
        ? { hours: Math.round(Number(input.trigger.hours)) }
        : {}),
      ...(input.trigger.field?.trim()
        ? { field: input.trigger.field.trim() }
        : {}),
      ...(input.trigger.offsetDays
        ? { offsetDays: Math.round(Number(input.trigger.offsetDays)) }
        : {}),
      ...(input.trigger.campaignId
        ? { campaignId: String(input.trigger.campaignId) }
        : {}),
    };
    const te = triggerError(trigger);
    if (te) throw new BadRequestException(te);
    const raw = Array.isArray(input.steps) ? input.steps : [];
    if (!raw.length) throw new BadRequestException('Añade al menos un paso.');
    if (raw.length > MAX_STEPS)
      throw new BadRequestException(`Máximo ${MAX_STEPS} pasos.`);
    const steps: AutomationStep[] = raw.map((s, i) => {
      if (!s || !STEP_TYPES.includes(s.type as never))
        throw new BadRequestException(`Paso ${i + 1}: tipo no válido.`);
      const step = {
        id: typeof s.id === 'string' && s.id ? s.id : randomUUID(),
      } as AutomationStep;
      for (const k of STEP_KEYS) {
        const v = s[k];
        if (v === undefined || v === null || v === '') continue;
        (step as unknown as Record<string, unknown>)[k] =
          typeof v === 'string' ? v.slice(0, 4000) : v;
      }
      for (const k of [
        'minutes',
        'untilHour',
        'hoursBeforeEvent',
        'dueMinutes',
      ] as const)
        if (step[k] !== undefined) step[k] = Number(step[k]);
      const err = stepError(step, i);
      if (err) throw new BadRequestException(err);
      return step;
    });
    let sendWindow: SendWindow | undefined;
    if (input.sendWindow) {
      const from = Number(input.sendWindow.from);
      const to = Number(input.sendWindow.to);
      if (!(from >= 0 && from <= 23 && to >= 1 && to <= 24 && from !== to))
        throw new BadRequestException('El horario de envío no es válido.');
      sendWindow = { from, to };
    }
    return {
      name: name.slice(0, 120),
      trigger,
      steps,
      exitOnReply: input.exitOnReply ?? true,
      sendWindow,
    };
  }

  private async statsFor(
    ids: Types.ObjectId[],
  ): Promise<Map<string, AutomationStats>> {
    const out = new Map<string, AutomationStats>();
    if (!ids.length) return out;
    const rows = await this.runs
      .aggregate<{
        _id: { a: Types.ObjectId; s: string; r?: string };
        n: number;
        replied: number;
      }>([
        { $match: { automationId: { $in: ids } } },
        {
          $group: {
            _id: { a: '$automationId', s: '$status', r: '$exitReason' },
            n: { $sum: 1 },
            replied: { $sum: { $cond: ['$replied', 1, 0] } },
          },
        },
      ])
      .exec();
    for (const r of rows) {
      const k = String(r._id.a);
      const st = out.get(k) ?? emptyStats();
      st.entered += r.n;
      st.replied += r.replied;
      if (r._id.s === 'active') st.active += r.n;
      else if (r._id.s === 'completed') st.completed += r.n;
      else st.exited += r.n;
      out.set(k, st);
    }
    return out;
  }
}

function emptyStats(): AutomationStats {
  return { entered: 0, active: 0, completed: 0, replied: 0, exited: 0 };
}
