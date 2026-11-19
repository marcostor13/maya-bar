import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { Lead } from '../src/leads/lead.schema';
import { Customer } from '../src/customers/customer.schema';
import { ContactActivity } from '../src/customers/contact-activity.schema';
import { Call } from '../src/calls/call.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

interface Row {
  id: string;
  name: string;
  messages: number;
  openChats: number;
  newLeads: number;
  wonDeals: number;
  wonValue: number;
  lostDeals: number;
  newContacts: number;
  assignedContacts: number;
  idleContacts: number;
  activities: number;
  calls: number;
}
interface Perf {
  scope: 'team' | 'self';
  channel: string | null;
  users: Row[];
  totals: Record<string, number>;
}

describe('Dashboard: rendimiento por usuario (HU20)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let seller: Session;
  let other: Session;
  const http = () => request(app.getHttpServer());
  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
  const oid = (id: string) => new Types.ObjectId(id);

  const perf = async (s: Session, q = '') =>
    (
      await http()
        .get(`/dashboard/users?range=30d${q}`)
        .set(bearer(s))
        .expect(200)
    ).body as Perf;
  const row = (p: Perf, id: string) => p.users.find((u) => u.id === id);

  async function seed(
    tenantId: string,
    userId: string,
    channel: 'whatsapp' | 'email',
  ) {
    const tid = oid(tenantId);
    const uid = oid(userId);
    const conv = await model<Conversation>(Conversation.name).create({
      tenantId: tid,
      channel,
      accountId: new Types.ObjectId(),
      contact: `c-${Math.random()}`,
      takenOverBy: uid,
    });
    // Un chat cerrado conserva quién lo atendía, pero ya no cuenta.
    await model<Conversation>(Conversation.name).create({
      tenantId: tid,
      channel,
      accountId: new Types.ObjectId(),
      contact: `c-${Math.random()}`,
      takenOverBy: uid,
      status: 'closed',
    });
    await model<Message>(Message.name).create({
      tenantId: tid,
      conversationId: conv._id,
      direction: 'out',
      author: 'human',
      text: 'hola',
      sentBy: uid,
    });
    const customer = await model<Customer>(Customer.name).create({
      tenantId: tid,
      name: 'Cliente',
      ownerId: uid,
    });
    const cid = customer._id;
    // Otro contacto a su cargo, sin ningún seguimiento.
    await model<Customer>(Customer.name).create({
      tenantId: tid,
      name: 'Olvidado',
      ownerId: uid,
    });
    await model<Lead>(Lead.name).create([
      {
        tenantId: tid,
        customerId: cid,
        title: 'A',
        ownerId: uid,
        status: 'won',
        value: 500,
        closedAt: new Date(),
      },
      {
        tenantId: tid,
        customerId: cid,
        title: 'B',
        ownerId: uid,
        status: 'lost',
        closedAt: new Date(),
      },
    ]);
    await model<ContactActivity>(ContactActivity.name).create([
      {
        tenantId: tid,
        customerId: cid,
        type: 'call',
        title: 'Llamé',
        createdBy: uid,
      },
      // Las automáticas no cuentan como trabajo de la persona.
      {
        tenantId: tid,
        customerId: cid,
        type: 'system',
        title: 'Auto',
        createdBy: uid,
      },
    ]);
    await model<Call>(Call.name).create({
      tenantId: tid,
      accountId: new Types.ObjectId(),
      waCallId: `wacid.${Math.random()}`,
      direction: 'inbound',
      status: 'completed',
      contact: '51999',
      startedAt: new Date(),
      answeredBy: uid,
    });
  }

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Rendimiento');
    seller = await createUser(app, owner, 'MARKETING');
    other = await registerTenant(app, 'Otra rendimiento');
    await seed(owner.user.tenantId!, seller.user.id, 'whatsapp');
    await seed(owner.user.tenantId!, owner.user.id, 'email');
    await seed(other.user.tenantId!, other.user.id, 'whatsapp');
  });
  afterAll(async () => {
    await app.close();
  });

  it('C2: el administrador ve a cada usuario con sus métricas y nada de otra empresa', async () => {
    const p = await perf(owner);
    expect(p.scope).toBe('team');
    expect(p.users.map((u) => u.id).sort()).toEqual(
      [owner.user.id, seller.user.id].sort(),
    );
    expect(row(p, seller.user.id)).toMatchObject({
      messages: 1,
      openChats: 1,
      newLeads: 2,
      wonDeals: 1,
      wonValue: 500,
      lostDeals: 1,
      newContacts: 2,
      assignedContacts: 2,
      idleContacts: 1,
      activities: 1,
      calls: 1,
    });
    expect(p.totals).toMatchObject({ messages: 2, wonValue: 1000, calls: 2 });
    expect(p.users.some((u) => u.id === other.user.id)).toBe(false);
  });

  it('C3: un rol que no supervisa solo recibe su fila', async () => {
    const p = await perf(seller);
    expect(p.scope).toBe('self');
    expect(p.users).toHaveLength(1);
    expect(p.users[0]).toMatchObject({
      id: seller.user.id,
      messages: 1,
      wonValue: 500,
    });
    expect(p.totals.wonValue).toBe(500);
  });

  it('C4: con canal, mensajes y chats se limitan a ese canal', async () => {
    const p = await perf(owner, '&channel=whatsapp');
    expect(p.channel).toBe('whatsapp');
    expect(row(p, seller.user.id)).toMatchObject({ messages: 1, openChats: 1 });
    expect(row(p, owner.user.id)).toMatchObject({ messages: 0, openChats: 0 });
    // Lo que no es de mensajería no depende del canal.
    expect(row(p, owner.user.id)?.wonValue).toBe(500);
  });

  it('rechaza un rango inválido y exige sesión', async () => {
    await http()
      .get('/dashboard/users?range=99y')
      .set(bearer(owner))
      .expect(400);
    await http().get('/dashboard/users').expect(401);
  });
});
