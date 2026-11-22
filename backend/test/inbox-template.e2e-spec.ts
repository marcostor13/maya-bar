import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { WaTemplate } from '../src/whatsapp-templates/wa-template.schema';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Doc = { _id: string } & Record<string, unknown>;
const HOUR = 60 * 60 * 1000;

describe('Bandeja: ventana de 24 h y plantillas desde el chat (HU27, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let convs: Model<Conversation>;
  let msgs: Model<Message>;
  let templates: Model<WaTemplate>;
  let accountId: Types.ObjectId;
  let otherAccountId: Types.ObjectId;
  let graphPost: jest.SpyInstance;
  let seq = 0;
  const http = () => request(app.getHttpServer());
  const tenant = () => new Types.ObjectId(owner.user.tenantId as string);

  /** Chat de WhatsApp Cloud API cuyo último entrante fue hace `hoursAgo` (null = nunca). */
  const makeChat = async (hoursAgo: number | null) => {
    const conv = await convs.create({
      tenantId: tenant(),
      channel: 'whatsapp',
      accountId,
      contact: `5199900${String(++seq).padStart(4, '0')}`,
      contactName: 'Ana',
      autoReply: false,
    });
    if (hoursAgo !== null)
      await msgs.create({
        tenantId: conv.tenantId,
        conversationId: conv._id,
        direction: 'in',
        author: 'customer',
        type: 'text',
        text: 'Hola',
        status: 'sent',
        at: new Date(Date.now() - hoursAgo * HOUR),
      });
    return conv;
  };

  const metaSends = () =>
    (graphPost.mock.calls as [string, { json: Record<string, unknown> }][])
      .filter(([path]) => String(path).endsWith('/messages'))
      .map(([, opts]) => opts.json);

  const settled = async (id: unknown) => {
    for (let i = 0; i < 100; i++) {
      const m = await msgs.findById(id).lean<Message>().exec();
      if (m && m.status !== 'pending') return m;
      await new Promise((r) => setTimeout(r, 50));
    }
    return msgs.findById(id).lean<Message>().exec();
  };

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Ventana');
    other = await registerTenant(app, 'Ajena');
    convs = app.get<Model<Conversation>>(getModelToken(Conversation.name));
    msgs = app.get<Model<Message>>(getModelToken(Message.name));
    templates = app.get<Model<WaTemplate>>(getModelToken(WaTemplate.name));
    const accounts = app.get<Model<WhatsAppAccount>>(
      getModelToken(WhatsAppAccount.name),
    );
    const mk = (label: string) =>
      accounts.create({
        tenantId: tenant(),
        label,
        provider: 'cloudapi',
        waPhoneNumberId: `PNID${label}${Date.now()}`,
        waAccessToken: 'token-de-prueba',
        active: true,
      });
    accountId = (await mk('Ventas'))._id;
    otherAccountId = (await mk('Soporte'))._id;

    let n = 0;
    graphPost = jest
      .spyOn(app.get(MetaGraphClient), 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(
          String(path).endsWith('/messages')
            ? { messages: [{ id: `wamid.tpl${++n}` }] }
            : { success: true },
        ),
      );
  });

  beforeEach(() => graphPost.mockClear());

  afterAll(async () => {
    await app.close();
  });

  const tpl = (data: Record<string, unknown> = {}) =>
    templates.create({
      tenantId: tenant(),
      accountId,
      metaId: `meta-${++seq}`,
      name: `seguimiento_${seq}`,
      category: 'UTILITY',
      language: 'es',
      status: 'APPROVED',
      body: 'Hola {{1}}, ¿seguimos con tu consulta?',
      ...data,
    });

  it('C1: la ventana del chat dice si está abierta y cuándo vence', async () => {
    const open = await makeChat(3);
    const res = await http()
      .get(`/conversations/${String(open._id)}/window`)
      .set(bearer(owner))
      .expect(200);
    expect(res.body).toMatchObject({ applies: true, open: true });
    const left = new Date(res.body.expiresAt as string).getTime() - Date.now();
    expect(left).toBeGreaterThan(20 * HOUR);
    expect(left).toBeLessThan(21 * HOUR + 60_000);

    const closed = await makeChat(25);
    await http()
      .get(`/conversations/${String(closed._id)}/window`)
      .set(bearer(owner))
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ open: false }));
  });

  it('C5: texto libre con la ventana cerrada → 409 sin llamar a Meta ni guardar', async () => {
    const conv = await makeChat(30);
    const res = await http()
      .post(`/conversations/${String(conv._id)}/messages`)
      .set(bearer(owner))
      .send({ text: 'Hola de nuevo' })
      .expect(409);
    expect(String(res.body.message)).toMatch(/ventana de 24 h/);
    expect(metaSends()).toHaveLength(0);
    expect(
      await msgs.countDocuments({ conversationId: conv._id, direction: 'out' }),
    ).toBe(0);
  });

  it('C3: lista las aprobadas de la cuenta del chat y envía una que reabre el chat', async () => {
    const good = await tpl();
    await tpl({ status: 'PENDING', name: 'pendiente' });
    await tpl({ category: 'AUTHENTICATION', name: 'codigo' });
    await tpl({ accountId: otherAccountId, name: 'otra_cuenta' });
    const conv = await makeChat(null);
    const list = await http()
      .get(`/conversations/${String(conv._id)}/templates`)
      .set(bearer(owner))
      .expect(200);
    const names = (list.body as Doc[]).map((t) => t.name);
    expect(names).toContain(good.name);
    expect(names).not.toContain('pendiente');
    expect(names).not.toContain('codigo');
    expect(names).not.toContain('otra_cuenta');

    const sent = await http()
      .post(`/conversations/${String(conv._id)}/messages/template`)
      .set(bearer(owner))
      .send({
        templateId: String(good._id),
        variables: ['Ana'],
        clientId: 'dev-tpl-0001',
      })
      .expect(201);
    expect(sent.body).toMatchObject({
      text: 'Hola Ana, ¿seguimos con tu consulta?',
      template: { name: good.name, language: 'es', variables: ['Ana'] },
    });
    const final = await settled(sent.body._id);
    expect(final?.status).toBe('sent');
    const [payload] = metaSends();
    expect(payload).toMatchObject({
      type: 'template',
      to: conv.contact,
      template: { name: good.name, language: { code: 'es' } },
    });
  });

  it('C4: sin variables, de otra cuenta o no aprobada → 422 sin enviar', async () => {
    const conv = await makeChat(null);
    const good = await tpl();
    const foreign = await tpl({ accountId: otherAccountId });
    const pending = await tpl({ status: 'PENDING' });
    const url = `/conversations/${String(conv._id)}/messages/template`;
    await http()
      .post(url)
      .set(bearer(owner))
      .send({ templateId: String(good._id), variables: [] })
      .expect(422);
    await http()
      .post(url)
      .set(bearer(owner))
      .send({ templateId: String(foreign._id), variables: ['Ana'] })
      .expect(422);
    await http()
      .post(url)
      .set(bearer(owner))
      .send({ templateId: String(pending._id), variables: ['Ana'] })
      .expect(422);
    await http()
      .post(url)
      .set(bearer(owner))
      .send({ templateId: 'no-es-id' })
      .expect(400);
    expect(metaSends()).toHaveLength(0);
  });

  it('C8: otra empresa no ve ni usa el chat; un rol sin permiso, 403', async () => {
    const conv = await makeChat(3);
    const good = await tpl();
    await http()
      .get(`/conversations/${String(conv._id)}/window`)
      .set(bearer(other))
      .expect(404);
    await http()
      .get(`/conversations/${String(conv._id)}/templates`)
      .set(bearer(other))
      .expect(404);
    await http()
      .post(`/conversations/${String(conv._id)}/messages/template`)
      .set(bearer(other))
      .send({ templateId: String(good._id), variables: ['Ana'] })
      .expect(404);
    const kitchen = await createUser(app, owner, 'KITCHEN');
    await http()
      .get(`/conversations/${String(conv._id)}/templates`)
      .set(bearer(kitchen))
      .expect(403);
    expect(metaSends()).toHaveLength(0);
  });
});
