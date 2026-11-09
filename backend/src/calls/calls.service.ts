import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Call, CallDirection, CallStatus, FINAL_STATUSES } from './call.schema';
import { CallPermission } from './call-permission.schema';
import { CallsMetaService, MetaCallingSettings } from './calls-meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import {
  CallingPrefs,
  DEFAULT_CALLING_PREFS,
  WhatsAppAccount,
} from '../whatsapp-accounts/whatsapp-account.schema';
import { ConversationsGateway } from '../conversations/conversations.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import { BlockedContactsService } from '../conversations/blocked-contacts.service';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { LeadsService } from '../leads/leads.service';
import { ContactActivity } from '../customers/contact-activity.schema';
import { User } from '../users/user.schema';
import { maskPhone } from '../shared/meta-signature';

/** Barrido de llamadas que se quedaron sonando (reinicios, varias instancias). */
const SWEEP_MS = 15_000;
/** Una reserva que nunca llegó a aceptarse (navegador cerrado) se da por fallida. */
const STALE_CONNECTING_MS = 90_000;

const PERMISSION_TEXT =
  'Queremos llamarte por WhatsApp para atenderte mejor. ¿Nos das permiso?';

export interface IncomingCallEvent {
  id: string;
  contact: string;
  contactName?: string;
  sdp?: string;
  timestamp?: string;
}

export interface TerminateEvent {
  status?: string;
  duration?: number;
  startTime?: string;
  endTime?: string;
  errorCode?: number;
}

export type PermissionStatus =
  | 'none'
  | 'pending'
  | 'granted'
  | 'permanent'
  | 'rejected'
  | 'expired';

export interface PermissionView {
  status: PermissionStatus;
  expiresAt?: string;
  canRequest: boolean;
  canCall: boolean;
}

export interface CallListQuery {
  status?: CallStatus;
  direction?: CallDirection;
  from?: string;
  to?: string;
  userId?: string;
  accountId?: string;
  page?: number;
}

/** Lo que sale por la API y por el socket: nunca el SDP. */
function view(call: Call, accountLabel?: string) {
  return {
    _id: String(call._id),
    accountId: String(call.accountId),
    accountLabel,
    direction: call.direction,
    status: call.status,
    contact: call.contact,
    contactName: call.contactName,
    customerId: call.customerId ? String(call.customerId) : undefined,
    conversationId: call.conversationId
      ? String(call.conversationId)
      : undefined,
    claimedBy: call.claimedBy ? String(call.claimedBy) : undefined,
    answeredBy: call.answeredBy ? String(call.answeredBy) : undefined,
    answeredByName: call.answeredByName,
    startedAt: call.startedAt,
    connectedAt: call.connectedAt,
    endedAt: call.endedAt,
    durationSec: call.durationSec,
    endReason: call.endReason,
  };
}
export type CallView = ReturnType<typeof view>;

