import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { bearer, createApp, registerTenant, type Session } from './support/app';

type Doc = { _id: string } & Record<string, unknown>;

describe('Bandeja: reenvío sin duplicar y reintento manual (HU24, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let convs: Model<Conversation>;
  let msgs: Model<Message>;
  const http = () => request(app.getHttpServer());
  const tenantOf = (s: Session) =>
    new Types.ObjectId(s.user.tenantId as string);

  const makeConv = (contact: string) =>
    convs.create({
      tenantId: tenantOf(owner),
      channel: 'instagram',
      accountId: new Types.ObjectId(),
      contactName: 'Cliente',
      contact,
    });

  const failedMsg = (conv: Conversation, data: Record<string, unknown> = {}) =>
    msgs.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'out',
      author: 'human',
      type: 'text',
      text: 'Hola',
      status: 'failed',
      error: 'sin red',
      at: new Date(),
      ...data,
    });

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Reintentos');
    other = await registerTenant(app, 'Ajena');
    convs = app.get<Model<Conversation>>(getModelToken(Conversation.name));
    msgs = app.get<Model<Message>>(getModelToken(Message.name));
    // El índice único parcial de clientId tiene que existir.
    await msgs.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1: reenviar con el mismo clientId devuelve el mismo mensaje y no lo duplica', async () => {
    const conv = await makeConv('ig-dup');
    const body = { text: 'Te escribo sin cobertura', clientId: 'dev-abc12345' };
    const first = await http()
      .post(`/conversations/${String(conv._id)}/messages`)
      .set(bearer(owner))
      .send(body)
      .expect(201);
    const again = await http()
      .post(`/conversations/${String(conv._id)}/messages`)
      .set(bearer(owner))
      .send(body)
      .expect(201);
    expect((again.body as Doc)._id).toBe((first.body as Doc)._id);
    expect(
      await msgs.countDocuments({
        conversationId: conv._id,
        clientId: body.clientId,
      }),
    ).toBe(1);
  });

  it('C1: el mismo clientId en otro chat es un conflicto; uno inválido, 400', async () => {
    const a = await makeConv('ig-a');
    const b = await makeConv('ig-b');
    await http()
      .post(`/conversations/${String(a._id)}/messages`)
      .set(bearer(owner))
      .send({ text: 'uno', clientId: 'dev-otro-chat' })
      .expect(201);
    await http()
      .post(`/conversations/${String(b._id)}/messages`)
      .set(bearer(owner))
      .send({ text: 'uno', clientId: 'dev-otro-chat' })
      .expect(409);
    await http()
      .post(`/conversations/${String(b._id)}/messages`)
      .set(bearer(owner))
      .send({ text: 'uno', clientId: 'mal id!' })
      .expect(400);
  });

  it('C2: reintentar un fallido lo pone en pendiente; un segundo clic no lo reenvía', async () => {
    const conv = await makeConv('ig-retry');
    const msg = await failedMsg(conv);
    const url = `/conversations/${String(conv._id)}/messages/${String(msg._id)}/retry`;
    // La entrega va en segundo plano y vuelve a fallar (no hay Instagram en
    // las pruebas): se espera a que termine antes de seguir.
    const settled = async () => {
      for (let i = 0; i < 100; i++) {
        const m = await msgs.findById(msg._id).lean<Message>().exec();
        if (m?.status === 'failed') return m;
        await new Promise((r) => setTimeout(r, 50));
      }
      return msgs.findById(msg._id).lean<Message>().exec();
    };
    const res = await http().post(url).set(bearer(owner)).expect(201);
    expect((res.body as Doc).status).toBe('pending');
    expect((res.body as Doc).error).toBeUndefined();
    const failedAgain = await settled();
    expect(failedAgain?.status).toBe('failed');
    expect(failedAgain?.retryStopped).toBe(true);

    // Mientras está pendiente, un segundo clic no lo reenvía.
    await msgs.updateOne({ _id: msg._id }, { $set: { status: 'pending' } });
    await http().post(url).set(bearer(owner)).expect(409);
    // Tras volver a fallar se puede reintentar otra vez, sin crear mensajes.
    await msgs.updateOne({ _id: msg._id }, { $set: { status: 'failed' } });
    await http().post(url).set(bearer(owner)).expect(201);
    await settled();
    expect(
      await msgs.countDocuments({ conversationId: conv._id, author: 'human' }),
    ).toBe(1);
  });

  it('C3: no se reintentan los enviados, los de la API ni los de otra empresa', async () => {
    const conv = await makeConv('ig-no');
    const sent = await failedMsg(conv, { status: 'sent' });
    const api = await failedMsg(conv, { apiAccessId: new Types.ObjectId() });
    const base = `/conversations/${String(conv._id)}/messages`;
    await http()
      .post(`${base}/${String(sent._id)}/retry`)
      .set(bearer(owner))
      .expect(409);
    await http()
      .post(`${base}/${String(api._id)}/retry`)
      .set(bearer(owner))
      .expect(409);
    const own = await failedMsg(conv);
    await http()
      .post(`${base}/${String(own._id)}/retry`)
      .set(bearer(other))
      .expect(404);
    expect((await msgs.findById(own._id).lean<Message>().exec())?.status).toBe(
      'failed',
    );
  });
});
