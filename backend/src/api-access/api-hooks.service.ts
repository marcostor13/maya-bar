import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createHmac } from 'crypto';
import { Document, Model, Types } from 'mongoose';
import { assertPublicHost } from '../shared/network';
import {
  onAutomationEvent,
  type AutomationEvent,
} from '../automations/automation-bus';
import { MessageEvents } from '../conversations/message-events';
import type { Message } from '../conversations/message.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Customer } from '../customers/customer.schema';
import { Lead } from '../leads/lead.schema';
import { Event } from '../events/event.schema';
import { ContactForm } from '../forms/form.schema';
import { ApiAccess } from './api-access.schema';
import { ApiWebhookService } from './api-webhook.service';

/** Disparadores para Zapier y Make (HU65). */
export const HOOK_EVENTS = [
  'contact.created',
  'form.submitted',
  'lead.stage_changed',
  'message.received',
  'event.registered',
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

const MAX_HOOKS_PER_ACCESS = 50;
const MAX_FAILURES = 20;
const RETRY_DELAYS_MS = [0, 5_000, 30_000];

/** Suscripción REST hook: Zapier/Make la crean al activar un Zap o escenario y la borran al apagarlo. */
@Schema({ collection: 'api_hooks', timestamps: true })
export class ApiHook extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  accessId: Types.ObjectId;

  @Prop({ type: String, required: true })
  event: HookEvent;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: 0 })
  failures: number;

  @Prop()
  lastStatus?: number;

  @Prop()
  lastDeliveredAt?: Date;

  createdAt?: Date;
}
export const ApiHookSchema = SchemaFactory.createForClass(ApiHook);
ApiHookSchema.index({ tenantId: 1, event: 1, active: 1 });

export interface HookView {
  id: string;
  event: HookEvent;
  targetUrl: string;
  active: boolean;
  createdAt?: Date;
}

/** `sha256=` + HMAC-SHA256(sha256hex(clave de API), `<timestamp>.<cuerpo>`). */
export function signHook(keyHash: string, timestamp: string, body: string) {
  return (
    'sha256=' +
    createHmac('sha256', keyHash).update(`${timestamp}.${body}`).digest('hex')
  );
}

export const contactView = (c: Customer) => ({
  id: String(c._id),
  name: c.name,
  email: c.email ?? null,
  phone: c.phone ?? null,
  tags: c.tags ?? [],
  source: c.source,
  ownerId: c.ownerId ? String(c.ownerId) : null,
  createdAt: (c as unknown as { createdAt?: Date }).createdAt ?? null,
  updatedAt: (c as unknown as { updatedAt?: Date }).updatedAt ?? null,
});

/** Id de una referencia, venga poblada o no. */
const refId = (v: unknown): string | null =>
  v == null
    ? null
    : typeof v === 'object' && '_id' in v
      ? (v._id as Types.ObjectId).toString()
      : (v as Types.ObjectId).toString();

export const leadView = (l: Lead) => ({
  id: String(l._id),
  title: l.title,
  value: l.value ?? 0,
  currency: l.currency,
  stage: l.stage,
  status: l.status,
  source: l.source,
  customerId: refId(l.customerId) ?? '',
  ownerId: refId(l.ownerId),
  tags: l.tags ?? [],
  createdAt: (l as unknown as { createdAt?: Date }).createdAt ?? null,
});

/** Ejemplos de la carga de cada disparador (los piden Zapier y Make para mapear campos). */
export const HOOK_SAMPLES: Record<HookEvent, Record<string, unknown>> = {
  'contact.created': {
    contact: {
      id: '665f1c2e9b1e8a0012345678',
      name: 'Ana Torres',
      email: 'ana@correo.pe',
      phone: '+51987654321',
      tags: ['web'],
      source: 'form',
      ownerId: null,
      createdAt: '2026-11-24T15:00:00.000Z',
      updatedAt: '2026-11-24T15:00:00.000Z',
    },
  },
  'form.submitted': {
    form: { id: '665f1c2e9b1e8a0012340000', name: 'Contacto web' },
    contact: {
      id: '665f1c2e9b1e8a0012345678',
      name: 'Ana Torres',
      email: 'ana@correo.pe',
      phone: '+51987654321',
      tags: ['web'],
      source: 'form',
      ownerId: null,
      createdAt: '2026-11-24T15:00:00.000Z',
      updatedAt: '2026-11-24T15:00:00.000Z',
    },
  },
  'lead.stage_changed': {
    stage: 'propuesta',
    lead: {
      id: '665f1c2e9b1e8a0012349999',
      title: 'Plan anual',
      value: 1200,
      currency: 'PEN',
      stage: 'propuesta',
      status: 'open',
      source: 'api',
      customerId: '665f1c2e9b1e8a0012345678',
      ownerId: null,
      tags: [],
      createdAt: '2026-11-24T15:00:00.000Z',
    },
    contact: {
      id: '665f1c2e9b1e8a0012345678',
      name: 'Ana Torres',
      email: 'ana@correo.pe',
      phone: '+51987654321',
    },
  },
  'message.received': {
    message: {
      id: '665f1c2e9b1e8a0012341111',
      channel: 'whatsapp',
      type: 'text',
      text: 'Hola, quiero información',
      createdAt: '2026-11-24T15:00:00.000Z',
    },
    conversationId: '665f1c2e9b1e8a0012342222',
    contact: {
      id: '665f1c2e9b1e8a0012345678',
      name: 'Ana Torres',
      phone: '+51987654321',
    },
  },
  'event.registered': {
    event: { id: '665f1c2e9b1e8a0012343333', title: 'Lanzamiento 2027' },
    registration: {
      id: '665f1c2e9b1e8a0012344444',
      name: 'Ana Torres',
      email: 'ana@correo.pe',
      phone: '+51987654321',
    },
  },
};

