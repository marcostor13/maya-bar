import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Call } from './call.schema';
import { CallsMetaService } from './calls-meta.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import type {
  VoiceAgentPrefs,
  WhatsAppAccount,
} from '../whatsapp-accounts/whatsapp-account.schema';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { ConversationsService } from '../conversations/conversations.service';
import { AiCreditsService } from '../billing/ai-credits.service';
import { PushService } from '../push/push.service';
import { limaHour } from '../automations/automation-steps';
import {
  VOICE_REALTIME_PROVIDER,
  type VoiceRealtimeProvider,
} from '../voice/realtime-provider';

export const DEFAULT_VOICE_PREFS: VoiceAgentPrefs = {
  enabled: false,
  mode: 'fallback',
  hoursFrom: 9,
  hoursTo: 18,
  days: [1, 2, 3, 4, 5],
  announce: true,
};

const LIMA_OFFSET_MS = -5 * 3600_000;

/** ¿Estamos dentro del horario de atención humano? (hora de Lima) */
export function withinHours(p: VoiceAgentPrefs, now: Date): boolean {
  const day = new Date(now.getTime() + LIMA_OFFSET_MS).getUTCDay();
  if (!p.days.includes(day)) return false;
  const h = limaHour(now);
  return p.hoursFrom < p.hoursTo
    ? h >= p.hoursFrom && h < p.hoursTo
    : h >= p.hoursFrom || h < p.hoursTo;
}

/** Minutos que se cobran: cada minuto empezado cuenta. */
export function billableMinutes(durationSec: number): number {
  return durationSec > 0 ? Math.ceil(durationSec / 60) : 0;
}

/**
 * Agente de IA que contesta llamadas de WhatsApp por voz (HU73). Conecta la
 * oferta SDP de Meta con el modelo de voz en tiempo real, atiende sus
 * herramientas (agenda, base de conocimiento, recado, colgar), guarda la
 * transcripción y cobra los minutos en créditos.
 */
@Injectable()
export class VoiceAgentService {
  private readonly logger = new Logger(VoiceAgentService.name);
  /** Lo registra CallsService: termina la llamada con su lógica de cierre. */
  private ender?: (call: Call, reason: string) => Promise<unknown>;

  constructor(
    @InjectModel(Call.name) private calls: Model<Call>,
    private meta: CallsMetaService,
    private accounts: WhatsAppAccountsService,
    private agents: AiAgentsService,
    private conversations: ConversationsService,
    @Inject(VOICE_REALTIME_PROVIDER) private provider: VoiceRealtimeProvider,
    @Optional() private credits?: AiCreditsService,
    @Optional() private push?: PushService,
  ) {}

  /** Hay proveedor de voz configurado (OPENAI_API_KEY). */
  get available(): boolean {
    return this.provider.configured;
  }

  setEnder(fn: (call: Call, reason: string) => Promise<unknown>) {
    this.ender = fn;
  }

  prefsOf(account: WhatsAppAccount): VoiceAgentPrefs {
    return { ...DEFAULT_VOICE_PREFS, ...(account.calling?.voiceAgent ?? {}) };
  }

  /** ¿Contesta el agente apenas entra la llamada? */
  answersAtOnce(account: WhatsAppAccount, now = new Date()): boolean {
    const p = this.prefsOf(account);
    if (!p.enabled || !p.agentId || !this.provider.configured) return false;
    return (
      p.mode === 'always' ||
      (p.mode === 'outside_hours' && !withinHours(p, now))
    );
  }

  /** ¿Contesta el agente cuando nadie del equipo atendió a tiempo? */
  answersOnTimeout(account: WhatsAppAccount): boolean {
    const p = this.prefsOf(account);
    return (
      p.enabled &&
      !!p.agentId &&
      p.mode === 'fallback' &&
      this.provider.configured
    );
  }

