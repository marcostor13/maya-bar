import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { signMetaBody } from '../src/shared/meta-signature';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { AiAgent } from '../src/ai-agents/ai-agent.schema';
import { Call } from '../src/calls/call.schema';
import { Message } from '../src/conversations/message.schema';
import { UsageLedger } from '../src/billing/usage-ledger.schema';
import { CalendarService } from '../src/calendar/calendar.service';
import {
  VOICE_REALTIME_PROVIDER,
  type VoiceHandlers,
  type VoiceRealtimeProvider,
  type VoiceSessionConfig,
} from '../src/voice/realtime-provider';
import { bearer, createApp, registerTenant, type Session } from './support/app';

const SECRET = 'e2e-app-secret';

describe('Agente de IA por voz (e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let accountId: string;
  let agentId: string;
  let phoneNumberId: string;
  let calls: Model<Call>;
  let ledger: Model<UsageLedger>;
  let messages: Model<Message>;
  let graphPost: jest.SpyInstance;
  let createEvent: jest.SpyInstance;
  const started: { offer: string; cfg: VoiceSessionConfig }[] = [];
  const attached = new Map<string, VoiceHandlers>();
  const hungUp: string[] = [];
  let seq = 0;

  const http = () => request(app.getHttpServer());

  async function webhook(value: Record<string, unknown>) {
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'calls',
              value: { metadata: { phone_number_id: phoneNumberId }, ...value },
            },
          ],
        },
      ],
    });
    await http()
      .post('/wa/webhook/cloud')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signMetaBody(raw, SECRET))
      .send(raw)
      .expect(200);
  }

  const incoming = (id: string, from: string) =>
    webhook({
      contacts: [{ wa_id: from, profile: { name: 'Paciente' } }],
      calls: [
        {
          id,
          from,
          to: '51100000000',
          event: 'connect',
          direction: 'USER_INITIATED',
          timestamp: String(Math.floor(Date.now() / 1000)),
          session: { sdp_type: 'offer', sdp: 'v=0 OFERTA-DE-META' },
        },
      ],
    });

  async function until<T>(
    fn: () => Promise<T | null | undefined | false>,
    ms = 4000,
  ): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('Tiempo de espera agotado');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const actions = (waCallId: string) =>
    graphPost.mock.calls
      .filter(
        ([p, o]) =>
          String(p).endsWith('/calls') &&
          (o as { json: { call_id?: string } }).json.call_id === waCallId,
      )
      .map(
        ([, o]) =>
          (o as { json: { action: string; session?: { sdp: string } } }).json,
      );

  const setVoice = (voiceAgent: Record<string, unknown>) =>
    http()
      .put(`/calls/settings/${accountId}`)
      .set(bearer(owner))
      .send({ local: { voiceAgent } });

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Clinica Voz');
    const tenantId = new Types.ObjectId(owner.user.tenantId!);
    phoneNumberId = `PNIDV${Date.now()}`;
    const acc = await app
      .get<Model<WhatsAppAccount>>(getModelToken(WhatsAppAccount.name))
      .create({
        tenantId,
        label: 'Clínica',
        provider: 'cloudapi',
        waPhoneNumberId: phoneNumberId,
        waAccessToken: 't',
        active: true,
      });
    accountId = String(acc._id);
    const agent = await app
      .get<Model<AiAgent>>(getModelToken(AiAgent.name))
      .create({
        tenantId,
        name: 'Recepción',
        systemPrompt: 'Eres la recepcionista de la clínica.',
        provider: 'openai',
        aiModel: 'gpt-4o-mini',
        published: true,
        calendar: {
          enabled: true,
          timeZone: 'America/Lima',
          durationMinutes: 30,
          minNoticeHours: 0,
          maxDaysAhead: 14,
        },
      });
    agentId = String(agent._id);
    calls = app.get<Model<Call>>(getModelToken(Call.name));
    ledger = app.get<Model<UsageLedger>>(getModelToken(UsageLedger.name));
    messages = app.get<Model<Message>>(getModelToken(Message.name));

    graphPost = jest
      .spyOn(app.get(MetaGraphClient), 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(
          path.endsWith('/messages')
            ? { messages: [{ id: `wamid.${Date.now()}` }] }
            : { success: true },
        ),
      );
    const cal = app.get(CalendarService);
    jest.spyOn(cal, 'busy').mockResolvedValue({
      provider: 'google',
      connectionId: 'c1',
      connectionEmail: 'agenda@clinica.pe',
      busy: [],
    });
    createEvent = jest.spyOn(cal, 'createEvent').mockImplementation((_t, dto) =>
      Promise.resolve({
        provider: 'google' as const,
        eventId: `ev${++seq}`,
        start: dto.start,
        end: new Date(
          new Date(dto.start).getTime() + dto.durationMinutes * 60_000,
        ).toISOString(),
        connectionEmail: 'agenda@clinica.pe',
      }),
    );

    // Proveedor de voz simulado: no hay OpenAI en las pruebas.
    const provider = app.get<VoiceRealtimeProvider>(VOICE_REALTIME_PROVIDER);
    Object.defineProperty(provider, 'configured', { get: () => true });
    provider.start = (offer, cfg) => {
      started.push({ offer, cfg });
      return Promise.resolve({
        answerSdp: 'v=0 RESPUESTA-DEL-MODELO',
        sessionId: `rtc_${started.length}`,
      });
    };
    provider.attach = (id, h) => void attached.set(id, h);
    provider.hangup = (id) => {
      hungUp.push(id);
      return Promise.resolve();
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1: fuera de horario contesta el agente, agenda la cita y deja recado y transcripción', async () => {
    const r = await setVoice({
      enabled: true,
      agentId,
      mode: 'outside_hours',
      hoursFrom: 9,
      hoursTo: 18,
      days: [],
      announce: true,
    });
    expect(r.status).toBe(200);
    expect(
      (
        r.body as {
          voice: { prefs: { enabled: boolean }; creditsPerMinute: number };
        }
      ).voice,
    ).toMatchObject({
      prefs: { enabled: true, mode: 'outside_hours' },
      available: true,
      creditsPerMinute: 5,
    });

    await incoming('wacid.voz1', '51987001001');
    const call = await until(() =>
      calls.findOne({ waCallId: 'wacid.voz1', status: 'active' }).exec(),
    );
    expect(call.answeredByName).toBe('Agente IA: Recepción');
    expect(started[0].offer).toBe('v=0 OFERTA-DE-META');
    expect(started[0].cfg.instructions).toContain('LLAMADA DE VOZ');
    expect(started[0].cfg.instructions).toContain('transcribe');
    expect(started[0].cfg.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'consultar_disponibilidad',
        'agendar_cita',
        'dejar_recado',
        'colgar',
      ]),
    );
    // La respuesta del modelo vuelve a Meta: pre_accept y accept con su SDP.
    expect(
      actions('wacid.voz1').map((a) => [a.action, a.session?.sdp]),
    ).toEqual([
      ['pre_accept', 'v=0 RESPUESTA-DEL-MODELO'],
      ['accept', 'v=0 RESPUESTA-DEL-MODELO'],
    ]);

    const h = attached.get(call.voiceSessionId!)!;
    h.onTranscript('cliente', 'Quiero una cita para mañana');
    const slots = (await h.onToolCall('consultar_disponibilidad', {})) as {
      horarios?: { inicio: string }[];
    };
    const first = Object.values(slots).find(Array.isArray) as {
      inicio: string;
    }[];
    expect(first.length).toBeGreaterThan(0);
    const booked = (await h.onToolCall('agendar_cita', {
      inicio: first[0].inicio,
      nombre: 'Ana Pérez',
      motivo: 'Control',
    })) as { agendado: boolean };
    expect(booked.agendado).toBe(true);
    expect(createEvent).toHaveBeenCalledTimes(1);
    h.onTranscript('agente', 'Listo Ana, la cita quedó agendada.');
    await h.onToolCall('dejar_recado', {
      resumen: 'Pregunta por el precio de la consulta',
    });

    // El agente se despide y cuelga: termina en Meta y se registra.
    await h.onToolCall('colgar', {});
    const ended = await until(() =>
      calls.findOne({ waCallId: 'wacid.voz1', status: 'completed' }).exec(),
    );
    expect(ended.endReason).toBe('agent_hangup');
    expect(actions('wacid.voz1').map((a) => a.action)).toContain('terminate');
    expect(hungUp).toContain(call.voiceSessionId);
    const texts = await until(async () => {
      const t = (
        await messages
          .find({ tenantId: new Types.ObjectId(owner.user.tenantId!) })
          .lean()
          .exec()
      )
        .map((m) => m.text)
        .join(String.fromCharCode(10));
      return t.includes('Transcripción') ? t : null;
    });
    expect(texts).toContain('Recado del agente de voz: Pregunta por el precio');
    expect(texts).toContain('Cliente: Quiero una cita para mañana');
  });

  it('C2: cada minuto empezado descuenta los créditos configurados, una sola vez', async () => {
    await incoming('wacid.voz2', '51987001002');
    await until(() =>
      calls.findOne({ waCallId: 'wacid.voz2', status: 'active' }).exec(),
    );
    // Meta corta la llamada: 2 min 5 s → 3 minutos × 5 créditos.
    const term = {
      calls: [
        {
          id: 'wacid.voz2',
          event: 'terminate',
          status: 'COMPLETED',
          duration: 125,
        },
      ],
    };
    await webhook(term);
    await webhook(term);
    const row = await until(() =>
      ledger
        .findOne({
          tenantId: new Types.ObjectId(owner.user.tenantId!),
          action: 'voice',
          units: 3,
        })
        .exec(),
    );
    expect(row.credits).toBe(15);
    await new Promise((r) => setTimeout(r, 300));
    expect(
      await ledger.countDocuments({
        tenantId: new Types.ObjectId(owner.user.tenantId!),
        action: 'voice',
        units: 3,
      }),
    ).toBe(1);
  });

  it('en horario (modo fuera de horario) la llamada suena para el equipo', async () => {
    await setVoice({
      enabled: true,
      agentId,
      mode: 'outside_hours',
      hoursFrom: 0,
      hoursTo: 24,
      days: [0, 1, 2, 3, 4, 5, 6],
      announce: false,
    }).expect(200);
    const before = started.length;
    await incoming('wacid.voz3', '51987001003');
    await until(() =>
      calls.findOne({ waCallId: 'wacid.voz3', status: 'ringing' }).exec(),
    );
    expect(started.length).toBe(before);
    await setVoice({
      enabled: true,
      mode: 'always',
      hoursFrom: 9,
      hoursTo: 18,
      days: [],
      announce: true,
    }).expect(400);
  });
});