/** "3 min 12 s", "45 s". */
export function formatDuration(sec?: number): string {
  if (!sec || sec < 1) return '0 s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

/** Texto del evento en la ficha y en el chat. */
export function callSummary(call: Call): string {
  const dir = call.direction === 'inbound' ? 'entrante' : 'saliente';
  const who = call.answeredByName
    ? ` · ${call.direction === 'inbound' ? 'atendió' : 'llamó'} ${call.answeredByName}`
    : '';
  switch (call.status) {
    case 'completed':
      return `Llamada ${dir} · ${formatDuration(call.durationSec)}${who}`;
    case 'missed':
      return call.direction === 'inbound'
        ? 'Llamada entrante perdida'
        : `Llamada saliente sin respuesta${who}`;
    case 'rejected':
      return call.direction === 'inbound'
        ? 'Llamada entrante rechazada'
        : `Llamada saliente rechazada por el cliente${who}`;
    case 'blocked':
      return 'Llamada entrante rechazada (contacto bloqueado)';
    default:
      return `Llamada ${dir} fallida${who}`;
  }
}

const isFinal = (s: CallStatus) => FINAL_STATUSES.includes(s);

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_ICE: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** JSON con la forma de RTCIceServer[]; si está mal, el STUN por defecto. */
export function parseIceServers(raw?: string): IceServer[] {
  if (!raw?.trim()) return DEFAULT_ICE;
  try {
    const list = JSON.parse(raw) as unknown;
    if (
      Array.isArray(list) &&
      list.every((s) => s && typeof s === 'object' && 'urls' in s)
    )
      return list as IceServer[];
  } catch {
    // JSON inválido: se usa el STUN por defecto.
  }
  return DEFAULT_ICE;
}

/**
 * Llamadas de voz de WhatsApp: estado de cada llamada, reparto del aviso,
 * permisos y registro. El audio no pasa por aquí (ADR 0002).
 */
@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private sweeper?: ReturnType<typeof setInterval>;
  /**
   * Servidores ICE para el navegador. Meta ofrece candidatos públicos, así que
   * basta un STUN; un TURN (redes muy cerradas) se añade con CALLS_ICE_SERVERS.
   */
  private readonly iceServers: IceServer[];

  constructor(
    @InjectModel(Call.name) private callModel: Model<Call>,
    @InjectModel(CallPermission.name) private permModel: Model<CallPermission>,
    @InjectModel(ContactActivity.name)
    private activityModel: Model<ContactActivity>,
    @InjectModel(User.name) private userModel: Model<User>,
    private accounts: WhatsAppAccountsService,
    private meta: CallsMetaService,
    private gateway: ConversationsGateway,
    private conversations: ConversationsService,
    private blocks: BlockedContactsService,
    private push: PushService,
    private nativePush: NativePushService,
    private leads: LeadsService,
    config: ConfigService,
  ) {
    this.iceServers = parseIceServers(config.get<string>('CALLS_ICE_SERVERS'));
  }

  onModuleInit() {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ------------------------------------------------------------------
  // Entrantes
  // ------------------------------------------------------------------

  async onIncoming(account: WhatsAppAccount, ev: IncomingCallEvent) {
    if (await this.callModel.exists({ waCallId: ev.id })) return;
    const tenantId = String(account.tenantId);
    const cfg = this.accounts.toConfig(account);
    const chat = await this.conversations.findWhatsAppChat(
      String(account._id),
      ev.contact,
    );
    const base = {
      tenantId: account.tenantId,
      accountId: account._id,
      waCallId: ev.id,
      direction: 'inbound' as const,
      contact: ev.contact,
      contactName: ev.contactName || chat?.contactName,
      conversationId: chat?._id,
      startedAt: ev.timestamp
        ? new Date(Number(ev.timestamp) * 1000)
        : new Date(),
    };

    if (await this.blocks.isBlocked(tenantId, 'whatsapp', ev.contact)) {
      const call = await this.create({
        ...base,
        status: 'blocked',
        endedAt: new Date(),
        endReason: 'blocked',
        logged: true,
      });
      if (!call) return;
      this.logger.log(
        `Llamada ${String(call._id)} de ${maskPhone(ev.contact)} rechazada: contacto bloqueado`,
      );
      await this.meta
        .action(cfg, ev.id, 'reject')
        .catch((err) =>
          this.logger.warn(`No se pudo rechazar: ${String(err)}`),
        );
      return;
    }

    const call = await this.create({
      ...base,
      status: 'ringing',
      offerSdp: ev.sdp,
    });
    if (!call) return;
    this.logger.log(
      `Llamada ${String(call._id)} entrante de ${maskPhone(ev.contact)} sonando`,
    );

    const data = view(call, account.label);
    this.gateway.emitToCalls(tenantId, 'call:incoming', { call: data });
    this.scheduleTimeout(call, this.prefsOf(account).ringTimeoutSec);

    const who = data.contactName || `+${ev.contact}`;
    const body = `${who} · ${account.label}`;
    void this.push.sendToTenant(
      tenantId,
      {
        title: 'Llamada entrante',
        body,
        url: '/llamadas',
        tag: `call_${String(call._id)}`,
        category: 'calls',
      },
      { moduleKey: 'calls' },
    );
    void this.nativePush
      .sendToTenantModule(tenantId, 'calls', {
        title: 'Llamada entrante',
        body,
        data: { route: '/llamadas' },
        tag: `call_${String(call._id)}`,
        category: 'calls',
      })
      .catch(() => 0);
  }

  /** Reserva atómica: el primero que acepta se queda la llamada. */
  async claim(id: string, tenantId: string, userId: string) {
    const call = await this.callModel
      .findOneAndUpdate(
        {
          _id: this.oid(id),
          tenantId: this.oid(tenantId),
          direction: 'inbound',
          status: 'ringing',
        },
        {
          $set: {
            status: 'connecting',
            claimedBy: this.oid(userId),
            claimedAt: new Date(),
          },
        },
        { new: true, projection: { offerSdp: 1, tenantId: 1 } },
      )
      .exec();
    if (!call) {
      const current = await this.find(id, tenantId);
      throw new ConflictException(
        isFinal(current.status)
          ? 'Esta llamada ya terminó'
          : 'Esta llamada ya fue atendida',
      );
    }
    this.clearTimer(id);
    this.gateway.emitToCalls(tenantId, 'call:taken', { id, by: userId });
    return { offerSdp: call.offerSdp ?? '' };
  }

  /** El micrófono falló: la llamada vuelve a sonar para los demás. */
  async release(id: string, tenantId: string, userId: string) {
    const call = await this.callModel
      .findOneAndUpdate(
        {
          _id: this.oid(id),
          tenantId: this.oid(tenantId),
          status: 'connecting',
          claimedBy: this.oid(userId),
        },
        { $set: { status: 'ringing' }, $unset: { claimedBy: 1, claimedAt: 1 } },
        { new: true },
      )
      .exec();
    if (!call) return;
    const account = await this.accounts.findById(String(call.accountId));
    this.gateway.emitToCalls(tenantId, 'call:incoming', {
      call: view(call, account?.label),
    });
    // El tiempo de espera sigue contando desde que empezó a sonar.
    const elapsed = (Date.now() - call.startedAt.getTime()) / 1000;
    const left =
      (account ? this.prefsOf(account).ringTimeoutSec : 30) - elapsed;
    this.scheduleTimeout(call, Math.max(left, 1));
  }

  async accept(id: string, tenantId: string, userId: string, sdp: string) {
    const call = await this.find(id, tenantId);
    if (call.status !== 'connecting' || String(call.claimedBy) !== userId)
      throw new ConflictException('Esta llamada ya no está disponible');
    const cfg = await this.configFor(call);
    try {
      await this.meta.action(cfg, call.waCallId, 'pre_accept', sdp);
      await this.meta.action(cfg, call.waCallId, 'accept', sdp);
    } catch (err) {
      await this.end(call, 'failed', { endReason: 'accept_failed' });
      throw err;
    }
    const updated = await this.callModel
      .findOneAndUpdate(
        { _id: call._id, status: 'connecting' },
        {
          $set: {
            status: 'active',
            connectedAt: new Date(),
            answeredBy: this.oid(userId),
            answeredByName: await this.nameOf(userId),
          },
          $unset: { offerSdp: 1 },
        },
        { new: true },
      )
      .exec();
    // Meta pudo colgar mientras tanto (terminate ya procesado).
    if (!updated) throw new ConflictException('La llamada ya terminó');
    this.logger.log(`Llamada ${id} atendida`);
    return view(updated);
  }

  async reject(id: string, tenantId: string) {
    const call = await this.find(id, tenantId);
    if (
      call.direction !== 'inbound' ||
      !['ringing', 'connecting'].includes(call.status)
    )
      throw new ConflictException('Esta llamada ya no está sonando');
    await this.meta.action(await this.configFor(call), call.waCallId, 'reject');
    await this.end(call, 'rejected', { endReason: 'rejected_by_agent' });
  }

  /** Colgar: solo quien tiene la llamada. */
  async hangup(id: string, tenantId: string, userId: string) {
    const call = await this.find(id, tenantId);
    if (String(call.claimedBy) !== userId)
      throw new ForbiddenException('Esta llamada la lleva otra persona');
    if (isFinal(call.status)) return view(call);
    await this.meta
      .action(await this.configFor(call), call.waCallId, 'terminate')
      .catch((err) => this.logger.warn(`terminate falló: ${String(err)}`));
    const ended =
      call.status === 'active'
        ? await this.end(call, 'completed', { endReason: 'agent_hangup' })
        : await this.end(call, 'missed', { endReason: 'canceled' });
    return view(ended ?? call);
  }

  async onTerminate(waCallId: string, ev: TerminateEvent) {
    const call = await this.callModel.findOne({ waCallId }).exec();
    if (!call || isFinal(call.status)) return;
    const endedAt = ev.endTime
      ? new Date(Number(ev.endTime) * 1000)
      : new Date();
    if (call.status === 'active') {
      await this.end(call, 'completed', {
        endedAt,
        durationSec: ev.duration,
        endReason: 'hangup',
      });
    } else if (call.direction === 'outbound' && ev.status === 'FAILED') {
      await this.end(call, 'failed', {
        endedAt,
        endReason: ev.errorCode ? `meta_${ev.errorCode}` : 'failed',
      });
    } else {
      await this.end(call, 'missed', { endedAt, endReason: 'not_answered' });
    }
  }

  // ------------------------------------------------------------------
  // Salientes y permiso de llamada
  // ------------------------------------------------------------------

  async permissionState(
    tenantId: string,
    accountId: string,
    contact: string,
  ): Promise<PermissionView> {
    const account = await this.accountOf(tenantId, accountId);
    const res = await this.meta.permission(
      this.accounts.toConfig(account),
      contact,
    );
    const can = (name: string) =>
      res.actions?.find((a) => a.action_name === name)?.can_perform_action ??
      false;
    const metaStatus = res.permission?.status;
    const expiresAt = res.permission?.expiration_time
      ? new Date(res.permission.expiration_time * 1000)
      : undefined;
    const local = await this.permModel
      .findOne({ accountId: account._id, contact })
      .lean()
      .exec();

    let status: PermissionStatus = 'none';
    if (metaStatus === 'permanent') status = 'permanent';
    else if (
      metaStatus === 'temporary' &&
      (!expiresAt || expiresAt > new Date())
    )
      status = 'granted';
    else if (
      local?.response === 'reject' &&
      (!local.requestedAt || (local.respondedAt ?? 0) >= local.requestedAt)
    )
      status = 'rejected';
    else if (
      local?.requestedAt &&
      !local.response &&
      Date.now() - local.requestedAt.getTime() < 7 * 24 * 3600_000
    )
      status = 'pending';
    else if (local?.response === 'accept') status = 'expired';

    const granted = status === 'granted' || status === 'permanent';
    return {
      status,
      expiresAt: (expiresAt ?? local?.expiresAt)?.toISOString(),
      canRequest: can('send_call_permission_request'),
      canCall: granted && can('start_call'),
    };
  }

  async requestPermission(
    tenantId: string,
    userId: string,
    accountId: string,
    contact: string,
  ): Promise<PermissionView> {
    const account = await this.accountOf(tenantId, accountId);
    if (await this.blocks.isBlocked(tenantId, 'whatsapp', contact))
      throw new BadRequestException('Este contacto está bloqueado');
    const state = await this.permissionState(tenantId, accountId, contact);
    if (state.status === 'granted' || state.status === 'permanent')
      return state;
    if (!state.canRequest)
      throw new BadRequestException(
        'WhatsApp no deja pedir permiso otra vez todavía (máximo 1 al día y 2 por semana por cliente).',
      );
    await this.meta.requestPermission(
      this.accounts.toConfig(account),
      contact,
      PERMISSION_TEXT,
    );
    await this.permModel
      .updateOne(
        { accountId: account._id, contact },
        {
          $set: {
            tenantId: account.tenantId,
            requestedAt: new Date(),
            requestedBy: this.oid(userId),
          },
          $unset: { response: 1, respondedAt: 1 },
        },
        { upsert: true },
      )
      .exec();
    const chat = await this.conversations.findWhatsAppChat(accountId, contact);
    if (chat)
      await this.conversations.noteInChat(
        chat,
        `${await this.nameOf(userId)} pidió permiso al cliente para llamarlo`,
      );
    return { ...state, status: 'pending', canRequest: false };
  }

  async onPermissionReply(
    account: WhatsAppAccount,
    contact: string,
    reply: { response?: string; expiration?: string; permanent?: boolean },
  ) {
    const accepted = reply.response === 'accept';
    await this.permModel
      .updateOne(
        { accountId: account._id, contact },
        {
          $set: {
            tenantId: account.tenantId,
            response: accepted ? 'accept' : 'reject',
            respondedAt: new Date(),
            permanent: !!reply.permanent,
            ...(reply.expiration
              ? { expiresAt: new Date(Number(reply.expiration) * 1000) }
              : {}),
          },
        },
        { upsert: true },
      )
      .exec();
    const chat = await this.conversations.findWhatsAppChat(
      String(account._id),
      contact,
    );
    if (chat)
      await this.conversations.noteInChat(
        chat,
        accepted
          ? 'El cliente dio permiso para llamarlo por WhatsApp'
          : 'El cliente no dio permiso para llamarlo por WhatsApp',
      );
  }

  async startOutbound(
    tenantId: string,
    userId: string,
    accountId: string,
    contact: string,
    sdp: string,
  ) {
    const account = await this.accountOf(tenantId, accountId);
    if (await this.blocks.isBlocked(tenantId, 'whatsapp', contact))
      throw new BadRequestException('Este contacto está bloqueado');
    if (
      await this.callModel.exists({
        tenantId: this.oid(tenantId),
        claimedBy: this.oid(userId),
        status: { $in: ['ringing', 'connecting', 'active'] },
      })
    )
      throw new ConflictException('Ya tienes una llamada en curso');

    const ref = new Types.ObjectId();
    const waCallId = await this.meta.connect(
      this.accounts.toConfig(account),
      contact,
      sdp,
      String(ref),
    );
    const chat = await this.conversations.findWhatsAppChat(accountId, contact);
    const call = await this.callModel.create({
      _id: ref,
      tenantId: account.tenantId,
      accountId: account._id,
      waCallId,
      direction: 'outbound',
      status: 'ringing',
      contact,
      contactName: chat?.contactName,
      conversationId: chat?._id,
      claimedBy: this.oid(userId),
      answeredByName: await this.nameOf(userId),
      startedAt: new Date(),
    });
    this.logger.log(
      `Llamada ${String(call._id)} saliente a ${maskPhone(contact)}`,
    );
    return view(call, account.label);
  }

  /** Meta devuelve la respuesta SDP del cliente: solo para quien llama. */
  async onOutboundAnswer(waCallId: string, sdp: string) {
    const call = await this.callModel.findOne({ waCallId }).exec();
    if (!call || call.direction !== 'outbound' || !call.claimedBy) return;
    this.gateway.emitToUser(String(call.claimedBy), 'call:answer', {
      id: String(call._id),
      sdp,
    });
  }

  async onOutboundStatus(waCallId: string, status: string) {
    const call = await this.callModel.findOne({ waCallId }).exec();
    if (!call || call.direction !== 'outbound' || isFinal(call.status)) return;
    if (status === 'ACCEPTED' && call.status !== 'active') {
      const updated = await this.callModel
        .findOneAndUpdate(
          { _id: call._id, status: { $in: ['ringing', 'connecting'] } },
          {
            $set: {
              status: 'active',
              connectedAt: new Date(),
              answeredBy: call.claimedBy,
            },
          },
          { new: true },
        )
        .exec();
      if (updated && updated.claimedBy)
        this.gateway.emitToUser(String(updated.claimedBy), 'call:updated', {
          call: view(updated),
        });
    } else if (status === 'REJECTED') {
      await this.end(call, 'rejected', { endReason: 'rejected_by_customer' });
    }
  }

  // ------------------------------------------------------------------
  // Consulta, panel y configuración
  // ------------------------------------------------------------------

  async list(tenantId: string, q: CallListQuery) {
    const filter: Record<string, unknown> = { tenantId: this.oid(tenantId) };
    if (q.status) filter.status = q.status;
    if (q.direction) filter.direction = q.direction;
    if (q.accountId) filter.accountId = this.oid(q.accountId);
    if (q.userId) filter.answeredBy = this.oid(q.userId);
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = new Date(q.from);
    if (q.to) range.$lte = new Date(q.to);
    if (Object.keys(range).length) filter.startedAt = range;

    const limit = 50;
    const page = Math.max(1, q.page ?? 1);
    const [items, total, accounts] = await Promise.all([
      this.callModel
        .find(filter)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.callModel.countDocuments(filter).exec(),
      this.accounts.findAll(tenantId),
    ]);
    const labels = new Map(accounts.map((a) => [String(a._id), a.label]));
    return {
      items: items.map((c) => view(c, labels.get(String(c.accountId)))),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Cuentas de WhatsApp y equipo, para los filtros y el botón Llamar. */
  async options(tenantId: string) {
    const [accounts, users] = await Promise.all([
      this.accounts.findAll(tenantId),
      this.userModel
        .find({ tenantId: this.oid(tenantId), isActive: { $ne: false } })
        .select('name email')
        .sort({ name: 1 })
        .lean<{ _id: Types.ObjectId; name?: string; email: string }[]>()
        .exec(),
    ]);
    return {
      accounts: accounts
        .filter((a) => a.active && a.waPhoneNumberId)
        .map((a) => ({
          _id: String(a._id),
          label: a.label,
          phoneNumber: a.phoneNumber,
          isDefault: a.isDefault,
        })),
      users: users.map((u) => ({
        _id: String(u._id),
        name: u.name?.trim() || u.email,
      })),
      iceServers: this.iceServers,
    };
  }

  async stats(tenantId: string, from?: Date, to?: Date) {
    const match: Record<string, unknown> = { tenantId: this.oid(tenantId) };
    if (from || to)
      match.startedAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    const [row] = await this.callModel
      .aggregate<{ total: number; missed: number; avg: number | null }>([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            missed: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 'missed'] },
                      { $eq: ['$direction', 'inbound'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            avg: {
              $avg: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  '$durationSec',
                  null,
                ],
              },
            },
          },
        },
      ])
      .exec();
    return {
      total: row?.total ?? 0,
      missed: row?.missed ?? 0,
      avgDurationSec: Math.round(row?.avg ?? 0),
    };
  }

  async getSettings(tenantId: string, accountId: string) {
    const account = await this.accountOf(tenantId, accountId);
    let meta: MetaCallingSettings | null = null;
    let metaError: string | undefined;
    try {
      meta = await this.meta.getSettings(this.accounts.toConfig(account));
    } catch (err) {
      metaError = (err as Error).message;
    }
    return { meta, metaError, local: this.prefsOf(account) };
  }

  async updateSettings(
    tenantId: string,
    accountId: string,
    body: { meta?: MetaCallingSettings; local?: Partial<CallingPrefs> },
  ) {
    const account = await this.accountOf(tenantId, accountId);
    if (body.meta)
      await this.meta.updateSettings(
        this.accounts.toConfig(account),
        body.meta,
      );
    if (body.local) {
      const next = { ...this.prefsOf(account), ...body.local };
      if (next.missedReplyEnabled && !next.missedReplyText?.trim())
        throw new BadRequestException(
          'Escribe el mensaje para las llamadas perdidas',
        );
      account.calling = next;
      account.markModified('calling');
      await account.save();
    }
    return this.getSettings(tenantId, accountId);
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  /** Termina la llamada (una sola vez) y la registra. */
  private async end(
    call: Call,
    status: CallStatus,
    extra: { endedAt?: Date; durationSec?: number; endReason?: string } = {},
  ): Promise<Call | null> {
    const endedAt = extra.endedAt ?? new Date();
    const durationSec =
      status === 'completed'
        ? (extra.durationSec ??
          (call.connectedAt
            ? Math.round(
                (endedAt.getTime() - call.connectedAt.getTime()) / 1000,
              )
            : 0))
        : undefined;
    const ended = await this.callModel
      .findOneAndUpdate(
        { _id: call._id, status: { $nin: FINAL_STATUSES } },
        {
          $set: {
            status,
            endedAt,
            ...(durationSec !== undefined ? { durationSec } : {}),
            ...(extra.endReason ? { endReason: extra.endReason } : {}),
          },
          $unset: { offerSdp: 1 },
        },
        { new: true },
      )
      .exec();
    if (!ended) return null;
    this.clearTimer(String(ended._id));
    const tenantId = String(ended.tenantId);
    const payload = { id: String(ended._id), status };
    this.gateway.emitToCalls(tenantId, 'call:ended', payload);
    if (ended.claimedBy)
      this.gateway.emitToUser(String(ended.claimedBy), 'call:ended', payload);
    this.logger.log(`Llamada ${String(ended._id)} → ${status}`);
    await this.record(ended).catch((err) =>
      this.logger.error(`No se pudo registrar la llamada: ${String(err)}`),
    );
    return ended;
  }

  /** Ficha y chat del cliente, una sola vez aunque el webhook se repita. */
  private async record(call: Call) {
    const claimed = await this.callModel
      .findOneAndUpdate(
        { _id: call._id, logged: false },
        { $set: { logged: true } },
        { new: true },
      )
      .exec();
    if (!claimed) return;
    const tenantId = String(call.tenantId);
    const accountId = String(call.accountId);
    const text = callSummary(call);

    const conv = await this.conversations.noteCall(
      tenantId,
      accountId,
      call.contact,
      call.contactName,
      text,
    );

    let customerId: Types.ObjectId | undefined;
    // Sin teléfono (BSUID) no hay forma fiable de casarlo con un cliente.
    if (/^\d+$/.test(call.contact)) {
      const customer = await this.leads.upsertCustomer(
        tenantId,
        String(call.answeredBy ?? call.claimedBy ?? ''),
        'SYSTEM',
        {
          name: call.contactName?.trim() || `+${call.contact}`,
          phone: call.contact,
          source: 'whatsapp',
        },
      );
      customerId = customer._id;
      await this.activityModel.create({
        tenantId: call.tenantId,
        customerId,
        type: 'call',
        title: text,
        at: call.endedAt ?? new Date(),
        fromUserId: call.answeredBy,
        conversationId: conv._id,
      });
    }
    await this.callModel
      .updateOne(
        { _id: call._id },
        {
          $set: {
            conversationId: conv._id,
            ...(customerId ? { customerId } : {}),
          },
        },
      )
      .exec();

    if (call.status === 'missed' && call.direction === 'inbound')
      await this.missedReply(call, conv);
  }

  private async missedReply(
    call: Call,
    conv: Awaited<ReturnType<ConversationsService['noteCall']>>,
  ) {
    const account = await this.accounts.findById(String(call.accountId));
    const prefs = account ? this.prefsOf(account) : DEFAULT_CALLING_PREFS;
    const text = prefs.missedReplyText?.trim();
    if (!prefs.missedReplyEnabled || !text) return;
    const first = await this.callModel
      .updateOne(
        { _id: call._id, missedReplySent: false },
        { $set: { missedReplySent: true } },
      )
      .exec();
    if (first.modifiedCount) await this.conversations.sendAutomatic(conv, text);
  }

  private scheduleTimeout(call: Call, seconds: number) {
    const id = String(call._id);
    this.clearTimer(id);
    const t = setTimeout(() => void this.expire(id), seconds * 1000);
    t.unref?.();
    this.timers.set(id, t);
  }

  private clearTimer(id: string) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }

  /** Nadie contestó a tiempo: perdida, y se deja de hacer sonar en el teléfono. */
  async expire(id: string) {
    this.timers.delete(id);
    const call = await this.callModel
      .findOne({ _id: this.oid(id), status: 'ringing', direction: 'inbound' })
      .exec();
    if (!call) return;
    const ended = await this.end(call, 'missed', { endReason: 'timeout' });
    if (!ended) return;
    const cfg = await this.configFor(call).catch(() => null);
    if (cfg)
      await this.meta
        .action(cfg, call.waCallId, 'reject')
        .catch((err) => this.logger.warn(`reject tras espera: ${String(err)}`));
  }

  /** Red de seguridad: llamadas sonando más de lo debido o reservas colgadas. */
  async sweep(now = Date.now()) {
    try {
      const ringing = await this.callModel
        .find({
          status: 'ringing',
          direction: 'inbound',
          startedAt: { $lt: new Date(now - 15_000) },
        })
        .limit(100)
        .exec();
      for (const call of ringing) {
        const account = await this.accounts.findById(String(call.accountId));
        const timeout = account ? this.prefsOf(account).ringTimeoutSec : 30;
        if (now - call.startedAt.getTime() >= timeout * 1000)
          await this.expire(String(call._id));
      }
      const stale = await this.callModel
        .find({
          status: { $in: ['connecting', 'ringing'] },
          startedAt: { $lt: new Date(now - STALE_CONNECTING_MS) },
        })
        .limit(100)
        .exec();
      for (const call of stale)
        await this.end(
          call,
          call.direction === 'outbound' ? 'missed' : 'failed',
          {
            endReason: 'stale',
          },
        );
    } catch (err) {
      this.logger.error(`Barrido de llamadas falló: ${String(err)}`);
    }
  }

  private prefsOf(account: WhatsAppAccount): CallingPrefs {
    const p = { ...DEFAULT_CALLING_PREFS, ...(account.calling ?? {}) };
    p.ringTimeoutSec = Math.min(
      60,
      Math.max(15, Number(p.ringTimeoutSec) || 30),
    );
    return p;
  }

  private async create(data: Partial<Call>): Promise<Call | null> {
    try {
      return await this.callModel.create(data);
    } catch (err) {
      // Mismo waCallId: el webhook llegó dos veces a la vez.
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
  }

  private async find(id: string, tenantId: string): Promise<Call> {
    const call = Types.ObjectId.isValid(id)
      ? await this.callModel
          .findOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
          .exec()
      : null;
    if (!call) throw new NotFoundException('Llamada no encontrada');
    return call;
  }

  private async accountOf(tenantId: string, accountId: string) {
    const account = Types.ObjectId.isValid(accountId)
      ? await this.accounts.findById(accountId)
      : null;
    if (!account || String(account.tenantId) !== tenantId)
      throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    if (account.provider !== 'cloudapi' || !account.waPhoneNumberId)
      throw new BadRequestException(
        'Las llamadas solo funcionan con cuentas de WhatsApp Cloud API',
      );
    return account;
  }

  private async configFor(call: Call) {
    const account = await this.accounts.findById(String(call.accountId));
    if (!account)
      throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    return this.accounts.toConfig(account);
  }

  private async nameOf(userId: string): Promise<string> {
    if (!Types.ObjectId.isValid(userId)) return 'Un miembro del equipo';
    const u = await this.userModel
      .findById(userId)
      .select('name email')
      .lean<{ name?: string; email?: string }>()
      .exec();
    return u?.name?.trim() || u?.email || 'Un miembro del equipo';
  }

  private oid(id: string) {
    return new Types.ObjectId(id);
  }
}
