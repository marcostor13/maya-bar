import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { ConversationsService } from '../src/conversations/conversations.service';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Doc = { _id: string } & Record<string, unknown>;

describe('Bandeja: papelera y bloqueos (e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let marketing: Session;
  let convs: Model<Conversation>;
  let msgs: Model<Message>;
  const http = () => request(app.getHttpServer());
  const tenantOf = (s: Session) =>
    new Types.ObjectId(s.user.tenantId as string);

  const makeConv = (data: Record<string, unknown>) =>
    convs.create({
      tenantId: tenantOf(owner),
      channel: 'instagram',
      accountId: new Types.ObjectId(),
      contactName: 'Cliente',
      ...data,
    });

  /** Ids que devuelve la bandeja (fuera de la papelera). */
  const inboxIds = async () =>
    (
      (await http().get('/conversations').set(bearer(owner)).expect(200))
        .body as Doc[]
    ).map((c) => c._id);

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Principal');
    other = await registerTenant(app, 'Ajena');
    marketing = await createUser(app, owner, 'MARKETING');
    convs = app.get<Model<Conversation>>(getModelToken(Conversation.name));
    msgs = app.get<Model<Message>>(getModelToken(Message.name));
    // El índice único parcial tiene que existir para probar la papelera.
    await convs.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('solo el administrador puede eliminar y ver la papelera', async () => {
    const conv = await makeConv({ contact: 'ig-permiso' });
    const id = String(conv._id);

    const own = await http()
      .get('/conversations/permissions')
      .set(bearer(owner))
      .expect(200);
    expect(own.body).toEqual({ canDelete: true });
    const mk = await http()
      .get('/conversations/permissions')
      .set(bearer(marketing))
      .expect(200);
    expect(mk.body).toEqual({ canDelete: false });

    await http()
      .delete(`/conversations/${id}`)
      .set(bearer(marketing))
      .expect(403);
    await http()
      .post('/conversations/bulk-delete')
      .set(bearer(marketing))
      .send({ ids: [id] })
      .expect(403);
    await http().get('/conversations/trash').set(bearer(marketing)).expect(403);
    expect(await inboxIds()).toContain(id);
  });

  it('eliminar oculta el chat en toda la bandeja y restaurar lo devuelve', async () => {
    const conv = await makeConv({ contact: 'ig-papelera', unreadCount: 4 });
    const id = String(conv._id);
    const unreadBefore = (
      await http()
        .get('/conversations/unread-count')
        .set(bearer(owner))
        .expect(200)
    ).body as { total: number };

    // Otra empresa no lo puede tocar.
    await http().delete(`/conversations/${id}`).set(bearer(other)).expect(404);

    const del = await http()
      .post('/conversations/bulk-delete')
      .set(bearer(owner))
      .send({ ids: [id] })
      .expect(201);
    expect(del.body).toMatchObject({ trashed: 1, ids: [id], blocked: 0 });

    expect(await inboxIds()).not.toContain(id);
    await http().get(`/conversations/${id}`).set(bearer(owner)).expect(404);
    const unreadAfter = (
      await http()
        .get('/conversations/unread-count')
        .set(bearer(owner))
        .expect(200)
    ).body as { total: number };
    expect(unreadAfter.total).toBe(unreadBefore.total - 4);

    const trash = (
      await http().get('/conversations/trash').set(bearer(owner)).expect(200)
    ).body as Array<Doc & { purgeAt: string; trashedByName: string }>;
    const row = trash.find((t) => t._id === id)!;
    expect(row.trashedByName).toBeTruthy();
    expect(new Date(row.purgeAt).getTime()).toBeGreaterThan(Date.now());
    // La papelera de otra empresa no lo ve ni lo restaura.
    const foreign = await http()
      .get('/conversations/trash')
      .set(bearer(other))
      .expect(200);
    expect(foreign.body).toEqual([]);
    await http()
      .post(`/conversations/trash/${id}/restore`)
      .set(bearer(other))
      .expect(404);

    const restored = await http()
      .post(`/conversations/trash/${id}/restore`)
      .set(bearer(owner))
      .expect(201);
    expect(restored.body).toMatchObject({ merged: false });
    expect(await inboxIds()).toContain(id);
  });

  it('si el contacto escribe con su chat en la papelera, se abre otro; al restaurar se unen', async () => {
    const accountId = new Types.ObjectId();
    const old = await makeConv({ contact: 'ig-vuelve', accountId });
    await msgs.create({
      tenantId: tenantOf(owner),
      conversationId: old._id,
      direction: 'in',
      author: 'customer',
      type: 'text',
      text: 'mensaje viejo',
    });
    await http()
      .delete(`/conversations/${String(old._id)}`)
      .set(bearer(owner))
      .expect(200);

    // Mismo canal, cuenta y contacto: el índice único no lo impide.
    const fresh = await makeConv({ contact: 'ig-vuelve', accountId });
    expect(String(fresh._id)).not.toBe(String(old._id));

    const res = await http()
      .post(`/conversations/trash/${String(old._id)}/restore`)
      .set(bearer(owner))
      .expect(201);
    expect(res.body).toMatchObject({ merged: true });
    const history = await http()
      .get(`/conversations/${String(fresh._id)}/messages`)
      .set(bearer(owner))
      .expect(200);
    expect(JSON.stringify(history.body)).toContain('mensaje viejo');
  });

  it('el bloqueo sobrevive a borrar el chat: lo que llega se descarta sin crear nada', async () => {
    const contact = '51911222333';
    const accountId = new Types.ObjectId();
    const conv = await makeConv({ channel: 'whatsapp', contact, accountId });
    const id = String(conv._id);

    const blocked = await http()
      .patch(`/conversations/${id}/block`)
      .set(bearer(owner))
      .send({ blocked: true, reason: 'Spam' })
      .expect(200);
    // La cuenta de WhatsApp no existe en la prueba: queda bloqueado en la plataforma.
    expect(blocked.body).toMatchObject({
      blocked: true,
      channelBlocked: false,
    });

    await http().delete(`/conversations/${id}`).set(bearer(owner)).expect(200);
    await http()
      .delete(`/conversations/trash/${id}`)
      .set(bearer(owner))
      .expect(200);

    const list = (
      await http().get('/conversations/blocked').set(bearer(owner)).expect(200)
    ).body as Array<Doc & { identifier: string; reason: string }>;
    expect(list.find((b) => b.identifier === contact)?.reason).toBe('Spam');

    await app.get(ConversationsService).handleWhatsAppInbound(
      {
        _id: accountId,
        tenantId: tenantOf(owner),
        provider: 'cloudapi',
      } as never,
      { contact, type: 'text', text: 'hola otra vez' },
    );
    const count = await convs.countDocuments({
      contact,
      inTrash: { $in: [true, false] },
    });
    expect(count).toBe(0);
  });

  it('bloqueo a mano: normaliza, aísla por empresa y se puede quitar', async () => {
    const entry = (
      await http()
        .post('/conversations/blocked')
        .set(bearer(owner))
        .send({ channel: 'whatsapp', contact: '999 777 666', reason: 'Acoso' })
        .expect(201)
    ).body as Doc & { identifier: string };
    expect(entry.identifier).toBe('51999777666');

    await http()
      .post('/conversations/blocked')
      .set(bearer(owner))
      .send({ channel: 'fax', contact: '1' })
      .expect(400);

    const foreign = await http()
      .get('/conversations/blocked')
      .set(bearer(other))
      .expect(200);
    expect(foreign.body).toEqual([]);
    await http()
      .delete(`/conversations/blocked/${entry._id}`)
      .set(bearer(other))
      .expect(404);

    await http()
      .delete(`/conversations/blocked/${entry._id}`)
      .set(bearer(owner))
      .expect(200);
    const after = (
      await http().get('/conversations/blocked').set(bearer(owner)).expect(200)
    ).body as Doc[];
    expect(after.map((b) => b._id)).not.toContain(entry._id);
  });

  it('otra empresa no puede eliminar ni borrar definitivamente chats ajenos', async () => {
    const conv = await makeConv({ contact: 'ig-ajeno' });
    const id = String(conv._id);

    const bulk = await http()
      .post('/conversations/bulk-delete')
      .set(bearer(other))
      .send({ ids: [id], block: true })
      .expect(201);
    expect(bulk.body).toMatchObject({ trashed: 0, blocked: 0 });
    expect(await inboxIds()).toContain(id);

    await http().delete(`/conversations/${id}`).set(bearer(owner)).expect(200);
    await http()
      .delete(`/conversations/trash/${id}`)
      .set(bearer(other))
      .expect(404);
    await http().delete('/conversations/trash').set(bearer(other)).expect(200);
    const trash = (
      await http().get('/conversations/trash').set(bearer(owner)).expect(200)
    ).body as Doc[];
    expect(trash.map((t) => t._id)).toContain(id);
  });

  it('los mensajes de un chat en la papelera no cuentan en el panel', async () => {
    const conv = await makeConv({ contact: 'ig-panel' });
    await msgs.create({
      tenantId: tenantOf(owner),
      conversationId: conv._id,
      direction: 'out',
      author: 'human',
      type: 'text',
      text: 'respuesta',
    });
    const humanReplies = async () =>
      (
        (await http().get('/dashboard/crm').set(bearer(owner)).expect(200))
          .body as { agentes: { respuestasHumanas: number } }
      ).agentes.respuestasHumanas;

    const before = await humanReplies();
    await http()
      .delete(`/conversations/${String(conv._id)}`)
      .set(bearer(owner))
      .expect(200);
    expect(await humanReplies()).toBe(before - 1);
    await http()
      .post(`/conversations/trash/${String(conv._id)}/restore`)
      .set(bearer(owner))
      .expect(201);
    expect(await humanReplies()).toBe(before);
  });

  it('"Eliminar" de Bandeja solo decide sobre eliminar conversaciones: desbloquear es editar', async () => {
    const roles = (await http().get('/roles').set(bearer(owner)).expect(200))
      .body as Array<{ key: string; modules: string[] }>;
    const mk = roles.find((r) => r.key === 'MARKETING')!;
    await http()
      .patch('/roles/MARKETING')
      .set(bearer(owner))
      .send({ modules: mk.modules, actions: { inbox: ['create', 'edit'] } })
      .expect(200);

    const entry = (
      await http()
        .post('/conversations/blocked')
        .set(bearer(owner))
        .send({ channel: 'email', contact: 'spam@e2e.test' })
        .expect(201)
    ).body as Doc;
    await http()
      .delete(`/conversations/blocked/${entry._id}`)
      .set(bearer(marketing))
      .expect(200);

    const conv = await makeConv({ contact: 'ig-sin-permiso' });
    await http()
      .delete(`/conversations/${String(conv._id)}`)
      .set(bearer(marketing))
      .expect(403);
  });

  it('eliminar y bloquear en una sola llamada', async () => {
    const conv = await makeConv({ contact: 'ig-spam-total' });
    const res = await http()
      .post('/conversations/bulk-delete')
      .set(bearer(owner))
      .send({ ids: [String(conv._id)], block: true, reason: 'Spam' })
      .expect(201);
    expect(res.body).toMatchObject({ trashed: 1, blocked: 1 });
    const list = (
      await http().get('/conversations/blocked').set(bearer(owner)).expect(200)
    ).body as Array<{ identifier: string }>;
    expect(list.map((b) => b.identifier)).toContain('ig-spam-total');
  });
});
