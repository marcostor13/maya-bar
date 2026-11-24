import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';
import { Lead } from '../src/leads/lead.schema';

interface Row {
  key: string | null;
  label: string;
  value: number;
  count: number;
}
interface Result {
  rows: Row[];
  total: number;
}

describe('Reportes configurables (HU64)', () => {
  let app: NestExpressApplication;
  let leads: Model<Lead>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    leads = app.get<Model<Lead>>(getModelToken(Lead.name));
  });
  afterAll(async () => {
    await app.close();
  });

  async function seed(owner: Session) {
    const a = await createUser(app, owner, 'MANAGER');
    const b = await createUser(app, owner, 'MANAGER');
    const contact = await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Cliente', phone: '+51999111222' })
      .expect(201);
    const customerId = (contact.body as { _id: string })._id;
    const mk = async (ownerId: string, title: string, value: number) =>
      (
        await http()
          .post('/leads')
          .set(bearer(owner))
          .send({ customerId, title, value, ownerId })
          .expect(201)
      ).body as { _id: string };
    // Ganadas este mes: A 3 (100+200+300), B 1 (50). Ganada el año pasado: A 1 (no cuenta). Abiertas: B 2. Perdida: A 1.
    const now = new Date();
    const lastYear = new Date(now.getTime() - 400 * 86_400_000);
    const plan: [Session, number, string, Date | null][] = [
      [a, 100, 'won', now],
      [a, 200, 'won', now],
      [a, 300, 'won', now],
      [b, 50, 'won', now],
      [a, 999, 'won', lastYear],
      [b, 10, 'open', null],
      [b, 20, 'open', null],
      [a, 70, 'lost', now],
    ];
    for (const [who, value, status, closedAt] of plan) {
      const l = await mk(who.user.id, `Op ${value}`, value);
      await leads
        .updateOne({ _id: l._id }, { $set: { status, closedAt } })
        .exec();
    }
    return { a, b };
  }

  it('C1: "ganadas por vendedor del mes" cuadra con el conteo a mano en la base', async () => {
    const owner = await registerTenant(app, 'Reportes');
    const { a, b } = await seed(owner);
    const def = {
      source: 'leads',
      metric: 'count',
      groupBy: 'owner',
      filters: { status: 'won', dateField: 'closedAt', range: 'this_month' },
    };
    const res = await http()
      .post('/reports/run')
      .set(bearer(owner))
      .send(def)
      .expect(201);
    const result = res.body as Result;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(5, 0, 0, 0); // 00:00 de Lima
    if (monthStart > new Date())
      monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
    const byHand = async (s: Session) =>
      leads
        .countDocuments({
          tenantId: new Types.ObjectId(owner.user.tenantId!),
          ownerId: new Types.ObjectId(s.user.id),
          status: 'won',
          closedAt: { $gte: monthStart },
        })
        .exec();

    const rowA = result.rows.find((r) => r.key === a.user.id)!;
    const rowB = result.rows.find((r) => r.key === b.user.id)!;
    expect(rowA.value).toBe(await byHand(a));
    expect(rowB.value).toBe(await byHand(b));
    expect(rowA.value).toBe(3);
    expect(rowB.value).toBe(1);
    expect(result.total).toBe(4);
    expect(rowA.label).toMatch(/Usuario/);
    expect(result.rows[0].key).toBe(a.user.id); // de mayor a menor

    // Suma de monto, conversión y tiempo medio.
    const sum = (
      await http()
        .post('/reports/run')
        .set(bearer(owner))
        .send({ ...def, metric: 'sum_value' })
        .expect(201)
    ).body as Result;
    expect(sum.rows.find((r) => r.key === a.user.id)!.value).toBe(600);
    const conv = (
      await http()
        .post('/reports/run')
        .set(bearer(owner))
        .send({
          source: 'leads',
          metric: 'conversion_rate',
          groupBy: 'none',
          filters: { range: 'last_30' },
        })
        .expect(201)
    ).body as Result;
    expect(conv.total).toBe(62.5); // por fecha de creación: las 8 se crearon hoy y 5 están ganadas
  });

  it('valida combinaciones y el rango máximo', async () => {
    const owner = await registerTenant(app, 'Validación');
    await http()
      .post('/reports/run')
      .set(bearer(owner))
      .send({ source: 'customers', metric: 'sum_value', groupBy: 'owner' })
      .expect(400);
    await http()
      .post('/reports/run')
      .set(bearer(owner))
      .send({ source: 'leads', metric: 'count', groupBy: 'channel' })
      .expect(400);
    await http()
      .post('/reports/run')
      .set(bearer(owner))
      .send({
        source: 'leads',
        metric: 'count',
        groupBy: 'none',
        filters: { range: 'custom', from: '2024-01-01', to: '2026-01-01' },
      })
      .expect(400);
    await http()
      .post('/reports/run')
      .set(bearer(owner))
      .send({ source: 'nada', metric: 'count', groupBy: 'none' })
      .expect(400);
    const meta = await http()
      .get('/reports/meta')
      .set(bearer(owner))
      .expect(200);
    expect((meta.body as { maxRangeDays: number }).maxRangeDays).toBe(366);
  });

  it('C2: un reporte guardado y fijado aparece en el dashboard del rol compartido, no en otros', async () => {
    const owner = await registerTenant(app, 'Compartidos');
    await seed(owner);
    const marketing = await createUser(app, owner, 'MARKETING');
    const host = await createUser(app, owner, 'HOST');

    const created = await http()
      .post('/reports')
      .set(bearer(owner))
      .send({
        name: 'Ganadas por vendedor',
        source: 'leads',
        metric: 'count',
        groupBy: 'owner',
        filters: { status: 'won', dateField: 'closedAt', range: 'this_month' },
        chart: 'bar',
        pinned: true,
        sharedRoles: ['MARKETING'],
      })
      .expect(201);
    const id = (created.body as { _id: string })._id;

    const pinned = await http()
      .get('/reports/pinned')
      .set(bearer(marketing))
      .expect(200);
    const list = pinned.body as {
      report: { _id: string; name: string };
      result: Result;
    }[];
    expect(list.map((p) => p.report._id)).toContain(id);
    expect(list.find((p) => p.report._id === id)!.result.total).toBe(4);

    const other = await http()
      .get('/reports/pinned')
      .set(bearer(host))
      .expect(200);
    expect(
      (other.body as { report: { _id: string } }[]).map((p) => p.report._id),
    ).not.toContain(id);
    await http().get(`/reports/${id}/run`).set(bearer(host)).expect(404);

    // El rol compartido lo ve pero no lo modifica; la otra empresa no lo ve.
    await http()
      .patch(`/reports/${id}`)
      .set(bearer(marketing))
      .send({ pinned: false })
      .expect(403);
    const stranger = await registerTenant(app, 'Ajena');
    await http().get(`/reports/${id}/run`).set(bearer(stranger)).expect(404);

    // CSV y envío por correo.
    const csv = await http()
      .get(`/reports/${id}/export.csv`)
      .set(bearer(marketing))
      .expect(200);
    expect(csv.text).toContain('Total,4');
    await http().post(`/reports/${id}/send`).set(bearer(owner)).expect(400);
    await http()
      .patch(`/reports/${id}`)
      .set(bearer(owner))
      .send({ schedule: { frequency: 'weekly', emails: ['malo'] } })
      .expect(400);
    await http()
      .patch(`/reports/${id}`)
      .set(bearer(owner))
      .send({
        schedule: { frequency: 'weekly', emails: ['gerencia@empresa.pe'] },
      })
      .expect(200);
    const sent = await http()
      .post(`/reports/${id}/send`)
      .set(bearer(owner))
      .expect(201);
    expect(sent.body).toEqual({ sent: 1 });

    // Desfijar lo quita del dashboard.
    await http()
      .patch(`/reports/${id}`)
      .set(bearer(owner))
      .send({ pinned: false })
      .expect(200);
    const after = await http()
      .get('/reports/pinned')
      .set(bearer(marketing))
      .expect(200);
    expect(
      (after.body as { report: { _id: string } }[]).map((p) => p.report._id),
    ).not.toContain(id);
  });
});
