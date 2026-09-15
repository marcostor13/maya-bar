import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { SettingsService } from '../settings/settings.service';
import { SuppressionService } from '../suppression/suppression.service';
import {
  RecoveryPlan,
  RecoveryRecipient,
  RecoverySegment,
} from './recovery-plan.schema';
import { RecoveryWorker } from './recovery-worker.service';
import {
  CreateRecoveryPlanDto,
  ScheduleRecoveryDto,
  UpdateRecoveryPlanDto,
} from './dto/recovery.dto';
import {
  DEFAULT_BATCHING,
  SEGMENT_DEFS,
  buildTemplateName,
  firstNameParam,
  isValidTimezone,
  nextBatch,
  usesNameVariable,
  validateTemplateBody,
} from './recovery.helpers';

/** Colores para los segmentos que crea el usuario. */
const CUSTOM_COLORS = ['#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
/** Cada cuánto el cron pregunta a Meta por plantillas aún sin aprobar. */
const TEMPLATE_SYNC_MS = 10 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    @InjectModel(RecoveryPlan.name) private planModel: Model<RecoveryPlan>,
    private worker: RecoveryWorker,
    private templates: WhatsAppTemplatesService,
    private accounts: WhatsAppAccountsService,
    private settings: SettingsService,
    private suppression: SuppressionService,
  ) {}

  findAll(tenantId: string) {
    return this.planModel
      .find(
        { tenantId: new Types.ObjectId(tenantId) },
        // La lista no necesita los destinatarios: solo cuántos hay.
        {
          name: 1,
          status: 1,
          lookbackDays: 1,
          createdAt: 1,
          updatedAt: 1,
          'analysis.total': 1,
          'analysis.processed': 1,
          'analysis.stage': 1,
          'analysis.headline': 1,
          'segments.key': 1,
          'segments.name': 1,
          'segments.color': 1,
          'segments.enabled': 1,
          'segments.sendAt': 1,
          'segments.sendStatus': 1,
          'segments.recipients.sendStatus': 1,
        },
      )
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<RecoveryPlan> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Plan no encontrado');
    const plan = await this.planModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      // Lo usa solo el worker, y puede pesar cientos de entradas.
      .select('-analysisCheckpoint')
      .exec();
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateRecoveryPlanDto,
  ): Promise<RecoveryPlan> {
    const timezone =
      dto.timezone && isValidTimezone(dto.timezone)
        ? dto.timezone
        : 'America/Lima';
    const date = new Date().toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'long',
      timeZone: timezone,
    });
    const plan = await this.planModel.create({
      tenantId: new Types.ObjectId(tenantId),
      createdBy: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : undefined,
      name: dto.name?.trim() || `Recuperación del ${date}`,
      lookbackDays: dto.lookbackDays,
      context: dto.context?.trim() ?? '',
      timezone,
      status: 'analyzing',
      analysisQueuedAt: new Date(),
      analysis: emptyAnalysis(),
    });
    // Se encola y se responde ya: el worker lo toma en segundo plano.
    void this.worker.kick();
    return plan;
  }

  /** Vuelve a analizar con el mismo periodo y contexto; descarta las ediciones. */
  async reanalyze(
    id: string,
    tenantId: string,
    dto: Partial<CreateRecoveryPlanDto>,
  ): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    this.assertEditable(plan);
    if (plan.segments.some((s) => s.templateId))
      throw new BadRequestException(
        'Este plan ya tiene plantillas creadas en Meta. Crea un plan nuevo para volver a analizar.',
      );
    if (dto.lookbackDays) plan.lookbackDays = dto.lookbackDays;
    if (dto.context !== undefined) plan.context = dto.context.trim();
    plan.status = 'analyzing';
    plan.segments = [];
    plan.excluded = [];
    plan.analysis = emptyAnalysis();
    plan.analysisQueuedAt = new Date();
    plan.analysisAttempts = 0;
    plan.analysisLockedUntil = undefined;
    await plan.save();
    // El checkpoint no se cargó (findOne lo excluye): se vacía aparte.
    await this.planModel
      .updateOne({ _id: plan._id }, { $unset: { analysisCheckpoint: 1 } })
      .exec();
    void this.worker.kick();
    return plan;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const plan = await this.findOne(id, tenantId);
    if (plan.status === 'sending' || plan.status === 'scheduled')
      throw new BadRequestException(
        'Cancela la programación antes de eliminar el plan',
      );
    await this.planModel.deleteOne({ _id: plan._id }).exec();
  }

  /**
   * Guarda las ediciones del paso 2. Los destinatarios se reconstruyen desde
   * los que ya tiene el plan (por id de conversación): desde la pantalla se
   * pueden mover o quitar personas, pero no inventarlas.
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateRecoveryPlanDto,
  ): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    if (dto.name?.trim()) plan.name = dto.name.trim();

    if (dto.segments) {
      this.assertEditable(plan);
      const pool = new Map<string, RecoveryRecipient>();
      for (const r of [
        ...plan.segments.flatMap((s) => s.recipients),
        ...plan.excluded,
      ])
        pool.set(r.conversationId, r);

      const used = new Set<string>();
      let customIndex = plan.segments.filter(
        (s) => !SEGMENT_DEFS[s.key],
      ).length;
      const segments: RecoverySegment[] = dto.segments.map((edit) => {
        const existing = plan.segments.find((s) => s.key === edit.key);
        const recipients = edit.recipients
          .filter((cid) => pool.has(cid) && !used.has(cid))
          .map((cid) => {
            used.add(cid);
            return { ...pool.get(cid)!, reason: undefined };
          });
        const base: RecoverySegment = existing ?? {
          key: edit.key,
          name: edit.name,
          description: 'Segmento creado a mano.',
          strategy: '',
          color: CUSTOM_COLORS[customIndex++ % CUSTOM_COLORS.length],
          enabled: true,
          recipients: [],
          message: '',
          ...DEFAULT_BATCHING,
          sendStatus: 'idle',
        };
        return {
          ...base,
          name: edit.name.trim(),
          message: edit.message,
          enabled: edit.enabled,
          recipients,
        };
      });

      // Quien no está en ningún segmento pasa a excluidos.
      plan.excluded = [...pool.values()]
        .filter((r) => !used.has(r.conversationId))
        .map((r) => ({ ...r, reason: r.reason ?? 'Quitado manualmente' }));
      plan.segments = segments;
      plan.markModified('segments');
      plan.markModified('excluded');
    }
    return plan.save();
  }

  /**
   * Encola la reescritura de un mensaje. Con un modelo que razona puede tardar
   * más de lo que aguanta una petición HTTP, así que la hace el worker y la
   * pantalla consulta el resultado en `segments[].rewriteJob`. Pedir otra
   * versión mientras una está en curso la sustituye.
   */
  async requestRewrite(
    id: string,
    tenantId: string,
    key: string,
    instruction?: string,
  ): Promise<{ requestedAt: Date }> {
    const plan = await this.findOne(id, tenantId);
    if (!plan.segments.some((s) => s.key === key))
      throw new NotFoundException('Segmento no encontrado');
    const requestedAt = new Date();
    await this.planModel
      .updateOne(
        { _id: plan._id },
        {
          $set: {
            'segments.$[s].rewriteJob': {
              state: 'pending',
              instruction: instruction?.trim() ?? '',
              requestedAt,
            },
          },
        },
        { arrayFilters: [{ 's.key': key }] },
      )
      .exec();
    void this.worker.kick();
    return { requestedAt };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Paso 3 · Plantillas
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Crea en Meta la plantilla de cada segmento activo, o la edita si el
   * mensaje cambió o fue rechazada. Un fallo en un segmento no frena al resto:
   * queda anotado en `templateError` para mostrarlo en su tarjeta.
   */
  async submitTemplates(id: string, tenantId: string): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    this.assertEditable(plan);
    const active = plan.segments.filter(
      (s) => s.enabled && s.recipients.length,
    );
    if (!active.length)
      throw new BadRequestException(
        'Activa al menos un segmento con destinatarios',
      );
    for (const s of active) {
      const invalid = validateTemplateBody(s.message);
      if (invalid) throw new BadRequestException(`«${s.name}»: ${invalid}`);
    }

    const accountId = await this.resolveAccountId(tenantId, plan);
    plan.accountId = new Types.ObjectId(accountId);

    let failures = 0;
    for (const segment of active) {
      const changed = segment.templateBody !== segment.message;
      const rejected = segment.templateStatus === 'REJECTED';
      if (segment.templateId && !changed && !rejected) continue;

      const payload = {
        category: 'MARKETING' as const,
        body: segment.message,
        bodyExamples: usesNameVariable(segment.message) ? ['María'] : [],
      };
      try {
        const template = segment.templateId
          ? await this.templates.update(tenantId, segment.templateId, payload)
          : await this.templates.create(tenantId, {
              ...payload,
              accountId,
              name: buildTemplateName(segment.key),
              language: plan.language,
              allowCategoryChange: true,
            });
        segment.templateId = String(template._id);
        segment.templateName = template.name;
        segment.templateStatus = template.status;
        segment.templateBody = segment.message;
        segment.rejectedReason = undefined;
        segment.templateError = undefined;
      } catch (err) {
        failures++;
        segment.templateError =
          err instanceof Error ? err.message : String(err);
      }
    }

    plan.status = 'templates';
    plan.markModified('segments');
    await plan.save();
    if (failures === active.length)
      throw new BadRequestException(
        active[0].templateError ?? 'No se pudo crear ninguna plantilla',
      );
    return plan;
  }

  /** Pide a Meta el estado de revisión de las plantillas del plan. */
  async refreshTemplates(id: string, tenantId: string): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    await this.syncTemplateStatus(plan);
    return plan;
  }

  private async syncTemplateStatus(plan: RecoveryPlan): Promise<void> {
    if (!plan.segments.some((s) => s.templateName)) return;
    const synced = await this.templates.sync(
      String(plan.tenantId),
      plan.accountId ? String(plan.accountId) : undefined,
    );
    const byName = new Map(synced.map((t) => [t.name, t]));
    for (const segment of plan.segments) {
      if (!segment.templateName) continue;
      const t = byName.get(segment.templateName);
      if (!t) {
        segment.templateStatus = 'DELETED';
        continue;
      }
      segment.templateId = String(t._id);
      segment.templateStatus = t.status;
      segment.rejectedReason = t.rejectedReason;
    }
    plan.templatesSyncedAt = new Date();
    plan.markModified('segments');
    await plan.save();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Paso 4 · Programación
  // ──────────────────────────────────────────────────────────────────────

  async schedule(
    id: string,
    tenantId: string,
    dto: ScheduleRecoveryDto,
  ): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    if (plan.status === 'sending')
      throw new BadRequestException(
        'El envío ya empezó. Cancélalo para cambiar la programación.',
      );
    if (!['templates', 'scheduled'].includes(plan.status))
      throw new BadRequestException('Primero crea las plantillas del plan');

    let scheduled = 0;
    for (const edit of dto.segments) {
      const segment = plan.segments.find((s) => s.key === edit.key);
      if (!segment || segment.sendStatus === 'done') continue;
      Object.assign(segment, {
        firstBatchSize: edit.firstBatchSize,
        firstPauseMinutes: edit.firstPauseMinutes,
        batchSize: edit.batchSize,
        batchIntervalMinutes: edit.batchIntervalMinutes,
      });
      if (!edit.enabled || !segment.enabled || !segment.recipients.length) {
        segment.sendStatus = 'idle';
        continue;
      }
      if (!segment.templateId)
        throw new BadRequestException(`«${segment.name}» no tiene plantilla`);
      if (segment.templateBody !== segment.message)
        throw new BadRequestException(
          `El mensaje de «${segment.name}» cambió: vuelve a enviarlo a Meta`,
        );
      if (
        ['REJECTED', 'DELETED', 'DISABLED'].includes(
          segment.templateStatus ?? '',
        )
      )
        throw new BadRequestException(
          `La plantilla de «${segment.name}» no se puede usar (${segment.templateStatus})`,
        );
      if (!edit.sendAt)
        throw new BadRequestException(
          `Elige fecha y hora para «${segment.name}»`,
        );
      const sendAt = new Date(edit.sendAt);
      if (sendAt.getTime() < Date.now() - 2 * 60_000)
        throw new BadRequestException(`La fecha de «${segment.name}» ya pasó`);
      segment.sendAt = sendAt;
      segment.nextBatchAt = undefined;
      segment.sendError = undefined;
      segment.sendStatus = 'scheduled';
      scheduled++;
    }
    if (!scheduled)
      throw new BadRequestException('Programa al menos un segmento');

    plan.status = 'scheduled';
    plan.markModified('segments');
    return plan.save();
  }

  /** Detiene lo pendiente. Lo ya enviado queda enviado. */
  async cancel(id: string, tenantId: string): Promise<RecoveryPlan> {
    const plan = await this.findOne(id, tenantId);
    for (const s of plan.segments)
      if (s.sendStatus !== 'done') {
        s.sendStatus = 'idle';
        s.nextBatchAt = undefined;
      }
    plan.status =
      plan.segments.every((s) => s.sendStatus === 'done' || !s.enabled) &&
      plan.segments.some((s) => s.sendStatus === 'done')
        ? 'done'
        : 'templates';
    plan.markModified('segments');
    return plan.save();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Envío
  // ──────────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const plans = await this.planModel
      .find({ status: { $in: ['scheduled', 'sending'] } }, { _id: 1 })
      .lean()
      .exec();
    for (const { _id } of plans) {
      // Candado atómico: si otra instancia ya tomó el plan, se salta.
      const now = new Date();
      const plan = await this.planModel
        .findOneAndUpdate(
          {
            _id,
            $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
          },
          { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
          { new: true },
        )
        .exec();
      if (!plan) continue;
      try {
        await this.processPlan(plan);
      } catch (err) {
        this.logger.error(
          `Envío del plan ${String(_id)} falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        await this.planModel
          .updateOne({ _id }, { $unset: { lockedUntil: 1 } })
          .exec();
      }
    }
  }

  private async processPlan(plan: RecoveryPlan): Promise<void> {
    const now = new Date();
    const tenantId = String(plan.tenantId);
    const due = plan.segments.filter(
      (s) =>
        (s.sendStatus === 'scheduled' || s.sendStatus === 'sending') &&
        (s.nextBatchAt ?? s.sendAt) &&
        new Date((s.nextBatchAt ?? s.sendAt)!) <= now,
    );
    if (!due.length) return;

    // La aprobación de Meta llega sola: si alguna plantilla aún no está
    // aprobada, se refresca el estado (como mucho cada diez minutos).
    const unapproved = due.some((s) => s.templateStatus !== 'APPROVED');
    const syncedAt = plan.templatesSyncedAt?.getTime() ?? 0;
    if (unapproved && now.getTime() - syncedAt > TEMPLATE_SYNC_MS) {
      try {
        await this.syncTemplateStatus(plan);
      } catch (err) {
        this.logger.warn(`No se pudo sincronizar plantillas: ${String(err)}`);
      }
    }

    const suppressed = await this.suppression.setFor(tenantId);
    for (const segment of due) {
      if (segment.templateStatus !== 'APPROVED') {
        if (
          ['REJECTED', 'DELETED', 'DISABLED', 'PAUSED'].includes(
            segment.templateStatus ?? '',
          )
        ) {
          segment.sendStatus = 'paused';
          segment.sendError = `La plantilla está ${segment.templateStatus}: no se envió nada`;
        } else {
          segment.sendError = 'Esperando la aprobación de Meta para empezar';
        }
        continue;
      }

      segment.sendStatus = 'sending';
      segment.sendError = undefined;
      const { batch, nextAt, last } = nextBatch(segment, now);
      for (const r of batch) {
        if (this.suppression.matches(suppressed, { phone: r.phone })) {
          r.sendStatus = 'skipped';
          r.error = 'En la lista de no contactar';
          continue;
        }
        try {
          await this.settings.sendWhatsAppTemplate(
            r.phone,
            segment.templateName!,
            plan.language,
            usesNameVariable(segment.message) ? [firstNameParam(r.name)] : [],
            tenantId,
          );
          r.sendStatus = 'sent';
          r.sentAt = new Date();
          r.error = undefined;
        } catch (err) {
          r.sendStatus = 'failed';
          r.error = err instanceof Error ? err.message : String(err);
        }
      }
      if (last) {
        segment.sendStatus = 'done';
        segment.nextBatchAt = undefined;
      } else {
        segment.nextBatchAt = nextAt;
      }
    }

    const active = plan.segments.filter((s) => s.sendStatus !== 'idle');
    plan.status = active.every(
      (s) => s.sendStatus === 'done' || s.sendStatus === 'paused',
    )
      ? 'done'
      : active.some(
            (s) =>
              s.sendStatus === 'sending' ||
              s.recipients.some(
                (r) => r.sendStatus && r.sendStatus !== 'pending',
              ),
          )
        ? 'sending'
        : 'scheduled';
    plan.markModified('segments');
    await plan.save();
  }

  // ──────────────────────────────────────────────────────────────────────

  private assertEditable(plan: RecoveryPlan) {
    if (plan.status === 'analyzing')
      throw new BadRequestException('El análisis todavía está en curso');
    if (['scheduled', 'sending', 'done'].includes(plan.status))
      throw new BadRequestException(
        'El envío ya está programado. Cancélalo para hacer cambios.',
      );
  }

  private async resolveAccountId(
    tenantId: string,
    plan: RecoveryPlan,
  ): Promise<string> {
    if (plan.accountId) return String(plan.accountId);
    const account = await this.accounts.getDefault(tenantId);
    if (!account)
      throw new BadRequestException(
        'No hay ninguna cuenta de WhatsApp configurada. Añádela en Configuración → WhatsApp.',
      );
    if (account.provider !== 'cloudapi')
      throw new BadRequestException(
        'La recuperación envía plantillas, y las plantillas solo existen en WhatsApp Cloud API. Configura una cuenta Cloud API como predeterminada.',
      );
    return String(account._id);
  }
}

function emptyAnalysis() {
  return {
    total: 0,
    processed: 0,
    headline: '',
    summary: '',
    insights: [],
    hourHistogram: [],
    insideWindow: 0,
    stage: 'queued' as const,
  };
}