  /**
   * Toma una llamada que está sonando. Devuelve false si no pudo (sin saldo,
   * agente sin publicar, error del proveedor): la llamada sigue su curso normal.
   */
  async takeOver(
    callId: Types.ObjectId,
    account: WhatsAppAccount,
  ): Promise<boolean> {
    const prefs = this.prefsOf(account);
    const tenantId = String(account.tenantId);
    try {
      await this.credits?.assertCanSpend(tenantId, 'voice');
    } catch {
      this.logger.warn(`Agente de voz sin créditos en ${tenantId}`);
      return false;
    }
    // Reserva atómica: si un humano la tomó en el mismo instante, gana él.
    const call = await this.calls
      .findOneAndUpdate(
        { _id: callId, status: 'ringing', direction: 'inbound' },
        {
          $set: {
            status: 'connecting',
            voiceAgentId: new Types.ObjectId(prefs.agentId),
          },
        },
        { new: true },
      )
      .select('+offerSdp')
      .exec();
    if (!call?.offerSdp) return false;

    const session = await this.agents.voiceSession(prefs.agentId!, tenantId, {
      conversationId: call.conversationId
        ? String(call.conversationId)
        : undefined,
      contactName: call.contactName,
      announce: prefs.announce,
    });
    const back = () =>
      this.calls
        .updateOne(
          { _id: call._id, status: 'connecting' },
          { $set: { status: 'ringing' }, $unset: { voiceAgentId: 1 } },
        )
        .exec();
    if (!session) {
      await back();
      return false;
    }
    const tools = [
      ...session.tools,
      {
        name: 'dejar_recado',
        description:
          'Deja un recado para que una persona del equipo devuelva la llamada. Úsala si el cliente pide hablar con alguien o no puedes resolver.',
        parameters: {
          type: 'object',
          properties: {
            resumen: {
              type: 'string',
              description: 'Qué necesita el cliente, en una o dos frases.',
            },
            urgente: { type: 'boolean' },
          },
          required: ['resumen'],
        },
      },
      {
        name: 'colgar',
        description: 'Termina la llamada después de despedirte.',
        parameters: { type: 'object', properties: {} },
      },
    ];
    const cfg = this.accounts.toConfig(account);
    let sessionId: string;
    try {
      const started = await this.provider.start(call.offerSdp, {
        instructions: session.instructions,
        tools,
      });
      sessionId = started.sessionId;
      await this.meta.action(
        cfg,
        call.waCallId,
        'pre_accept',
        started.answerSdp,
      );
      await this.meta.action(cfg, call.waCallId, 'accept', started.answerSdp);
    } catch (err) {
      this.logger.warn(`El agente de voz no pudo contestar: ${String(err)}`);
      await back();
      return false;
    }
    const active = await this.calls
      .findOneAndUpdate(
        { _id: call._id, status: 'connecting' },
        {
          $set: {
            status: 'active',
            connectedAt: new Date(),
            answeredByName: `Agente IA: ${session.name}`,
            voiceSessionId: sessionId,
            transcript: [],
          },
          $unset: { offerSdp: 1 },
        },
        { new: true },
      )
      .exec();
    if (!active) {
      await this.provider.hangup(sessionId);
      return true; // Meta colgó mientras tanto: ya no suena para nadie.
    }

    this.provider.attach(sessionId, {
      onTranscript: (who, text) => {
        if (!text.trim()) return;
        void this.calls
          .updateOne(
            { _id: active._id },
            {
              $push: {
                transcript: {
                  who,
                  text: text.trim().slice(0, 2000),
                  at: new Date(),
                },
              },
            },
          )
          .exec();
      },
      onToolCall: (name, args) =>
        this.runTool(active, account, session.runTool, name, args),
      onClosed: () => undefined,
    });
    this.logger.log(
      `Llamada ${String(active._id)} atendida por el agente de voz`,
    );
    return true;
  }

  private async runTool(
    call: Call,
    account: WhatsAppAccount,
    agentTool: (c: {
      name: string;
      input: Record<string, unknown>;
    }) => Promise<unknown>,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (name === 'dejar_recado') {
      const resumen = (typeof args.resumen === 'string' ? args.resumen : '')
        .trim()
        .slice(0, 500);
      const urgente = args.urgente === true;
      const conv = await this.conversations.noteCall(
        String(call.tenantId),
        String(call.accountId),
        call.contact,
        call.contactName,
        `Recado del agente de voz${urgente ? ' (urgente)' : ''}: ${resumen || 'el cliente pidió que lo llamen'}`,
      );
      await this.calls
        .updateOne({ _id: call._id }, { $set: { conversationId: conv._id } })
        .exec();
      void this.push
        ?.sendToTenant(
          String(call.tenantId),
          {
            title: urgente
              ? 'Recado urgente de una llamada'
              : 'Recado de una llamada',
            body: `${call.contactName || `+${call.contact}`}: ${resumen}`.slice(
              0,
              180,
            ),
            url: '/llamadas',
            tag: `voice_${String(call._id)}`,
            category: 'calls',
          },
          { moduleKey: 'calls' },
        )
        .catch(() => 0);
      return {
        ok: true,
        nota: 'Recado guardado. Dile que un asesor le devolverá la llamada.',
      };
    }
    if (name === 'colgar') {
      setTimeout(() => void this.hangup(call, account), 1500).unref?.();
      return { ok: true };
    }
    return agentTool({ name, input: args });
  }

  /** El agente cuelga: termina en Meta, en el proveedor y en la plataforma. */
  async hangup(call: Call, account: WhatsAppAccount) {
    await this.meta
      .action(this.accounts.toConfig(account), call.waCallId, 'terminate')
      .catch((err) => this.logger.warn(`terminate del agente: ${String(err)}`));
    if (call.voiceSessionId) await this.provider.hangup(call.voiceSessionId);
    const fresh = await this.calls.findById(call._id).exec();
    if (fresh && this.ender) await this.ender(fresh, 'agent_hangup');
  }

  /**
   * Al terminar una llamada del agente: cobra los minutos una sola vez y deja
   * la transcripción resumida en el chat del contacto.
   */
  async onEnded(call: Call): Promise<void> {
    if (!call.voiceAgentId) return;
    if (call.voiceSessionId)
      await this.provider.hangup(call.voiceSessionId).catch(() => undefined);
    const claimed = await this.calls
      .findOneAndUpdate(
        { _id: call._id, voiceBilled: false },
        { $set: { voiceBilled: true } },
        { new: true },
      )
      .exec();
    if (!claimed) return;
    const minutes = billableMinutes(claimed.durationSec ?? 0);
    if (minutes && this.credits)
      await this.credits.record(
        String(claimed.tenantId),
        'voice',
        { byok: false, provider: 'openai', model: 'realtime' },
        minutes,
      );
    const lines = (claimed.transcript ?? []).map(
      (t) => `${t.who === 'cliente' ? 'Cliente' : 'Agente'}: ${t.text}`,
    );
    if (lines.length) {
      const text =
        `Transcripción de la llamada con el agente de voz (${minutes} min):\n${lines.join('\n')}`.slice(
          0,
          4000,
        );
      await this.conversations
        .noteCall(
          String(claimed.tenantId),
          String(claimed.accountId),
          claimed.contact,
          claimed.contactName,
          text,
        )
        .catch((err) => this.logger.warn(`Transcripción: ${String(err)}`));
      await this.calls
        .updateOne(
          { _id: claimed._id },
          {
            $set: { voiceSummary: lines.slice(0, 6).join(' / ').slice(0, 500) },
          },
        )
        .exec();
    }
  }
}
