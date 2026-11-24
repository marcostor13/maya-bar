import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Lead } from '../src/leads/lead.schema';
import { LeadActivity } from '../src/leads/lead-activity.schema';
import { RoutingService } from '../src/routing/routing.service';
import { RoutingAssignment } from '../src/routing/routing.schema';
import { PushService } from '../src/push/push.service';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Reparto automático (HU59, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let sellers: Session[];
  let leads: Model<Lead>;
  let activities: Model<LeadActivity>;
  let assignments: Model<RoutingAssignment>;
  let routing: RoutingService;
  let pushSpy: jest.SpyInstance;
  let seq = 0;
  const http = () => request(app.getHttpServer());

  /** Crea una oportunidad en la bolsa y espera a que el reparto la asigne. */
  const newLead = async (source?: string) => {
    const res = await http()
      .post('/leads')
      .set(bearer(owner))
      .send({
        title: `Op ${++seq}`,
        customer: {
          name: `Cliente ${seq}`,
          phone: `+51 9${String(10000000 + seq)}`,
        },
        ownerId: '',
        ...(source ? { source } : {}),
      })
      .expect(201);
    const id = (res.body as { _id: string })._id;
    for (let i = 0; i < 50; i++) {
      if (await assignments.exists({ leadId: new Types.ObjectId(id) })) break;
      await wait(30);
    }
    return leads.findById(id).lean().exec();
  };

  const rule = (body: Record<string, unknown>) =>
    http().post('/routing/rules').set(bearer(owner)).send(body);

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Reparto');
    sellers = [];
    for (let i = 0; i < 3; i++)
      sellers.push(await createUser(app, owner, 'MANAGER'));
    leads = app.get(getModelToken(Lead.name));
    activities = app.get(getModelToken(LeadActivity.name));
    assignments = app.get(getModelToken(RoutingAssignment.name));
    routing = app.get(RoutingService);
    pushSpy = jest
      .spyOn(app.get(PushService), 'sendToUser')
      .mockResolvedValue(undefined as never);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await assignments.deleteMany({});
    const list = (
      await http().get('/routing/rules').set(bearer(owner)).expect(200)
    ).body as { _id: string }[];
    for (const r of list)
      await http()
        .delete(`/routing/rules/${r._id}`)
        .set(bearer(owner))
        .expect(200);
    for (const s of sellers)
      await http()
        .patch('/routing/availability')
        .set(bearer(s))
        .send({ available: true, availability: null })
        .expect(200);
  });

  it('C1: turno rotativo entre 3 vendedores reparte 6 oportunidades 2, 2 y 2', async () => {
    await rule({
      name: 'Todas',
      members: sellers.map((s) => ({ userId: s.user.id })),
    }).expect(201);
    const owners: string[] = [];
    for (let i = 0; i < 6; i++) owners.push(String((await newLead())?.ownerId));
    const count = sellers.map(
      (s) => owners.filter((o) => o === s.user.id).length,
    );
    expect(count).toEqual([2, 2, 2]);
    // Rotación estricta: nunca el mismo dos veces seguidas.
    for (let i = 1; i < owners.length; i++)
      expect(owners[i]).not.toBe(owners[i - 1]);
    const log = (
      await http().get('/routing/log').set(bearer(owner)).expect(200)
    ).body as { reason: string }[];
    expect(log.filter((l) => l.reason === 'auto')).toHaveLength(6);
    expect(pushSpy).toHaveBeenCalled();
  });

  it('C2: quien no está disponible (o fuera de horario) no recibe; sin nadie queda en la bolsa', async () => {
    await rule({
      name: 'Todas',
      members: sellers.map((s) => ({ userId: s.user.id })),
    }).expect(201);
    await http()
      .patch('/routing/availability')
      .set(bearer(sellers[1]))
      .send({ available: false })
      .expect(200);
    // Horario imposible para el tercero: solo domingos de 0 a 1.
    routing.clock = () => new Date('2026-11-24T15:00:00Z');
    await http()
      .patch('/routing/availability')
      .set(bearer(sellers[2]))
      .send({ availability: { days: [0], from: 0, to: 1 } })
      .expect(200);
    for (let i = 0; i < 3; i++)
      expect(String((await newLead())?.ownerId)).toBe(sellers[0].user.id);

    await http()
      .patch('/routing/availability')
      .set(bearer(sellers[0]))
      .send({ available: false })
      .expect(200);
    const pool = await newLead();
    expect(pool?.ownerId ?? null).toBeNull();
    const last = await assignments.findOne({ leadId: pool?._id }).lean().exec();
    expect(last?.reason).toBe('no_one');
    routing.clock = () => new Date();
  });

  it('C3: sin respuesta en 15 min pasa al siguiente y queda en la bitácora; con respuesta, se queda', async () => {
    await rule({
      name: 'Rápida',
      members: sellers.slice(0, 2).map((s) => ({ userId: s.user.id })),
      responseMinutes: 15,
    }).expect(201);
    const t0 = new Date();
    routing.clock = () => t0;
    const lead = await newLead();
    const first = String(lead?.ownerId);
    const second = sellers
      .slice(0, 2)
      .map((s) => s.user.id)
      .find((id) => id !== first);

    // A los 10 min todavía es suyo.
    expect(
      await routing.checkTimeouts(new Date(t0.getTime() + 10 * 60_000)),
    ).toBe(0);
    // A los 16 min, sin actividad: pasa al otro.
    expect(
      await routing.checkTimeouts(new Date(t0.getTime() + 16 * 60_000)),
    ).toBe(1);
    const moved = await leads.findById(lead?._id).lean().exec();
    expect(String(moved?.ownerId)).toBe(second);
    const entry = await assignments
      .findOne({ leadId: lead?._id, reason: 'timeout_next' })
      .lean()
      .exec();
    expect(String(entry?.fromUserId)).toBe(first);
    expect(String(entry?.userId)).toBe(second);
    const act = await activities
      .findOne({
        leadId: lead?._id,
        type: 'assignment',
        title: /no respondió a tiempo/,
      })
      .lean()
      .exec();
    expect(act).toBeTruthy();
    expect(pushSpy).toHaveBeenCalledWith(
      first,
      expect.objectContaining({ title: 'Se te pasó el tiempo de respuesta' }),
    );

    // El segundo responde con una nota: ya no se mueve.
    const t1 = new Date(t0.getTime() + 16 * 60_000);
    await activities.create({
      tenantId: moved?.tenantId,
      leadId: lead?._id,
      type: 'note',
      title: 'Llamé',
      createdBy: new Types.ObjectId(second),
      at: new Date(t1.getTime() + 60_000),
    });
    expect(
      await routing.checkTimeouts(new Date(t1.getTime() + 20 * 60_000)),
    ).toBe(0);
    expect(
      String((await leads.findById(lead?._id).lean().exec())?.ownerId),
    ).toBe(second);
    routing.clock = () => new Date();
  });

  it('R5 y R6: el dueño del contacto recibe su oportunidad; un vendedor no edita reglas; otro tenant no ve las reglas', async () => {
    await rule({
      name: 'Todas',
      members: sellers.map((s) => ({ userId: s.user.id })),
    }).expect(201);
    const c = await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Con dueño', phone: '+51 988777666' })
      .expect(201);
    const cid = (c.body as { _id: string })._id;
    await leads.db
      .collection('customers')
      .updateOne(
        { _id: new Types.ObjectId(cid) },
        { $set: { ownerId: new Types.ObjectId(sellers[2].user.id) } },
      );
    const res = await http()
      .post('/leads')
      .set(bearer(owner))
      .send({ title: 'Del dueño', customerId: cid, ownerId: '' })
      .expect(201);
    const id = (res.body as { _id: string })._id;
    for (
      let i = 0;
      i < 50 && !(await assignments.exists({ leadId: new Types.ObjectId(id) }));
      i++
    )
      await wait(30);
    expect(String((await leads.findById(id).lean().exec())?.ownerId)).toBe(
      sellers[2].user.id,
    );
    expect(
      (
        await assignments
          .findOne({ leadId: new Types.ObjectId(id) })
          .lean()
          .exec()
      )?.reason,
    ).toBe('owner');

    const seller = await createUser(app, owner, 'IMPULSADOR');
    await http().get('/routing/rules').set(bearer(seller)).expect(403);
    await http()
      .patch('/routing/availability')
      .set(bearer(seller))
      .send({ available: false })
      .expect(200);

    const other = await registerTenant(app, 'Otra');
    const mine = (
      await http().get('/routing/rules').set(bearer(owner)).expect(200)
    ).body as { _id: string }[];
    expect(
      (
        (await http().get('/routing/rules').set(bearer(other)).expect(200))
          .body as unknown[]
      ).length,
    ).toBe(0);
    await http()
      .delete(`/routing/rules/${mine[0]._id}`)
      .set(bearer(other))
      .expect(404);
    await rule({
      name: 'Mala',
      members: [{ userId: seller.user.id }, { userId: other.user.id }],
    }).expect(400);
  });
});
