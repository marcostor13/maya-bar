import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { bearer, createApp, registerTenant, type Session } from './support/app';

type Row = {
  _id: string;
  match?: { messageId: string; at: string; snippet: string };
};

describe('Bandeja: búsqueda dentro de los mensajes (HU74, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let convs: Model<Conversation>;
  let msgs: Model<Message>;
  const http = () => request(app.getHttpServer());
  const tenantOf = (s: Session) =>
    new Types.ObjectId(s.user.tenantId as string);

  const makeConv = (s: Session, data: Record<string, unknown>) =>
    convs.create({
      tenantId: tenantOf(s),
      channel: 'whatsapp',
      accountId: new Types.ObjectId(),
      contactName: 'Cliente',
      lastMessagePreview: 'Gracias, hasta luego',
      lastMessageAt: new Date(),
      ...data,
    });

  const makeMsg = (
    s: Session,
    conversationId: Types.ObjectId,
    data: Record<string, unknown>,
  ) =>
    msgs.create({
      tenantId: tenantOf(s),
      conversationId,
      direction: 'in',
      author: 'customer',
      type: 'text',
      at: new Date(),
      ...data,
    });

  const search = async (s: Session, query: string) =>
    (await http().get(`/conversations?${query}`).set(bearer(s)).expect(200))
      .body as Row[];

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Buscadora');
    other = await registerTenant(app, 'Vecina');
    convs = app.get<Model<Conversation>>(getModelToken(Conversation.name));
    msgs = app.get<Model<Message>>(getModelToken(Message.name));
  });

  afterAll(async () => {
    await app.close();
  });

  it('encuentra un chat por un mensaje antiguo y devuelve el fragmento (C1)', async () => {
    const conv = await makeConv(owner, { contact: '51900000001' });
    const old = await makeMsg(owner, conv._id, {
      text: 'Hola, necesito la factura del pedido 4471 a nombre de mi empresa',
      at: new Date(Date.now() - 86_400_000),
    });
    await makeMsg(owner, conv._id, { text: 'Gracias, hasta luego' });

    const rows = await search(owner, 'q=FACTURA');
    const row = rows.find((r) => r._id === String(conv._id));
    expect(row).toBeDefined();
    expect(row!.match?.messageId).toBe(String(old._id));
    expect(row!.match?.snippet.toLowerCase()).toContain('factura');
  });

  it('nunca devuelve chats de otra empresa (C2)', async () => {
    const foreign = await makeConv(other, { contact: '51900000002' });
    await makeMsg(other, foreign._id, { text: 'código secreto zanahoria' });

    const rows = await search(owner, 'q=zanahoria');
    expect(rows.map((r) => r._id)).not.toContain(String(foreign._id));
    const theirs = await search(other, 'q=zanahoria');
    expect(theirs.map((r) => r._id)).toContain(String(foreign._id));
  });

  it('con un solo carácter no busca en los mensajes (C3)', async () => {
    const conv = await makeConv(owner, { contact: '51900000003' });
    await makeMsg(owner, conv._id, { text: 'ñ' });
    const rows = await search(owner, `q=${encodeURIComponent('ñ')}`);
    expect(rows.map((r) => r._id)).not.toContain(String(conv._id));
  });

  it('encuentra por la transcripción de un audio (C4)', async () => {
    const conv = await makeConv(owner, { contact: '51900000004' });
    await makeMsg(owner, conv._id, {
      type: 'audio',
      text: '',
      transcript: 'quisiera reservar para el sábado en la terraza',
    });
    const rows = await search(owner, 'q=terraza');
    const row = rows.find((r) => r._id === String(conv._id));
    expect(row?.match?.snippet).toContain('terraza');
  });

  it('respeta el filtro de canal (C5)', async () => {
    const conv = await makeConv(owner, {
      contact: 'ig-buscado',
      channel: 'instagram',
    });
    await makeMsg(owner, conv._id, { text: 'precio del combo familiar' });
    const wa = await search(owner, 'q=combo&channel=whatsapp');
    expect(wa.map((r) => r._id)).not.toContain(String(conv._id));
    const ig = await search(owner, 'q=combo&channel=instagram');
    expect(ig.map((r) => r._id)).toContain(String(conv._id));
  });

  it('los caracteres especiales se buscan literales (C6)', async () => {
    const rows = await search(owner, `q=${encodeURIComponent('.*(')}`);
    expect(rows).toEqual([]);
  });
});
