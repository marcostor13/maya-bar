import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { bearer, createApp, registerTenant, type Session } from './support/app';
import { AiService } from '../src/ai/ai.service';
import { Customer } from '../src/customers/customer.schema';
import {
  Automation,
  AutomationRun,
} from '../src/automations/automation.schema';

const SITE = 'https://tienda.pe';
const READING = JSON.stringify({
  points: 45,
  intent: 'comprar',
  budget: '',
  urgency: 'esta semana',
  objections: '',
  reason: 'Pregunta el precio y lo necesita esta semana',
});

async function until<T>(
  fn: () => Promise<T | null | undefined>,
  ms = 5000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('Tiempo agotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Puntaje de leads con IA (HU70, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let key: string;
  let customers: Model<Customer>;
  let aiChat: jest.SpyInstance;
  const api = () => request(app.getHttpServer());
  const pub = (path: string) =>
    api().post(`/public/webchat/${key}${path}`).set('Origin', SITE);

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Tienda');
    customers = app.get<Model<Customer>>(getModelToken(Customer.name));
    aiChat = jest
      .spyOn(app.get(AiService), 'chat')
      .mockImplementation((prompt: string) =>
        Promise.resolve(prompt.includes('analista comercial') ? READING : ''),
      );
    key = (
      (await api().get('/webchat/widget').set(bearer(owner)).expect(200))
        .body as { key: string }
    ).key;
    await api()
      .put('/webchat/widget')
      .set(bearer(owner))
      .send({ active: true, allowedDomains: ['tienda.pe'] })
      .expect(200);
    await app.get<Model<Automation>>(getModelToken(Automation.name)).create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      name: 'Avisar leads calientes',
      active: true,
      trigger: { type: 'score_reached', minScore: 50 },
      steps: [{ id: 's1', type: 'tag', tag: 'caliente' }],
    });
  });
  afterAll(() => app.close());

  it('C1 y C2: "¿cuánto cuesta? lo necesito esta semana" sube el puntaje con su motivo, y no recalcula antes de 10 min', async () => {
    const s = (await pub('/session').send({}).expect(201)).body as {
      token: string;
    };
    await pub('/contact')
      .send({ token: s.token, name: 'Lucía', email: 'lucia@correo.pe' })
      .expect(201);
    const c = (await customers
      .findOne({ email: 'lucia@correo.pe' })
      .lean<Customer>()
      .exec())!;
    const id = String(c._id);

    // Sin conversación: solo reglas.
    const before = (
      await api()
        .post(`/scoring/customers/${id}`)
        .set(bearer(owner))
        .expect(201)
    ).body as { score: number; scoreLabel: string };
    expect(before.scoreLabel).toBe('cold');
    expect(aiChat).not.toHaveBeenCalled();
    // Pasan los 10 minutos.
    await customers.updateOne(
      { _id: c._id },
      { $set: { scoredAt: new Date(Date.now() - 11 * 60_000) } },
    );

    await pub('/messages')
      .send({ token: s.token, text: '¿cuánto cuesta? lo necesito esta semana' })
      .expect(201);
    const after = await until(() =>
      customers
        .findOne({ _id: c._id, scoreReason: /esta semana/ })
        .lean<Customer>()
        .exec(),
    );
    expect(after.score!).toBeGreaterThan(before.score);
    expect(after.score!).toBeGreaterThanOrEqual(50);
    expect(after.scoreDetail).toMatchObject({ ai: 45, urgency: 'esta semana' });
    expect(aiChat).toHaveBeenCalledTimes(1);
    // Cobra créditos con su propia acción.
    expect((aiChat.mock.calls as unknown[][])[0][1]).toMatchObject({
      meter: { action: 'scoring' },
    });

    // C2: más mensajes y un recálculo manual dentro de los 10 minutos no vuelven a leer.
    const at = after.scoredAt!;
    await pub('/messages').send({ token: s.token, text: 'hola?' }).expect(201);
    await pub('/messages')
      .send({ token: s.token, text: '¿siguen ahí?' })
      .expect(201);
    const again = (
      await api()
        .post(`/scoring/customers/${id}`)
        .set(bearer(owner))
        .expect(201)
    ).body as { skipped: boolean; score: number };
    expect(again).toMatchObject({ skipped: true, score: after.score });
    await new Promise((r) => setTimeout(r, 300));
    expect(aiChat).toHaveBeenCalledTimes(1);
    expect(
      (await customers.findById(c._id).lean<Customer>().exec())!.scoredAt,
    ).toEqual(at);

    // Orden y filtro en Contactos.
    const hot = await api()
      .get(`/customers?heat=${after.scoreLabel}&sort=score`)
      .set(bearer(owner))
      .expect(200);
    expect((hot.body as { _id: string }[]).map((x) => x._id)).toContain(id);
    const none = await api()
      .get('/customers?heat=cold')
      .set(bearer(owner))
      .expect(200);
    expect((none.body as { _id: string }[]).map((x) => x._id)).not.toContain(
      id,
    );

    // Disparador de automatización al cruzar el umbral.
    const run = await until(() =>
      app
        .get<Model<AutomationRun>>(getModelToken(AutomationRun.name))
        .findOne({ customerId: c._id })
        .lean()
        .exec(),
    );
    expect(run).toBeTruthy();
  });

  it('otra empresa no puede recalcular un contacto ajeno', async () => {
    const other = await registerTenant(app, 'Otra');
    const c = (await customers
      .findOne({ email: 'lucia@correo.pe' })
      .lean<Customer>()
      .exec())!;
    await api()
      .post(`/scoring/customers/${String(c._id)}`)
      .set(bearer(other))
      .expect(404);
  });
});
