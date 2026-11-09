import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { signMetaBody } from '../src/shared/meta-signature';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { ContactActivity } from '../src/customers/contact-activity.schema';
import { Message } from '../src/conversations/message.schema';
import { BlockedContactsService } from '../src/conversations/blocked-contacts.service';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

const SECRET = 'e2e-app-secret';

type CallRow = {
  _id: string;
  status: string;
  direction: string;
  durationSec?: number;
  answeredByName?: string;
  contact: string;
};

describe('Llamadas de WhatsApp (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  let owner: Session;
  let manager: Session;
  let server: Session;
  let other: Session;
  let accountId: string;
  let phoneNumberId: string;
  let accounts: Model<WhatsAppAccount>;
  let graphPost: jest.SpyInstance;
  let graphGet: jest.SpyInstance;
  const sockets: Socket[] = [];
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const phone = () => `5198700${String(++seq).padStart(4, '0')}`;

  /** Webhook tal como lo manda Meta: cuerpo crudo firmado con el secreto. */
  async function webhook(value: Record<string, unknown>, sign = SECRET) {
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
      .set('x-hub-signature-256', signMetaBody(raw, sign))
      .send(raw)
      .expect(200);
  }

  const incoming = (id: string, from: string, name = 'Cliente') =>
    webhook({
      contacts: [{ wa_id: from, profile: { name } }],
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

  const terminate = (id: string, extra: Record<string, unknown> = {}) =>
    webhook({
      calls: [{ id, event: 'terminate', status: 'COMPLETED', ...extra }],
    });

  /** El webhook responde antes de procesar: se espera al efecto. */
  async function until<T>(
    fn: () => Promise<T | undefined | null | false>,
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

  const calls = async (s: Session = owner, query = '') =>
    (await http().get(`/calls${query}`).set(bearer(s)).expect(200)).body as {
      items: CallRow[];
      total: number;
    };

  const callByContact = (contact: string, s: Session = owner) =>
    until(async () =>
      (await calls(s)).items.find((c) => c.contact === contact),
    );

  function connectSocket(s: Session | null): Promise<{
    socket: Socket;
    events: { event: string; payload: unknown }[];
    disconnected: Promise<void>;
  }> {
    const socket = io(`${url}/conversations`, {
      auth: s ? { token: s.token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const events: { event: string; payload: unknown }[] = [];
    socket.onAny((event: string, payload: unknown) =>
      events.push({ event, payload }),
    );
    const disconnected = new Promise<void>((r) =>
      socket.on('disconnect', () => r()),
    );
    return new Promise((resolve, reject) => {
      socket.on('connect', () =>
        setTimeout(() => resolve({ socket, events, disconnected }), 150),
      );
      socket.on('connect_error', reject);
    });
  }

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    url = await app.getUrl();
    url = url.replace('[::1]', 'localhost');
    owner = await registerTenant(app, 'Llamadas');
    other = await registerTenant(app, 'Ajena');
    manager = await createUser(app, owner, 'MANAGER');
    server = await createUser(app, owner, 'SERVER');
    accounts = app.get<Model<WhatsAppAccount>>(
      getModelToken(WhatsAppAccount.name),
    );
    phoneNumberId = `PNID${Date.now()}`;
    const acc = await accounts.create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      label: 'Ventas',
      provider: 'cloudapi',
      waPhoneNumberId: phoneNumberId,
      waAccessToken: 'token-de-prueba',
      active: true,
    });
    accountId = String(acc._id);

    const graph = app.get(MetaGraphClient);
    let out = 0;
    graphPost = jest
      .spyOn(graph, 'post')
      .mockImplementation(
        (path: string, opts?: { json?: { action?: string } }) => {
          if (path.endsWith('/calls') && opts?.json?.action === 'connect')
            return Promise.resolve({ calls: [{ id: `wacid.out${++out}` }] });
          if (path.endsWith('/messages'))
            return Promise.resolve({
              messages: [{ id: `wamid.${Date.now()}` }],
            });
          return Promise.resolve({ success: true });
        },
      );
    graphGet = jest.spyOn(graph, 'get').mockResolvedValue({});
  });

  afterEach(() => {
    graphPost.mockClear();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const actions = (callId: string) =>
    graphPost.mock.calls
      .filter(
        ([path, opts]) =>
          String(path).endsWith('/calls') &&
          (opts as { json: { call_id?: string } }).json.call_id === callId,
      )
      .map(([, opts]) => (opts as { json: { action: string } }).json.action);

  it('el socket exige sesión: sin token se desconecta', async () => {
    const socket = io(`${url}/conversations`, {
      transports: ['websocket'],
      reconnection: false,
      query: { tenantId: owner.user.tenantId! },
    });
    sockets.push(socket);
    await new Promise<void>((resolve) =>
      socket.on('disconnect', () => resolve()),
    );
    expect(socket.connected).toBe(false);
  });

  it('una entrante avisa en tiempo real solo a quien tiene Llamadas, sin el SDP', async () => {
    const admin = await connectSocket(owner);
    const noCalls = await connectSocket(server);
    const from = phone();
    await incoming('wacid.in1', from, 'Luis');
    const ev = await until(async () =>
      admin.events.find((e) => e.event === 'call:incoming'),
    );
    expect(JSON.stringify(ev.payload)).not.toContain('OFERTA');
    expect(ev.payload).toMatchObject({
      call: {
        contact: from,
        contactName: 'Luis',
        accountLabel: 'Ventas',
        status: 'ringing',
      },
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(noCalls.events.some((e) => e.event.startsWith('call:'))).toBe(false);
    // Que no se quede sonando para las siguientes pruebas.
    await terminate('wacid.in1');
    await until(async () => (await callByContact(from)).status === 'missed');
  });

  it('el primero que acepta se queda la llamada; el segundo recibe 409 y el aviso se retira', async () => {
    const managerSocket = await connectSocket(manager);
    const from = phone();
    await incoming('wacid.in2', from);
    const call = await callByContact(from);

    const claim = await http()
      .post(`/calls/${call._id}/claim`)
      .set(bearer(owner))
      .expect(200);
    expect(claim.body).toEqual({ offerSdp: 'v=0 OFERTA-DE-META' });
    const second = await http()
      .post(`/calls/${call._id}/claim`)
      .set(bearer(manager))
      .expect(409);
    expect((second.body as { message: string }).message).toBe(
      'Esta llamada ya fue atendida',
    );
    await until(async () =>
      managerSocket.events.find((e) => e.event === 'call:taken'),
    );

    const accepted = await http()
      .post(`/calls/${call._id}/accept`)
      .set(bearer(owner))
      .send({ sdp: 'v=0 RESPUESTA-DEL-NAVEGADOR' })
      .expect(200);
    expect(accepted.body).toMatchObject({ status: 'active' });
    expect(actions('wacid.in2')).toEqual(['pre_accept', 'accept']);
    expect(JSON.stringify(graphPost.mock.calls)).toContain(
      'RESPUESTA-DEL-NAVEGADOR',
    );

    await terminate('wacid.in2', { duration: 75 });
    const done = await until(async () => {
      const c = await callByContact(from);
      return c.status === 'completed' && c;
    });
    expect(done).toMatchObject({ durationSec: 75 });
    expect(done.answeredByName).toBeTruthy();

    // Ficha del cliente y chat, una sola vez aunque Meta repita el webhook.
    await terminate('wacid.in2', { duration: 75 });
    const activities = app.get<Model<ContactActivity>>(
      getModelToken(ContactActivity.name),
    );
    const messages = app.get<Model<Message>>(getModelToken(Message.name));
    const acts = await until(async () => {
      const list = await activities
        .find({
          tenantId: new Types.ObjectId(owner.user.tenantId!),
          type: 'call',
        })
        .lean();
      return list.filter((a) =>
        a.title.startsWith('Llamada entrante · 1 min 15 s'),
      ).length
        ? list
        : null;
    });
    expect(
      acts.filter((a) => a.title.startsWith('Llamada entrante · 1 min 15 s')),
    ).toHaveLength(1);
    const notes = await messages
      .find({
        author: 'system',
        text: { $regex: '^Llamada entrante · 1 min 15 s' },
      })
      .lean();
    expect(notes).toHaveLength(1);
  });

  it('perdida: queda como perdida y el cliente recibe el mensaje automático', async () => {
    await http()
      .put(`/calls/settings/${accountId}`)
      .set(bearer(owner))
      .send({
        local: {
          missedReplyEnabled: true,
          missedReplyText: 'Te devolvemos la llamada enseguida',
          ringTimeoutSec: 30,
        },
      })
      .expect(200);
    const from = phone();
    await incoming('wacid.in3', from);
    await callByContact(from);
    await terminate('wacid.in3');
    await until(async () => (await callByContact(from)).status === 'missed');
    const sent = await until(async () =>
      graphPost.mock.calls.find(
        ([path, opts]) =>
          String(path).endsWith('/messages') &&
          JSON.stringify(opts).includes('Te devolvemos la llamada enseguida'),
      ),
    );
    expect(JSON.stringify(sent[1])).toContain(from);
  });

  it('de un contacto bloqueado: se rechaza sola, queda "blocked" y no avisa', async () => {
    const admin = await connectSocket(owner);
    const from = phone();
    await app
      .get(BlockedContactsService)
      .block(owner.user.tenantId!, [{ channel: 'whatsapp', contact: from }], {
        source: 'inbox',
      });
    await incoming('wacid.in4', from);
    const call = await callByContact(from);
    expect(call.status).toBe('blocked');
    expect(actions('wacid.in4')).toEqual(['reject']);
    expect(
      admin.events.some(
        (e) =>
          e.event === 'call:incoming' &&
          JSON.stringify(e.payload).includes(from),
      ),
    ).toBe(false);
  });

  it('un webhook con firma inválida se descarta', async () => {
    const from = phone();
    await webhook(
      {
        calls: [
          {
            id: 'wacid.forged',
            from,
            event: 'connect',
            direction: 'USER_INITIATED',
            session: { sdp_type: 'offer', sdp: 'x' },
          },
        ],
      },
      'secreto-falso',
    );
    await new Promise((r) => setTimeout(r, 300));
    expect((await calls()).items.some((c) => c.contact === from)).toBe(false);
  });

  it('saliente: connect con la oferta, la respuesta SDP solo a quien llama, y se completa', async () => {
    const caller = await connectSocket(owner);
    const bystander = await connectSocket(manager);
    const to = phone();
    const res = await http()
      .post('/calls/outbound')
      .set(bearer(owner))
      .send({ accountId, contact: to, sdp: 'v=0 OFERTA-DEL-NAVEGADOR' })
      .expect(201);
    const call = res.body as CallRow;
    expect(call).toMatchObject({ direction: 'outbound', status: 'ringing' });
    const connectReq = graphPost.mock.calls.find(
      ([, o]) => (o as { json: { action?: string } }).json.action === 'connect',
    )!;
    expect((connectReq[1] as { json: object }).json).toMatchObject({
      to,
      session: { sdp_type: 'offer', sdp: 'v=0 OFERTA-DEL-NAVEGADOR' },
    });

    await webhook({
      calls: [
        {
          id: 'wacid.out1',
          to,
          event: 'connect',
          direction: 'BUSINESS_INITIATED',
          session: { sdp_type: 'answer', sdp: 'v=0 RESPUESTA-DEL-CLIENTE' },
        },
      ],
    });
    const answer = await until(async () =>
      caller.events.find((e) => e.event === 'call:answer'),
    );
    expect(answer.payload).toEqual({
      id: call._id,
      sdp: 'v=0 RESPUESTA-DEL-CLIENTE',
    });
    expect(bystander.events.some((e) => e.event === 'call:answer')).toBe(false);

    await webhook({
      statuses: [
        {
          id: 'wacid.out1',
          type: 'call',
          status: 'ACCEPTED',
          recipient_id: to,
        },
      ],
    });
    await until(async () => (await callByContact(to)).status === 'active');
    await http()
      .post(`/calls/${call._id}/hangup`)
      .set(bearer(manager))
      .expect(403);
    const hung = await http()
      .post(`/calls/${call._id}/hangup`)
      .set(bearer(owner))
      .expect(200);
    expect(hung.body).toMatchObject({ status: 'completed' });
    expect(actions('wacid.out1')).toEqual(['terminate']);
  });

  it('permiso de llamada: estado según Meta y solicitud con el mensaje interactivo', async () => {
    const to = phone();
    graphGet.mockResolvedValue({
      permission: { status: 'no_permission' },
      actions: [
        {
          action_name: 'send_call_permission_request',
          can_perform_action: true,
        },
        { action_name: 'start_call', can_perform_action: false },
      ],
    });
    const state = await http()
      .get(`/calls/permission?accountId=${accountId}&contact=${to}`)
      .set(bearer(manager))
      .expect(200);
    expect(state.body).toEqual({
      status: 'none',
      canRequest: true,
      canCall: false,
    });
    const req = await http()
      .post('/calls/permission/request')
      .set(bearer(manager))
      .send({ accountId, contact: to })
      .expect(201);
    expect(req.body).toMatchObject({ status: 'pending' });
    const sent = graphPost.mock.calls.find(([path]) =>
      String(path).endsWith('/messages'),
    )!;
    expect((sent[1] as { json: object }).json).toMatchObject({
      to,
      interactive: { type: 'call_permission_request' },
    });
    graphGet.mockResolvedValue({});
  });

  it('historial: filtra por estado y dirección', async () => {
    const missed = await calls(owner, '?status=missed');
    expect(missed.items.length).toBeGreaterThan(0);
    expect(missed.items.every((c) => c.status === 'missed')).toBe(true);
    const outbound = await calls(owner, '?direction=outbound');
    expect(outbound.items.every((c) => c.direction === 'outbound')).toBe(true);
    await http().get('/calls?status=inventado').set(bearer(owner)).expect(400);
    const options = await http()
      .get('/calls/options')
      .set(bearer(manager))
      .expect(200);
    expect(options.body).toMatchObject({
      accounts: [{ _id: accountId, label: 'Ventas' }],
    });
    expect(JSON.stringify(options.body)).not.toContain('token-de-prueba');
    const stats = await http()
      .get('/calls/stats')
      .set(bearer(owner))
      .expect(200);
    expect(stats.body).toMatchObject({
      total: expect.any(Number),
      missed: expect.any(Number),
      avgDurationSec: expect.any(Number),
    });
    expect((stats.body as { total: number }).total).toBeGreaterThanOrEqual(5);
  });

  it('aislamiento y permisos: otra empresa no ve ni toca nada; un rol sin Llamadas recibe 403', async () => {
    const mine = (await calls(owner)).items[0];
    expect((await calls(other)).items).toHaveLength(0);
    await http()
      .post(`/calls/${mine._id}/claim`)
      .set(bearer(other))
      .expect(404);
    await http()
      .get(`/calls/settings/${accountId}`)
      .set(bearer(other))
      .expect(404);
    await http()
      .get(`/calls/permission?accountId=${accountId}&contact=51987654321`)
      .set(bearer(other))
      .expect(404);
    await http().get('/calls').set(bearer(server)).expect(403);
    await http()
      .get(`/calls/settings/${accountId}`)
      .set(bearer(manager))
      .expect(403);
  });
});
