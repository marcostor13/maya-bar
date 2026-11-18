import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { ApiAccess } from '../src/api-access/api-access.schema';
import { SmsConfig } from '../src/sms/sms-config.schema';
import { SmsService } from '../src/sms/sms.service';
import { signMetaBody } from '../src/shared/meta-signature';
import { ApiWebhookService } from '../src/api-access/api-webhook.service';
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

  describe('SMS por la API (HU14)', () => {
    let smsId: string;
    let dispatch: jest.SpyInstance;

    beforeAll(async () => {
      const cfg = await app
        .get<Model<SmsConfig>>(getModelToken(SmsConfig.name))
        .create({
          tenantId: new Types.ObjectId(owner.user.tenantId!),
          enabled: true,
          name: 'Proveedor X',
          url: 'https://sms.example.com/send',
          from: 'MAYA',
        });
      smsId = String(cfg._id);
      let n = 0;
      dispatch = jest
        .spyOn(app.get(SmsService), 'dispatch')
        .mockImplementation(() =>
          Promise.resolve({ id: `sms-${++n}`, status: 200, response: 'ok' }),
        );
    });

    const smsAccess = async () =>
      (
        await http()
          .post('/api-access')
          .set(bearer(owner))
          .send({
            name: 'Web SMS',
            channel: 'sms',
            accountId: smsId,
            allowedDomains: ['mitienda.pe'],
          })
          .expect(201)
      ).body as { access: Doc; key: string };

    it('C1: el proveedor SMS aparece entre las cuentas compartibles', async () => {
      const list = (
        await http().get('/api-access/accounts').set(bearer(owner)).expect(200)
      ).body as Doc[];
      expect(list).toContainEqual(
        expect.objectContaining({ channel: 'sms', id: smsId, active: true }),
      );
    });

    it('C2: otra empresa no puede crear un acceso con este proveedor (404)', async () => {
      await http()
        .post('/api-access')
        .set(bearer(other))
        .send({
          name: 'Robo',
          channel: 'sms',
          accountId: smsId,
          allowedDomains: ['x.pe'],
        })
        .expect(404);
    });

    it('C3, C7, C8: envía, no duplica con Idempotency-Key y consulta el estado', async () => {
      const { key } = await smsAccess();
      const first = await send(key, {
        to: '+51 988 776 655',
        text: 'Tu código es 1234',
      })
        .set('Idempotency-Key', 'sms-1')
        .expect(201);
      expect(first.body).toMatchObject({
        status: 'sent',
        channel: 'sms',
        to: '+51988776655',
        segments: 1,
      });
      await send(key, { to: '+51988776655', text: 'Tu código es 1234' })
        .set('Idempotency-Key', 'sms-1')
        .expect(200);
      expect(
        dispatch.mock.calls.filter(([, to]) => to === '+51988776655'),
      ).toHaveLength(1);

      const id = (first.body as Doc).id as string;
      const status = await http()
        .get(`/public/v1/messages/${id}`)
        .set('Authorization', `Bearer ${key}`)
        .set('Origin', ORIGIN)
        .expect(200);
      expect((status.body as Doc).status).toBe('sent');

      const { key: otherKey } = await smsAccess();
      await http()
        .get(`/public/v1/messages/${id}`)
        .set('Authorization', `Bearer ${otherKey}`)
        .set('Origin', ORIGIN)
        .expect(404);
    });

    it('C4: un número en "No contactar" da 422 sin llamar al proveedor', async () => {
      const { key } = await smsAccess();
      await http()
        .post('/suppression')
        .set(bearer(owner))
        .send({ phone: '+51977665544', reason: 'pidió baja' })
        .expect(201);
      const before = dispatch.mock.calls.length;
      await send(key, { to: '+51977665544', text: 'Hola' }).expect(422);
      expect(dispatch.mock.calls.length).toBe(before);
    });
  });

  describe('Webhook de salida (HU15)', () => {
    const HOOK = 'https://8.8.8.8/maya';
    let hookPost: jest.SpyInstance;

    beforeAll(() => {
      hookPost = jest
        .spyOn(app.get(ApiWebhookService), 'post')
        .mockResolvedValue({ status: 200 });
    });

    async function metaWebhook(value: Record<string, unknown>) {
      const raw = JSON.stringify({
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: phoneNumberId },
                  ...value,
                },
              },
            ],
          },
        ],
      });
      await http()
        .post('/wa/webhook/cloud')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signMetaBody(raw, 'e2e-app-secret'))
        .send(raw)
        .expect(200);
    }

    async function until<T>(fn: () => Promise<T | undefined | null | false>) {
      const end = Date.now() + 4000;
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > end) throw new Error('Tiempo de espera agotado');
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    const hooks = (accessId: string) =>
      http()
        .get(`/api-access/${accessId}/webhook/deliveries`)
        .set(bearer(owner))
        .expect(200)
        .then((r) => r.body as Doc[]);

    it('C1, C8: guarda la URL, devuelve el secreto una vez y aísla entre empresas', async () => {
      const { access } = await createAccess();
      const id = access._id as string;
      await http()
        .put(`/api-access/${id}/webhook`)
        .set(bearer(owner))
        .send({ url: 'http://8.8.8.8/x' })
        .expect(400);
      const res = await http()
        .put(`/api-access/${id}/webhook`)
        .set(bearer(owner))
        .send({ url: HOOK })
        .expect(200);
      const secret = (res.body as Doc).secret as string;
      expect(secret).toMatch(/^whsec_/);
      const list = (
        await http().get('/api-access').set(bearer(owner)).expect(200)
      ).body as Doc[];
      expect(JSON.stringify(list)).not.toContain(secret);
      expect(list.find((a) => a._id === id)?.webhookUrl).toBe(HOOK);

      await http()
        .put(`/api-access/${id}/webhook`)
        .set(bearer(other))
        .send({ url: HOOK })
        .expect(404);
      await http()
        .get(`/api-access/${id}/webhook/deliveries`)
        .set(bearer(other))
        .expect(404);
    });

    it('C3, C4, C7: avisa delivered (una vez), read, la respuesta del contacto y la prueba', async () => {
      const { access, key } = await createAccess();
      const id = access._id as string;
      await http()
        .put(`/api-access/${id}/webhook`)
        .set(bearer(owner))
        .send({ url: HOOK })
        .expect(200);

      const to = phone();
      await openChat(to);
      const sent = await send(key, { to, text: 'Pedido listo' }).expect(201);
      const msg = await messages.findById((sent.body as Doc).id).lean();
      const wamid = msg!.externalId!;

      const status = (s: string) =>
        metaWebhook({
          statuses: [
            {
              id: wamid,
              status: s,
              timestamp: String(Math.floor(Date.now() / 1000)),
              recipient_id: to,
            },
          ],
        });
      await status('delivered');
      await status('delivered');
      await status('read');
      await metaWebhook({
        contacts: [{ wa_id: to, profile: { name: 'Cliente' } }],
        messages: [
          {
            from: to,
            id: `wamid.in${Date.now()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: 'Gracias, paso a recoger' },
          },
        ],
      });

      const events = await until(async () => {
        const list = await hooks(id);
        const names = list.map((d) => d.event);
        return names.includes('message.received') &&
          names.includes('message.read')
          ? names
          : null;
      });
      expect(events.filter((e) => e === 'message.delivered')).toHaveLength(1);
      expect(events).toEqual(
        expect.arrayContaining(['message.sent', 'message.read']),
      );
      const received = hookPost.mock.calls
        .map(([, body]) => JSON.parse(body as string) as Doc)
        .find((b) => b.event === 'message.received');
      expect((received!.data as Doc).text).toBe('Gracias, paso a recoger');

      await http()
        .post(`/api-access/${id}/webhook/test`)
        .set(bearer(owner))
        .expect(201);
      const withPing = await until(async () => {
        const list = await hooks(id);
        return list.find((d) => d.event === 'ping' && d.status === 'delivered');
      });
      expect(withPing).toMatchObject({ attempts: 1, lastStatus: 200 });
    });
  });
});
