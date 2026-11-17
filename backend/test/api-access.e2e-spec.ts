import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { ApiAccess } from '../src/api-access/api-access.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Doc = Record<string, unknown>;

describe('API de envío de mensajes (HU13, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let accountId: string;
  let phoneNumberId: string;
  let graphPost: jest.SpyInstance;
  let messages: Model<Message>;
  let accesses: Model<ApiAccess>;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const phone = () => `5198811${String(++seq).padStart(4, '0')}`;
  const ORIGIN = 'https://www.mitienda.pe';

  /** Chat con un entrante reciente: la ventana de 24 h está abierta. */
  async function openChat(contact: string) {
    const convs = app.get<Model<Conversation>>(
      getModelToken(Conversation.name),
    );
    const conv = await convs.create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      channel: 'whatsapp',
      accountId: new Types.ObjectId(accountId),
      contact,
      autoReply: false,
      status: 'open',
      lastMessageAt: new Date(),
    });
    await messages.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'in',
      author: 'customer',
      type: 'text',
      text: 'Hola, quiero info',
      status: 'read',
      at: new Date(Date.now() - 60_000),
    });
    return conv;
  }

  async function createAccess(extra: Doc = {}) {
    const res = await http()
      .post('/api-access')
      .set(bearer(owner))
      .send({
        name: 'Web',
        channel: 'whatsapp',
        accountId,
        allowedDomains: ['mitienda.pe'],
        ...extra,
      })
      .expect(201);
    return res.body as { access: Doc; key: string };
  }

  const send = (key: string, body: Doc, origin: string | null = ORIGIN) => {
    const req = http()
      .post('/public/v1/messages')
      .set('Authorization', `Bearer ${key}`);
    if (origin) req.set('Origin', origin);
    return req.send(body);
  };

  const sentTo = (to: string): unknown[] =>
    (graphPost.mock.calls as [string, unknown][]).filter(
      ([path, opts]) =>
        String(path).endsWith('/messages') &&
        (opts as { json: { to?: string } }).json.to === to,
    );

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Integra');
    other = await registerTenant(app, 'Ajena');
    messages = app.get<Model<Message>>(getModelToken(Message.name));
    accesses = app.get<Model<ApiAccess>>(getModelToken(ApiAccess.name));
    phoneNumberId = `PNID${Date.now()}`;
    const acc = await app
      .get<Model<WhatsAppAccount>>(getModelToken(WhatsAppAccount.name))
      .create({
        tenantId: new Types.ObjectId(owner.user.tenantId!),
        label: 'Ventas',
        provider: 'cloudapi',
        waPhoneNumberId: phoneNumberId,
        waAccessToken: 'token-de-prueba',
        active: true,
      });
    accountId = String(acc._id);

    let n = 0;
    graphPost = jest
      .spyOn(app.get(MetaGraphClient), 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(
          String(path).endsWith('/messages')
            ? { messages: [{ id: `wamid.api${++n}` }] }
            : { success: true },
        ),
      );
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1: crea un acceso, muestra la clave una vez y la lista no la expone', async () => {
    const { access, key } = await createAccess();
    expect(key).toMatch(/^mk_/);
    expect(access).not.toHaveProperty('keyHash');

    const stored = await accesses.findById(access._id).lean();
    expect(stored?.keyHash).toBeDefined();
    expect(stored?.keyHash).not.toContain(key);

    const list = (
      await http().get('/api-access').set(bearer(owner)).expect(200)
    ).body as Doc[];
    expect(JSON.stringify(list)).not.toContain(key);
    expect(list.map((a) => a._id)).toContain(access._id);

    const accounts = (
      await http().get('/api-access/accounts').set(bearer(owner)).expect(200)
    ).body as Doc[];
    expect(accounts).toEqual([
      expect.objectContaining({ channel: 'whatsapp', id: accountId }),
    ]);
  });

  it('C2: otra empresa no ve los accesos ni comparte cuentas ajenas; un rol sin el módulo no entra', async () => {
    await createAccess();
    const list = (
      await http().get('/api-access').set(bearer(other)).expect(200)
    ).body as Doc[];
    expect(list).toEqual([]);
    await http()
      .post('/api-access')
      .set(bearer(other))
      .send({
        name: 'X',
        channel: 'whatsapp',
        accountId,
        allowedDomains: ['x.com'],
      })
      .expect(404);

    const manager = await createUser(app, owner, 'MANAGER');
    await http().get('/api-access').set(bearer(manager)).expect(403);
  });

  it('C4: sin clave o revocada → 401; sin Origin o dominio ajeno → 403', async () => {
    const { access, key } = await createAccess();
    await http()
      .post('/public/v1/messages')
      .send({ to: '1', text: 'x' })
      .expect(401);
    await send('mk_inventada', { to: '1', text: 'x' }).expect(401);
    const noOrigin = await send(key, { to: '1', text: 'x' }, null).expect(403);
    expect((noOrigin.body as Doc).message).toMatch(/Origin/);
    await send(key, { to: '1', text: 'x' }, 'https://otra.pe').expect(403);

    await http()
      .post(`/api-access/${String(access._id)}/revoke`)
      .set(bearer(owner))
      .expect(201);
    await send(key, { to: '1', text: 'x' }).expect(401);
  });

  it('C3, C11: envía un texto, queda en la bandeja con el nombre del acceso y se consulta su estado', async () => {
    const { key } = await createAccess({ name: 'Checkout web' });
    const to = phone();
    const conv = await openChat(to);

    const res = await send(key, {
      to: `+${to}`,
      text: 'Tu pedido salió',
    }).expect(201);
    const body = res.body as Doc;
    expect(body).toEqual(
      expect.objectContaining({
        status: 'sent',
        channel: 'whatsapp',
        to,
        conversationId: String(conv._id),
      }),
    );
    expect(sentTo(to)).toHaveLength(1);

    const saved = await messages.findById(body.id).lean();
    expect(saved).toEqual(
      expect.objectContaining({
        direction: 'out',
        text: 'Tu pedido salió',
        apiAccessName: 'Checkout web',
      }),
    );
    expect(String(saved?.externalId)).toMatch(/^wamid\.api/);

    // El hilo de la bandeja lo devuelve como cualquier otro mensaje.
    const thread = (
      await http()
        .get(`/conversations/${String(conv._id)}/messages`)
        .set(bearer(owner))
        .expect(200)
    ).body as Doc[] | { items: Doc[] };
    const items = Array.isArray(thread) ? thread : thread.items;
    expect(items.map((m) => m._id)).toContain(body.id);

    const status = await http()
      .get(`/public/v1/messages/${String(body.id)}`)
      .set('Authorization', `Bearer ${key}`)
      .set('Origin', ORIGIN)
      .expect(200);
    expect((status.body as Doc).status).toBe('sent');

    // Otro acceso no ve ese mensaje.
    const { key: otherKey } = await createAccess();
    await http()
      .get(`/public/v1/messages/${String(body.id)}`)
      .set('Authorization', `Bearer ${otherKey}`)
      .set('Origin', ORIGIN)
      .expect(404);
  });

  it('C6: a un número sin chat abierto, texto → 422', async () => {
    const { key } = await createAccess();
    const to = phone();
    const res = await send(key, { to, text: 'hola' }).expect(422);
    expect((res.body as Doc).message).toMatch(/plantilla/);
    expect(sentTo(to)).toHaveLength(0);
  });

  it('C10: la misma Idempotency-Key no envía dos veces', async () => {
    const { key } = await createAccess();
    const to = phone();
    await openChat(to);
    const first = await send(key, { to, text: 'una vez' })
      .set('Idempotency-Key', 'pedido-77')
      .expect(201);
    const again = await send(key, { to, text: 'una vez' })
      .set('Idempotency-Key', 'pedido-77')
      .expect(200);
    expect((again.body as Doc).id).toBe((first.body as Doc).id);
    expect(sentTo(to)).toHaveLength(1);
  });

  it('C9: superado el límite por minuto → 429 con Retry-After', async () => {
    const { key } = await createAccess({ perMinuteLimit: 1 });
    const to = phone();
    await openChat(to);
    await send(key, { to, text: 'uno' }).expect(201);
    const res = await send(key, { to, text: 'dos' }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('C14: cuerpo inválido → 400', async () => {
    const { key } = await createAccess();
    await send(key, { text: 'sin destinatario' }).expect(400);
    await send(key, { to: phone() }).expect(400);
    await send(key, { to: phone(), mediaUrl: 'http://x.com/a.png' }).expect(
      400,
    );
  });
});