/**
 * REST hooks de la API de integraciones (HU65): suscripción, desuscripción y
 * entrega firmada de los disparadores. Un 410 de Zapier/Make borra la suscripción.
 */
@Injectable()
export class ApiHooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiHooksService.name);
  private off?: () => void;

  constructor(
    @InjectModel(ApiHook.name) private hooks: Model<ApiHook>,
    @InjectModel(ApiAccess.name) private accesses: Model<ApiAccess>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(Event.name) private events: Model<Event>,
    @InjectModel(ContactForm.name) private forms: Model<ContactForm>,
    @InjectModel(Conversation.name) private conversations: Model<Conversation>,
    private webhook: ApiWebhookService,
    private messageEvents: MessageEvents,
  ) {}

  onModuleInit() {
    this.off = onAutomationEvent(
      (e) =>
        void this.onBus(e).catch((err: Error) =>
          this.logger.warn(`Hook ${e.type}: ${err.message}`),
        ),
    );
    this.messageEvents.on((kind, tenantId, msg) => {
      if (kind === 'created' && msg.direction === 'in')
        void this.onInbound(tenantId, msg).catch((err: Error) =>
          this.logger.warn(`Hook message.received: ${err.message}`),
        );
    });
  }

  onModuleDestroy() {
    this.off?.();
  }

  // ── Suscripciones ──────────────────────────────────────────────────────

  async subscribe(
    access: ApiAccess,
    event: string,
    targetUrl: string,
  ): Promise<HookView> {
    if (!HOOK_EVENTS.includes(event as HookEvent))
      throw new BadRequestException(
        `Evento no válido. Usa uno de: ${HOOK_EVENTS.join(', ')}`,
      );
    const url = await this.checkUrl(targetUrl);
    const count = await this.hooks
      .countDocuments({ accessId: access._id, active: true })
      .exec();
    if (count >= MAX_HOOKS_PER_ACCESS)
      throw new BadRequestException(
        `Máximo ${MAX_HOOKS_PER_ACCESS} suscripciones por clave`,
      );
    const doc = await this.hooks.create({
      tenantId: access.tenantId,
      accessId: access._id,
      event: event as HookEvent,
      targetUrl: url,
    });
    return this.view(doc);
  }

  async unsubscribe(access: ApiAccess, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Suscripción no encontrada');
    const res = await this.hooks
      .deleteOne({ _id: id, accessId: access._id })
      .exec();
    if (!res.deletedCount)
      throw new NotFoundException('Suscripción no encontrada');
    return { deleted: true };
  }

  async list(access: ApiAccess): Promise<HookView[]> {
    const docs = await this.hooks
      .find({ accessId: access._id })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.view(d));
  }

  private view(d: ApiHook): HookView {
    return {
      id: String(d._id),
      event: d.event,
      targetUrl: d.targetUrl,
      active: d.active,
      createdAt: d.createdAt,
    };
  }

  private async checkUrl(raw: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(String(raw ?? '').trim());
    } catch {
      throw new BadRequestException('targetUrl no es una URL válida');
    }
    if (url.protocol !== 'https:')
      throw new BadRequestException('targetUrl debe ser https');
    if (url.username || url.password)
      throw new BadRequestException(
        'targetUrl no puede llevar usuario ni contraseña',
      );
    try {
      await assertPublicHost(url.hostname);
    } catch {
      throw new BadRequestException(
        'targetUrl no apunta a una dirección pública',
      );
    }
    return url.toString();
  }

  // ── Disparadores ───────────────────────────────────────────────────────

  private async onBus(e: AutomationEvent) {
    if (e.type === 'contact_created') {
      const c = await this.customers
        .findOne({
          _id: e.customerId,
          tenantId: new Types.ObjectId(e.tenantId),
        })
        .exec();
      if (c)
        await this.dispatch(e.tenantId, 'contact.created', {
          contact: contactView(c),
        });
    } else if (e.type === 'form_submitted') {
      const [c, f] = await Promise.all([
        this.customers
          .findOne({
            _id: e.customerId,
            tenantId: new Types.ObjectId(e.tenantId),
          })
          .exec(),
        Types.ObjectId.isValid(e.formId)
          ? this.forms
              .findById(e.formId)
              .select('name')
              .lean<{ _id: Types.ObjectId; name?: string }>()
              .exec()
          : null,
      ]);
      if (c)
        await this.dispatch(e.tenantId, 'form.submitted', {
          form: { id: e.formId, name: f?.name ?? null },
          contact: contactView(c),
        });
    } else if (e.type === 'stage_changed') {
      const l = await this.leads
        .findOne({ _id: e.leadId, tenantId: new Types.ObjectId(e.tenantId) })
        .exec();
      if (!l) return;
      const c = await this.customers
        .findById(l.customerId)
        .select('name email phone')
        .lean<{
          _id: Types.ObjectId;
          name: string;
          email?: string;
          phone?: string;
        }>()
        .exec();
      await this.dispatch(e.tenantId, 'lead.stage_changed', {
        stage: e.stage,
        lead: leadView(l),
        contact: c
          ? {
              id: String(c._id),
              name: c.name,
              email: c.email ?? null,
              phone: c.phone ?? null,
            }
          : null,
      });
    } else if (e.type === 'event_registered') {
      const ev = Types.ObjectId.isValid(e.eventId)
        ? await this.events
            .findById(e.eventId)
            .select('title')
            .lean<{ title?: string }>()
            .exec()
        : null;
      await this.dispatch(e.tenantId, 'event.registered', {
        event: { id: e.eventId, title: ev?.title ?? null },
        registration: {
          id: e.registrationId,
          name: e.name,
          email: e.email ?? null,
          phone: e.phone ?? null,
        },
      });
    }
  }

  private async onInbound(tenantId: string, msg: Message) {
    if (
      !(await this.hooks.exists({
        tenantId: new Types.ObjectId(tenantId),
        event: 'message.received',
        active: true,
      }))
    )
      return;
    const conv = await this.conversations
      .findById(msg.conversationId)
      .select('channel contact contactName customerId')
      .lean<{
        channel: string;
        contact: string;
        contactName?: string;
        customerId?: Types.ObjectId;
      }>()
      .exec();
    await this.dispatch(tenantId, 'message.received', {
      message: {
        id: String(msg._id),
        channel: conv?.channel ?? null,
        type: (msg as unknown as { type?: string }).type ?? 'text',
        text: (msg as unknown as { text?: string }).text ?? '',
        createdAt:
          (msg as unknown as { createdAt?: Date }).createdAt ?? new Date(),
      },
      conversationId: String(msg.conversationId),
      contact: {
        id: conv?.customerId ? String(conv.customerId) : null,
        name: conv?.contactName ?? null,
        phone: conv?.contact ?? null,
      },
    });
  }

  /** Entrega a cada suscripción de la empresa para ese evento. Nunca bloquea al emisor. */
  async dispatch(
    tenantId: string,
    event: HookEvent,
    data: Record<string, unknown>,
  ) {
    const subs = await this.hooks
      .find({ tenantId: new Types.ObjectId(tenantId), event, active: true })
      .exec();
    if (!subs.length) return 0;
    const occurredAt = new Date().toISOString();
    await Promise.all(
      subs.map((h) =>
        this.deliver(h, {
          id: `${String(h._id)}-${Date.now()}`,
          event,
          occurredAt,
          data,
        }),
      ),
    );
    return subs.length;
  }

  private async deliver(
    hook: ApiHook,
    payload: Record<string, unknown>,
    attempt = 0,
  ): Promise<void> {
    const access = await this.accesses
      .findById(hook.accessId)
      .select('keyHash revokedAt')
      .lean<{ keyHash: string; revokedAt?: Date }>()
      .exec();
    if (!access || access.revokedAt) {
      await this.hooks
        .updateOne({ _id: hook._id }, { $set: { active: false } })
        .exec();
      return;
    }
    const body = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    let status = 0;
    try {
      ({ status } = await this.webhook.post(hook.targetUrl, body, {
        'Content-Type': 'application/json',
        'User-Agent': 'MayaCRM-Hooks/1.0',
        'X-Maya-Event': String(payload.event),
        'X-Maya-Timestamp': ts,
        'X-Maya-Signature': signHook(access.keyHash, ts, body),
      }));
    } catch (err) {
      this.logger.warn(`Hook ${String(hook._id)}: ${(err as Error).message}`);
    }
    if (status === 410) {
      // Convención de REST hooks: el receptor ya no existe.
      await this.hooks.deleteOne({ _id: hook._id }).exec();
      return;
    }
    if (status >= 200 && status < 300) {
      await this.hooks
        .updateOne(
          { _id: hook._id },
          {
            $set: {
              lastStatus: status,
              lastDeliveredAt: new Date(),
              failures: 0,
            },
          },
        )
        .exec();
      return;
    }
    const failures = (hook.failures ?? 0) + 1;
    hook.failures = failures;
    await this.hooks
      .updateOne(
        { _id: hook._id },
        {
          $set: {
            lastStatus: status || undefined,
            failures,
            ...(failures >= MAX_FAILURES ? { active: false } : {}),
          },
        },
      )
      .exec();
    const next = RETRY_DELAYS_MS[attempt + 1];
    if (next !== undefined && failures < MAX_FAILURES)
      setTimeout(
        () =>
          void this.deliver(hook, payload, attempt + 1).catch(() => undefined),
        next,
      ).unref();
  }
}
