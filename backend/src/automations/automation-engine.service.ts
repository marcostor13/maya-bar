import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac } from 'crypto';
import { Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { ContactActivity } from '../customers/contact-activity.schema';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { MessageEvents } from '../conversations/message-events';
import { WINDOW_MS } from '../conversations/wa-window';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';
import { WaTemplate } from '../whatsapp-templates/wa-template.schema';
import { resolveTemplateSend } from '../whatsapp-templates/template-send';
import { SuppressionService } from '../suppression/suppression.service';
import { SmsService } from '../sms/sms.service';
import { ResendService } from '../resend/resend.service';
import { MailService } from '../mail/mail.service';
import {
  CampaignSenderService,
  plainEmailHtml,
  withUnsubscribeFooter,
} from '../campaigns/campaign-sender.service';
import {
  fillTokensHtml,
  fillTokensMultiline,
  usesToken,
  type TokenSource,
} from '../shared/contact-tokens';
import { assertPublicUrl } from '../prospecting/prospecting-sources';
import { Tenant } from '../tenants/tenant.schema';
import { Event as EventEntity } from '../events/event.schema';
import { LeadStagesService } from '../leads/lead-stages.service';
import { onAutomationEvent, type AutomationEvent } from './automation-bus';
import {
  Automation,
  AutomationRun,
  type ExitReason,
  type RunLogEntry,
} from './automation.schema';
import {
  SEND_STEPS,
  monthDay,
  waitUntil,
  withinWindow,
  type AutomationStep,
} from './automation-steps';

const LOCK_MS = 2 * 60_000;
const BATCH = 50;
/** Pasos seguidos sin espera que ejecuta una pasada (corta bucles mal armados). */
const MAX_STEPS_PER_PASS = 25;
const MAX_LOG = 100;

type StepOutcome =
  | {
      kind: 'next';
      result: RunLogEntry['result'];
      detail?: string;
      skip?: number;
    }
  | { kind: 'wait'; until: Date; detail?: string }
  | { kind: 'exit'; reason: ExitReason; detail?: string };

/**
 * Motor de automatizaciones (HU58): inscribe contactos cuando ocurre un
 * disparador y ejecuta sus pasos en segundo plano. Todo el estado vive en
 * `automation_runs`; cada ejecución se toma con un candado atómico, así que
 * un reinicio o dos réplicas no la ejecutan dos veces.
 */
@Injectable()
export class AutomationEngineService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AutomationEngineService.name);
  private running = false;
  private stopping = false;
  private off?: () => void;
  /** Reloj inyectable para las pruebas (reloj simulado). */
  clock: () => Date = () => new Date();

  constructor(
    @InjectModel(Automation.name) private automations: Model<Automation>,
    @InjectModel(AutomationRun.name) private runs: Model<AutomationRun>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(ContactActivity.name)
    private contactActivities: Model<ContactActivity>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(LeadActivity.name) private leadActivities: Model<LeadActivity>,
    @InjectModel(Conversation.name) private convs: Model<Conversation>,
    @InjectModel(Message.name) private msgs: Model<Message>,
    @InjectModel(WhatsAppAccount.name)
    private waAccounts: Model<WhatsAppAccount>,
    @InjectModel(WaTemplate.name) private waTemplates: Model<WaTemplate>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(EventEntity.name) private events: Model<EventEntity>,
    private conversations: ConversationsService,
    private messageEvents: MessageEvents,
    private suppression: SuppressionService,
    private sms: SmsService,
    private resend: ResendService,
    private mail: MailService,
    private campaignSender: CampaignSenderService,
    private stages: LeadStagesService,
  ) {}

  onModuleInit() {
    this.off = onAutomationEvent((e) => {
      void this.onEvent(e).catch((err) =>
        this.logger.error(`Disparador ${e.type}: ${String(err)}`),
      );
    });
    this.messageEvents.on((kind, tenantId, msg) => {
      if (kind !== 'created' || msg.direction !== 'in') return;
      void this.onInbound(tenantId, msg).catch((err) =>
        this.logger.error(`Respuesta entrante: ${String(err)}`),
      );
    });
  }

  onApplicationShutdown() {
    this.stopping = true;
    this.off?.();
  }

  // ── Disparadores ───────────────────────────────────────────────────────

  async onEvent(e: AutomationEvent): Promise<void> {
    if (!Types.ObjectId.isValid(e.tenantId) || e.type === 'lead_created')
      return;
    const tenantId = new Types.ObjectId(e.tenantId);
    const rules = await this.automations
      .find({
        tenantId,
        active: true,
        'trigger.type': e.type === 'score_changed' ? 'score_reached' : e.type,
      })
      .lean()
      .exec();
    if (e.type === 'stage_changed') await this.exitLeftRule(e);
    if (!rules.length) return;

    switch (e.type) {
      case 'form_submitted':
      case 'contact_created':
        for (const r of rules)
          if (
            e.type !== 'form_submitted' ||
            !r.trigger.formId ||
            r.trigger.formId === e.formId
          )
            await this.enroll(
              r,
              e.customerId,
              e.type === 'form_submitted' ? { formId: e.formId } : {},
            );
        return;
      case 'tag_added':
        for (const r of rules) {
          if (!r.trigger.tag || !e.tags.includes(r.trigger.tag)) continue;
          for (const id of e.customerIds) await this.enroll(r, id, {});
        }
        return;
      case 'email_opened':
      case 'email_clicked':
        for (const r of rules)
          if (!r.trigger.campaignId || r.trigger.campaignId === e.campaignId)
            await this.enroll(r, e.customerId, {
              campaignId: e.campaignId,
              ...(e.url ? { url: e.url } : {}),
            });
        return;
      case 'score_changed':
        // Solo al cruzar el umbral hacia arriba, no en cada recálculo.
        for (const r of rules) {
          const min = r.trigger.minScore ?? 0;
          if (min > 0 && e.score >= min && e.previous < min)
            await this.enroll(r, e.customerId, {});
        }
        return;
      case 'stage_changed':
        for (const r of rules)
          if (r.trigger.stage === e.stage)
            await this.enroll(r, e.customerId, { leadId: e.leadId });
        return;
      case 'event_registered': {
        const matching = rules.filter(
          (r) => !r.trigger.eventId || r.trigger.eventId === e.eventId,
        );
        if (!matching.length) return;
        const customerId = await this.customerForRegistration(e);
        if (!customerId) return;
        for (const r of matching)
          await this.enroll(r, customerId, {
            eventId: e.eventId,
            registrationId: e.registrationId,
          });
        return;
      }
    }
  }

  /** Registro a un evento: el contacto por email o teléfono, o uno nuevo. */
  private async customerForRegistration(
    e: Extract<AutomationEvent, { type: 'event_registered' }>,
  ): Promise<string | null> {
    const tenantId = new Types.ObjectId(e.tenantId);
    const email = e.email?.toLowerCase().trim();
    const or: Record<string, unknown>[] = [];
    if (email) or.push({ email });
    if (e.phone) or.push({ phone: e.phone });
    if (!or.length) return null;
    const found = await this.customers
      .findOne({ tenantId, $or: or })
      .select('_id')
      .lean()
      .exec();
    if (found) return String(found._id);
    try {
      const c = await this.customers.create({
        tenantId,
        name: e.name || email || e.phone,
        email,
        phone: e.phone,
        source: 'event',
        tags: [],
      });
      return String(c._id);
    } catch {
      const again = await this.customers
        .findOne({ tenantId, $or: or })
        .select('_id')
        .lean()
        .exec();
      return again ? String(again._id) : null;
    }
  }

  /**
   * Inscribe al contacto. Idempotente: el índice único parcial impide una
   * segunda ejecución activa del mismo contacto en la misma regla.
   */
  async enroll(
    rule: Pick<Automation, '_id' | 'tenantId'>,
    customerId: string,
    context: AutomationRun['context'],
    now = this.clock(),
  ): Promise<AutomationRun | null> {
    if (!Types.ObjectId.isValid(customerId)) return null;
    const customer = await this.customers
      .findOne({ _id: new Types.ObjectId(customerId), tenantId: rule.tenantId })
      .select('_id')
      .lean()
      .exec();
    if (!customer) return null;
    try {
      const run = await this.runs.create({
        tenantId: rule.tenantId,
        automationId: rule._id,
        customerId: customer._id,
        status: 'active',
        stepIndex: 0,
        nextAt: now,
        enrolledAt: now,
        context,
      });
      // El primer paso sale ya, sin esperar a la siguiente pasada.
      void this.process(run._id, now).catch((err) =>
        this.logger.error(`Ejecución ${String(run._id)}: ${String(err)}`),
      );
      return run;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
  }

  /** Respuesta del contacto: sale de las reglas con "salir si responde". */
  async onInbound(tenantId: string, msg: Message): Promise<void> {
    const conv = await this.convs
      .findById(msg.conversationId)
      .select('customerId')
      .lean()
      .exec();
    if (!conv?.customerId) return;
    const active = await this.runs
      .find({
        tenantId: new Types.ObjectId(tenantId),
        customerId: conv.customerId,
        status: 'active',
      })
      .exec();
    if (!active.length) return;
    const rules = new Map(
      (
        await this.automations
          .find({ _id: { $in: active.map((r) => r.automationId) } })
          .select('exitOnReply')
          .lean()
          .exec()
      ).map((a) => [String(a._id), a]),
    );
    for (const run of active) {
      await this.runs
        .updateOne({ _id: run._id }, { $set: { replied: true } })
        .exec();
      if (rules.get(String(run.automationId))?.exitOnReply)
        await this.finish(
          run._id,
          'exited',
          'replied',
          this.clock(),
          'El contacto respondió',
        );
    }
  }

  /** La oportunidad cambió de etapa: sale de las reglas de la etapa anterior. */
  private async exitLeftRule(
    e: Extract<AutomationEvent, { type: 'stage_changed' }>,
  ) {
    const active = await this.runs
      .find({
        tenantId: new Types.ObjectId(e.tenantId),
        'context.leadId': e.leadId,
        status: 'active',
      })
      .exec();
    for (const run of active) {
      const rule = await this.automations
        .findById(run.automationId)
        .select('trigger')
        .lean()
        .exec();
      if (
        rule?.trigger.type === 'stage_changed' &&
        rule.trigger.stage !== e.stage
      )
        await this.finish(
          run._id,
          'exited',
          'left_rule',
          this.clock(),
          'La oportunidad cambió de etapa',
        );
    }
  }

  // ── Worker ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Pasada de automatizaciones: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /** Una pasada: ejecuta todo lo vencido a `now`. Público para el reloj simulado. */
  async tick(now = this.clock()): Promise<number> {
    let done = 0;
    for (;;) {
      const due = await this.runs
        .find({
          status: 'active',
          nextAt: { $lte: now },
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lt: now } },
          ],
        })
        .sort({ nextAt: 1 })
        .limit(BATCH)
        .select('_id')
        .lean()
        .exec();
      if (!due.length) break;
      for (const r of due) if (await this.process(r._id, now)) done++;
      if (due.length < BATCH || this.stopping) break;
    }
    return done;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepTimeTriggers(): Promise<void> {
    if (this.stopping) return;
    await this.scanNoReply().catch((e) =>
      this.logger.error(`Sin respuesta: ${String(e)}`),
    );
    await this.scanDateFields().catch((e) =>
      this.logger.error(`Fechas: ${String(e)}`),
    );
  }

  /** "Sin respuesta en X horas": último mensaje saliente y viejo, sin entrante después. */
  async scanNoReply(now = this.clock()): Promise<void> {
    const rules = await this.automations
      .find({ active: true, 'trigger.type': 'no_reply' })
      .lean()
      .exec();
    for (const r of rules) {
      const hours = r.trigger.hours ?? 24;
      const cutoff = new Date(now.getTime() - hours * 3600_000);
      // Solo las que cruzaron el umbral en el último día: evita reinscribir viejas.
      const convs = await this.convs
        .find({
          tenantId: r.tenantId,
          customerId: { $exists: true },
          lastMessageDirection: 'out',
          lastMessageAt: {
            $lte: cutoff,
            $gt: new Date(cutoff.getTime() - 24 * 3600_000),
          },
        })
        .select('customerId')
        .limit(500)
        .lean()
        .exec();
      for (const c of convs) {
        const already = await this.runs.exists({
          automationId: r._id,
          customerId: c.customerId,
          enrolledAt: { $gte: cutoff },
        });
        if (!already)
          await this.enroll(
            r,
            String(c.customerId),
            { conversationId: String(c._id) },
            now,
          );
      }
    }
  }

  /** Fecha de un campo (cumpleaños…): una vez al año, el día que toca. */
  async scanDateFields(now = this.clock()): Promise<void> {
    const rules = await this.automations
      .find({ active: true, 'trigger.type': 'date_field' })
      .lean()
      .exec();
    for (const r of rules) {
      const field = r.trigger.field!;
      // Hoy + desfase: con −3 se avisa 3 días antes del cumpleaños.
      const target = new Date(
        now.getTime() - (r.trigger.offsetDays ?? 0) * 86400_000 - 5 * 3600_000,
      );
      const md = target.toISOString().slice(5, 10);
      const yearStart = new Date(now.getTime() - 300 * 86400_000);
      const cursor = this.customers
        .find({
          tenantId: r.tenantId,
          [`customFields.${field}`]: { $exists: true },
        })
        .select(`_id customFields.${field}`)
        .lean()
        .cursor();
      for await (const c of cursor) {
        if (monthDay((c.customFields ?? {})[field]) !== md) continue;
        const already = await this.runs.exists({
          automationId: r._id,
          customerId: c._id,
          enrolledAt: { $gte: yearStart },
        });
        if (!already) await this.enroll(r, String(c._id), {}, now);
      }
    }
  }

  /** Toma la ejecución con candado y avanza hasta la próxima espera o el final. */
  async process(id: Types.ObjectId, now = this.clock()): Promise<boolean> {
    const run = await this.runs
      .findOneAndUpdate(
        {
          _id: id,
          status: 'active',
          nextAt: { $lte: now },
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lt: new Date() } },
          ],
        },
        { $set: { lockedUntil: new Date(Date.now() + LOCK_MS) } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!run) return false;
    try {
      const rule = await this.automations
        .findById(run.automationId)
        .lean()
        .exec();
      if (!rule) {
        await this.finish(
          run._id,
          'exited',
          'deleted',
          now,
          'Se borró la automatización',
        );
        return true;
      }
      if (!rule.active) {
        // En pausa: se queda donde está y se revisa en una hora.
        await this.runs
          .updateOne(
            { _id: run._id },
            {
              $set: { nextAt: new Date(now.getTime() + 3600_000) },
              $unset: { lockedUntil: '' },
            },
          )
          .exec();
        return true;
      }
      let index = run.stepIndex;
      const log: RunLogEntry[] = [];
      for (let n = 0; n < MAX_STEPS_PER_PASS; n++) {
        const step = rule.steps[index];
        if (!step) {
          await this.save(run, index, now, log, {
            status: 'completed',
            finishedAt: now,
          });
          return true;
        }
        const customer = await this.customers
          .findById(run.customerId)
          .lean()
          .exec();
        if (!customer) {
          await this.save(run, index, now, log, {
            status: 'exited',
            exitReason: 'no_contact',
            finishedAt: now,
          });
          return true;
        }
        const left = this.leftRule(rule, customer);
        if (left) {
          log.push({
            stepId: step.id,
            type: step.type,
            at: now,
            result: 'exit',
            detail: left,
          });
          await this.save(run, index, now, log, {
            status: 'exited',
            exitReason: 'left_rule',
            finishedAt: now,
          });
          return true;
        }
        // Horario de envío: un envío fuera de hora espera al inicio del horario.
        if (SEND_STEPS.includes(step.type)) {
          const at = withinWindow(now, rule.sendWindow);
          if (at > now) {
            await this.save(run, index, at, log, {});
            return true;
          }
        }
        let out: StepOutcome;
        try {
          out = await this.runStep(rule, run, step, customer, now);
        } catch (err) {
          out = {
            kind: 'next',
            result: 'failed',
            detail: (err instanceof Error ? err.message : String(err)).slice(
              0,
              300,
            ),
          };
        }
        if (out.kind === 'wait') {
          // La espera queda cumplida al llegar su hora: se reanuda en el paso siguiente.
          log.push({
            stepId: step.id,
            type: step.type,
            at: now,
            result: 'ok',
            detail: out.detail,
          });
          await this.save(run, index + 1, out.until, log, {});
          if (out.until > now) return true;
          index += 1;
          continue;
        }
        if (out.kind === 'exit') {
          log.push({
            stepId: step.id,
            type: step.type,
            at: now,
            result: 'exit',
            detail: out.detail,
          });
          await this.save(run, index, now, log, {
            status: 'exited',
            exitReason: out.reason,
            finishedAt: now,
          });
          return true;
        }
        log.push({
          stepId: step.id,
          type: step.type,
          at: now,
          result: out.result,
          detail: out.detail,
        });
        index += 1 + (out.skip ?? 0);
      }
      await this.save(run, index, now, log, {});
      return true;
    } catch (err) {
      this.logger.error(`Ejecución ${String(run._id)}: ${String(err)}`);
      await this.runs
        .updateOne(
          { _id: run._id },
          {
            $unset: { lockedUntil: '' },
            $set: { nextAt: new Date(now.getTime() + 5 * 60_000) },
          },
        )
        .exec();
      return false;
    }
  }

  private async save(
    run: AutomationRun,
    stepIndex: number,
    nextAt: Date,
    log: RunLogEntry[],
    extra: Partial<Pick<AutomationRun, 'status' | 'exitReason' | 'finishedAt'>>,
  ) {
    // Solo si sigue activa: una respuesta entrante pudo sacarla mientras tanto.
    await this.runs
      .updateOne(
        { _id: run._id, status: 'active' },
        {
          $set: { stepIndex, nextAt, ...extra },
          $unset: { lockedUntil: '' },
          ...(log.length
            ? { $push: { log: { $each: log, $slice: -MAX_LOG } } }
            : {}),
        },
      )
      .exec();
  }

  private async finish(
    id: Types.ObjectId,
    status: 'exited' | 'completed',
    reason: ExitReason,
    now: Date,
    detail: string,
  ) {
    await this.runs
      .updateOne(
        { _id: id, status: 'active' },
        {
          $set: { status, exitReason: reason, finishedAt: now },
          $push: {
            log: {
              $each: [{ type: 'exit', at: now, result: 'exit', detail }],
              $slice: -MAX_LOG,
            },
          },
          $unset: { lockedUntil: '' },
        },
      )
      .exec();
  }

  /** Si el contacto ya no cumple la regla por la que entró. */
  private leftRule(rule: Automation, customer: Customer): string | null {
    if (
      rule.trigger.type === 'tag_added' &&
      rule.trigger.tag &&
      !(customer.tags ?? []).includes(rule.trigger.tag)
    )
      return `Ya no tiene la etiqueta "${rule.trigger.tag}"`;
    return null;
  }

  // ── Pasos ──────────────────────────────────────────────────────────────

  private async runStep(
    rule: Automation,
    run: AutomationRun,
    step: AutomationStep,
    customer: Customer,
    now: Date,
  ): Promise<StepOutcome> {
    if (SEND_STEPS.includes(step.type)) {
      const key =
        step.type === 'email'
          ? { email: customer.email }
          : { phone: customer.phone };
      if (
        (key.email || key.phone) &&
        (await this.suppression.isSuppressed(String(rule.tenantId), key))
      )
        return {
          kind: 'exit',
          reason: 'suppressed',
          detail: 'En la lista de no contactar',
        };
    }
    switch (step.type) {
      case 'wait': {
        const eventAt =
          step.hoursBeforeEvent !== undefined
            ? await this.eventStart(run)
            : null;
        const until = waitUntil(step, now, eventAt);
        return { kind: 'wait', until, detail: `Hasta ${until.toISOString()}` };
      }
      case 'whatsapp':
        return this.sendWhatsApp(rule, step, customer);
      case 'email':
        return this.sendEmail(rule, step, customer);
      case 'sms': {
        if (!customer.phone)
          return { kind: 'next', result: 'skipped', detail: 'Sin teléfono' };
        const cfg = await this.sms.findConfig(String(rule.tenantId));
        if (!cfg || !this.sms.isUsable(cfg))
          return {
            kind: 'next',
            result: 'skipped',
            detail: 'SMS no configurado',
          };
        const company = await this.company(rule.tenantId);
        const res = await this.sms.dispatch(
          cfg,
          customer.phone,
          fillTokensMultiline(step.text ?? '', this.tokens(customer), {
            empresa: company,
          }),
        );
        return {
          kind: 'next',
          result: 'ok',
          detail: `SMS ${res.id ?? ''}`.trim(),
        };
      }
      case 'tag':
      case 'untag':
        await this.customers
          .updateOne(
            { _id: customer._id },
            step.type === 'tag'
              ? { $addToSet: { tags: step.tag!.trim() } }
              : { $pull: { tags: step.tag!.trim() } },
          )
          .exec();
        return {
          kind: 'next',
          result: 'ok',
          detail: `${step.type === 'tag' ? '+' : '−'}${step.tag}`,
        };
      case 'stage': {
        const lead = await this.openLead(run, customer);
        if (!lead)
          return {
            kind: 'next',
            result: 'skipped',
            detail: 'Sin oportunidad abierta',
          };
        await this.stages.assertStage(String(rule.tenantId), step.stage!);
        await this.leads
          .updateOne(
            { _id: lead._id },
            { $set: { stage: step.stage, lastActivityAt: now } },
          )
          .exec();
        await this.leadActivities.create({
          tenantId: rule.tenantId,
          leadId: lead._id,
          type: 'stage_change',
          title: `Etapa movida por la automatización "${rule.name}"`,
          at: now,
        });
        return { kind: 'next', result: 'ok', detail: step.stage };
      }
      case 'assign':
        if (!Types.ObjectId.isValid(step.userId ?? ''))
          return {
            kind: 'next',
            result: 'skipped',
            detail: 'Responsable no válido',
          };
        await this.customers
          .updateOne(
            { _id: customer._id },
            {
              $set: {
                ownerId: new Types.ObjectId(step.userId),
                assignedAt: now,
              },
            },
          )
          .exec();
        return { kind: 'next', result: 'ok' };
      case 'reminder': {
        const lead = await this.openLead(run, customer);
        const dueAt = new Date(now.getTime() + (step.dueMinutes ?? 0) * 60_000);
        const title = fillTokensMultiline(
          step.title ?? '',
          this.tokens(customer),
        );
        if (lead)
          await this.leadActivities.create({
            tenantId: rule.tenantId,
            leadId: lead._id,
            type: 'task',
            title,
            dueAt,
            at: now,
          });
        else
          await this.contactActivities.create({
            tenantId: rule.tenantId,
            customerId: customer._id,
            type: 'note',
            title: `Recordatorio: ${title}`,
            at: now,
          });
        return {
          kind: 'next',
          result: 'ok',
          detail: lead ? 'Tarea en la oportunidad' : 'Nota en el contacto',
        };
      }
      case 'webhook':
        return this.callWebhook(rule, run, step, customer, now);
      case 'condition': {
        let ok: boolean;
        const replied =
          run.replied || (await this.repliedSince(customer, run.enrolledAt));
        if (step.condition === 'replied') ok = replied;
        else if (step.condition === 'not_replied') ok = !replied;
        else if (step.condition === 'score_at_least')
          ok = (customer.score ?? 0) >= (step.minScore ?? 0);
        else {
          const has = (customer.tags ?? []).includes(step.tag ?? '');
          ok = step.condition === 'has_tag' ? has : !has;
        }
        if (ok) return { kind: 'next', result: 'ok', detail: 'Se cumple' };
        if (step.otherwise === 'skip_next')
          return {
            kind: 'next',
            result: 'skipped',
            detail: 'No se cumple: salta el siguiente paso',
            skip: 1,
          };
        return {
          kind: 'exit',
          reason: 'condition',
          detail: 'No se cumple la condición',
        };
      }
    }
    return { kind: 'next', result: 'skipped', detail: 'Paso desconocido' };
  }

  private tokens(c: Customer): TokenSource {
    return {
      name: c.name,
      email: c.email,
      phone: c.phone,
      customFields: c.customFields,
    };
  }

  private async company(tenantId: Types.ObjectId): Promise<string> {
    const t = await this.tenants
      .findById(tenantId)
      .select('name')
      .lean()
      .exec();
    return t?.name ?? '';
  }

  private async eventStart(run: AutomationRun): Promise<Date | null> {
    if (!run.context?.eventId || !Types.ObjectId.isValid(run.context.eventId))
      return null;
    const ev = await this.events
      .findById(run.context.eventId)
      .select('date startTime')
      .lean()
      .exec();
    if (!ev?.date) return null;
    const day = new Date(ev.date).toISOString().slice(0, 10);
    const time = /^\d{2}:\d{2}$/.test(ev.startTime ?? '')
      ? ev.startTime
      : '00:00';
    // La hora del evento es local de Lima (UTC−5).
    return new Date(`${day}T${time}:00-05:00`);
  }

  private async openLead(run: AutomationRun, customer: Customer) {
    if (run.context?.leadId && Types.ObjectId.isValid(run.context.leadId)) {
      const l = await this.leads
        .findOne({
          _id: new Types.ObjectId(run.context.leadId),
          status: 'open',
        })
        .select('_id')
        .lean()
        .exec();
      if (l) return l;
    }
    return this.leads
      .findOne({
        tenantId: customer.tenantId,
        customerId: customer._id,
        status: 'open',
      })
      .sort({ updatedAt: -1 })
      .select('_id')
      .lean()
      .exec();
  }

  private async repliedSince(
    customer: Customer,
    since: Date,
  ): Promise<boolean> {
    const convIds = await this.convs
      .find({ tenantId: customer.tenantId, customerId: customer._id })
      .distinct('_id')
      .exec();
    if (!convIds.length) return false;
    return !!(await this.msgs.exists({
      conversationId: { $in: convIds },
      direction: 'in',
      at: { $gte: since },
    }));
  }

  private async sendWhatsApp(
    rule: Automation,
    step: AutomationStep,
    customer: Customer,
  ): Promise<StepOutcome> {
    const phone = (customer.phone ?? '').replace(/\D/g, '');
    if (phone.length < 8)
      return { kind: 'next', result: 'skipped', detail: 'Sin teléfono' };
    const account = await this.waAccounts
      .findOne({
        tenantId: rule.tenantId,
        active: true,
        ...(step.accountId && Types.ObjectId.isValid(step.accountId)
          ? { _id: new Types.ObjectId(step.accountId) }
          : { provider: 'cloudapi' }),
      })
      .lean()
      .exec();
    if (!account)
      return {
        kind: 'next',
        result: 'skipped',
        detail: 'Sin cuenta de WhatsApp activa',
      };
    const conv = await this.convs
      .findOne({ channel: 'whatsapp', accountId: account._id, contact: phone })
      .exec();
    if (conv?.blocked)
      return { kind: 'next', result: 'skipped', detail: 'Contacto bloqueado' };
    let windowOpen = account.provider !== 'cloudapi';
    if (!windowOpen && conv) {
      const last = await this.msgs
        .findOne({ conversationId: conv._id, direction: 'in' })
        .sort({ at: -1 })
        .select('at')
        .lean()
        .exec();
      windowOpen =
        !!last && Date.now() - new Date(last.at).getTime() < WINDOW_MS;
    }
    const company = await this.company(rule.tenantId);
    const tokens = this.tokens(customer);
    if (windowOpen && step.text?.trim()) {
      const text = fillTokensMultiline(step.text, tokens, { empresa: company });
      const r = await this.conversations.sendExternal({
        tenantId: String(rule.tenantId),
        channel: 'whatsapp',
        accountId: String(account._id),
        contact: phone,
        type: 'text',
        text,
        author: 'system',
        customerId: customer._id,
      });
      return r.message.status === 'failed'
        ? {
            kind: 'next',
            result: 'failed',
            detail: r.message.error?.slice(0, 300),
          }
        : { kind: 'next', result: 'ok', detail: 'Texto' };
    }
    if (!step.template?.name)
      return {
        kind: 'next',
        result: 'skipped',
        detail: 'Ventana de 24 h cerrada y sin plantilla',
      };
    const tpl = await this.waTemplates
      .findOne({
        tenantId: rule.tenantId,
        accountId: account._id,
        name: step.template.name,
        ...(step.template.language ? { language: step.template.language } : {}),
      })
      .exec();
    if (!tpl)
      return {
        kind: 'next',
        result: 'failed',
        detail: `No existe la plantilla "${step.template.name}"`,
      };
    const resolved = resolveTemplateSend(tpl, {
      variables: (step.template.variables ?? []).map((v) =>
        fillTokensMultiline(v, tokens, { empresa: company }),
      ),
    });
    const r = await this.conversations.sendExternal({
      tenantId: String(rule.tenantId),
      channel: 'whatsapp',
      accountId: String(account._id),
      contact: phone,
      type: 'text',
      text: resolved.text,
      template: resolved.send,
      author: 'system',
      customerId: customer._id,
    });
    return r.message.status === 'failed'
      ? {
          kind: 'next',
          result: 'failed',
          detail: r.message.error?.slice(0, 300),
        }
      : {
          kind: 'next',
          result: 'ok',
          detail: `Plantilla ${step.template.name}`,
        };
  }

  private async sendEmail(
    rule: Automation,
    step: AutomationStep,
    customer: Customer,
  ): Promise<StepOutcome> {
    if (!customer.email)
      return { kind: 'next', result: 'skipped', detail: 'Sin email' };
    const tenantId = String(rule.tenantId);
    const company = await this.company(rule.tenantId);
    const ctx = {
      empresa: company,
      baja: this.campaignSender.unsubscribeUrl(tenantId, customer.email),
    };
    const tokens = this.tokens(customer);
    const body = step.text ?? '';
    const html = fillTokensHtml(
      withUnsubscribeFooter(plainEmailHtml(body), usesToken(body, 'baja')),
      tokens,
      ctx,
    );
    const text = fillTokensMultiline(body, tokens, ctx);
    const subject = fillTokensMultiline(
      step.subject ?? '',
      tokens,
      ctx,
    ).replace(/\s+/g, ' ');
    const headers = {
      'List-Unsubscribe': `<${ctx.baja}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
    const mailer = await this.resend.mailer(tenantId).catch(() => null);
    const id = mailer
      ? await mailer.send({ to: customer.email, subject, html, text, headers })
      : await this.mail.sendHtml({
          to: customer.email,
          subject,
          html,
          text,
          fromName: company || undefined,
          headers,
        });
    return { kind: 'next', result: 'ok', detail: `Email ${id ?? ''}`.trim() };
  }

  private async callWebhook(
    rule: Automation,
    run: AutomationRun,
    step: AutomationStep,
    customer: Customer,
    now: Date,
  ): Promise<StepOutcome> {
    const url = await assertPublicUrl(step.url!);
    if (url.protocol !== 'https:')
      return { kind: 'next', result: 'failed', detail: 'Solo https' };
    const body = JSON.stringify({
      event: 'automation.step',
      automation: { id: String(rule._id), name: rule.name },
      runId: String(run._id),
      contact: {
        id: String(customer._id),
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        tags: customer.tags,
      },
      context: run.context,
      at: now.toISOString(),
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', rule.webhookSecret ?? '')
      .update(`${ts}.${body}`)
      .digest('hex');
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-Maya-Timestamp': ts,
        'X-Maya-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok
      ? { kind: 'next', result: 'ok', detail: `HTTP ${res.status}` }
      : { kind: 'next', result: 'failed', detail: `HTTP ${res.status}` };
  }
}
