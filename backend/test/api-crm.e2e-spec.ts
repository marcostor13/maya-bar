import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import Ajv from 'ajv';
import { createHash } from 'crypto';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { ApiWebhookService } from '../src/api-access/api-webhook.service';
import { signHook } from '../src/api-access/api-hooks.service';
import { MessageEvents } from '../src/conversations/message-events';
import { bearer, createApp, registerTenant, type Session } from './support/app';

type Doc = Record<string, unknown>;
type Call = [string, string, Record<string, string>];

describe('API del CRM para Zapier y Make (HU65, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let accountId: string;
  let hookPost: jest.SpyInstance;
  const HOOK = 'https://8.8.8.8/zapier/hook';
  const http = () => request(app.getHttpServer());

  async function createKey(session: Session, account: string, extra: Doc = {}) {
    const res = await http()
      .post('/api-access')
      .set(bearer(session))
      .send({
        name: 'Zapier',
        channel: 'whatsapp',
        accountId: account,
        ...extra,
      })
      .expect(201);
    return (res.body as { key: string }).key;
  }
  const api = (key: string) => ({ Authorization: `Bearer ${key}` });
  const callsTo = (url: string) =>
    (hookPost.mock.calls as Call[]).filter(([u]) => u === url);
  async function waitFor<T>(fn: () => T | undefined, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end)
        throw new Error('Tiempo agotado esperando el aviso');
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async function waAccount(session: Session) {
    const acc = await app
      .get<Model<WhatsAppAccount>>(getModelToken(WhatsAppAccount.name))
      .create({
        tenantId: new Types.ObjectId(session.user.tenantId!),
        label: 'Ventas',
        provider: 'cloudapi',
        waPhoneNumberId: `PN${Date.now()}${Math.random()}`,
        waAccessToken: 'token',
        active: true,
      });
    return String(acc._id);
  }

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Zapier');
    other = await registerTenant(app, 'Ajena Zap');
    accountId = await waAccount(owner);
    hookPost = jest
      .spyOn(app.get(ApiWebhookService), 'post')
      .mockResolvedValue({ status: 200 });
  });
  afterAll(async () => {
    await app.close();
  });

  it('C1: POST /api/v1/hooks registra la URL y un contacto nuevo la llama con la carga documentada y firmada', async () => {
    const key = await createKey(owner, accountId, { purpose: 'automation' });
    const sub = await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'contact.created', targetUrl: HOOK })
      .expect(201);
    const hookId = (sub.body as { id: string }).id;
    expect(sub.body).toMatchObject({
      event: 'contact.created',
      targetUrl: HOOK,
      active: true,
    });

    // Un contacto creado desde la app (no por la API) también dispara.
    await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Ana Torres', email: 'ana@zap.pe', phone: '+51987650001' })
      .expect(201);
    const [url, raw, headers] = await waitFor(() => callsTo(HOOK)[0]);
    expect(url).toBe(HOOK);
    const payload = JSON.parse(raw) as {
      event: string;
      data: { contact: Doc };
    };
    expect(payload.event).toBe('contact.created');
    expect(payload.data.contact).toMatchObject({
      name: 'Ana Torres',
      email: 'ana@zap.pe',
      phone: '+51 987 650 001',
    });
    expect(Object.keys(payload.data.contact).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'ownerId',
      'phone',
      'source',
      'tags',
      'updatedAt',
    ]);
    expect(headers['X-Maya-Event']).toBe('contact.created');
    const keyHash = createHash('sha256').update(key).digest('hex');
    expect(headers['X-Maya-Signature']).toBe(
      signHook(keyHash, headers['X-Maya-Timestamp'], raw),
    );

    // Otra empresa no dispara los avisos de esta.
    hookPost.mockClear();
    await http()
      .post('/customers')
      .set(bearer(other))
      .send({ name: 'Ajeno', email: 'x@ajena.pe' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 150));
    expect(callsTo(HOOK)).toHaveLength(0);

    // Desuscribir (apagar el Zap) corta los avisos.
    await http().delete(`/api/v1/hooks/${hookId}`).set(api(key)).expect(200);
    await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Beto', email: 'beto@zap.pe' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 150));
    expect(callsTo(HOOK)).toHaveLength(0);
  });

  it('acciones: crear/actualizar contacto, etiqueta, oportunidad y disparadores de etapa y mensaje; 410 borra la suscripción', async () => {
    const key = await createKey(owner, accountId, { purpose: 'automation' });
    const stageUrl = 'https://8.8.8.8/make/stage';
    const msgUrl = 'https://8.8.8.8/make/msg';
    await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'lead.stage_changed', targetUrl: stageUrl })
      .expect(201);
    await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'message.received', targetUrl: msgUrl })
      .expect(201);
    await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'nada', targetUrl: stageUrl })
      .expect(400);
    await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'contact.created', targetUrl: 'http://8.8.8.8/x' })
      .expect(400);
    await http()
      .post('/api/v1/hooks')
      .set(api(key))
      .send({ event: 'contact.created', targetUrl: 'https://127.0.0.1/x' })
      .expect(400);

    const me = await http().get('/api/v1/me').set(api(key)).expect(200);
    expect(me.body).toMatchObject({
      name: 'Zapier',
      tenantId: owner.user.tenantId,
    });

    const c1 = await http()
      .post('/api/v1/contacts')
      .set(api(key))
      .send({ name: 'Carla', email: 'Carla@Zap.pe', tags: ['zapier'] })
      .expect(201);
    const contact = (
      c1.body as { created: boolean; contact: { id: string; tags: string[] } }
    ).contact;
    expect(c1.body).toMatchObject({
      created: true,
      contact: { email: 'carla@zap.pe', source: 'api', tags: ['zapier'] },
    });
    const c2 = await http()
      .post('/api/v1/contacts')
      .set(api(key))
      .send({ email: 'carla@zap.pe', phone: '+51987650002' })
      .expect(200);
    expect(c2.body).toMatchObject({
      created: false,
      contact: { id: contact.id, phone: '+51 987 650 002' },
    });
    await http()
      .post(`/api/v1/contacts/${contact.id}/tags`)
      .set(api(key))
      .send({ tags: ['vip', 'zapier'] })
      .expect(200);
    const got = await http()
      .get(`/api/v1/contacts/${contact.id}`)
      .set(api(key))
      .expect(200);
    expect((got.body as { tags: string[] }).tags).toEqual(['zapier', 'vip']);
    const found = await http()
      .get('/api/v1/contacts')
      .query({ email: 'carla@zap.pe' })
      .set(api(key))
      .expect(200);
    expect(found.body).toHaveLength(1);

    const lead = await http()
      .post('/api/v1/leads')
      .set(api(key))
      .send({ title: 'Plan anual', value: 1200, contactId: contact.id })
      .expect(201);
    const leadId = (lead.body as { id: string }).id;
    expect(lead.body).toMatchObject({
      title: 'Plan anual',
      value: 1200,
      customerId: contact.id,
      source: 'api',
      ownerId: null,
    });

    // Mover la etapa en la app dispara lead.stage_changed.
    const stages = await http()
      .get('/leads/stages')
      .set(bearer(owner))
      .expect(200);
    const second = (stages.body as { key: string }[])[1].key;
    await http()
      .patch(`/leads/${leadId}/move`)
      .set(bearer(owner))
      .send({ stage: second })
      .expect(200);
    const [, raw] = await waitFor(() => callsTo(stageUrl)[0]);
    expect(JSON.parse(raw)).toMatchObject({
      event: 'lead.stage_changed',
      data: {
        stage: second,
        lead: { id: leadId },
        contact: { id: contact.id },
      },
    });

    // Mensaje entrante → message.received. El receptor responde 410: se borra.
    hookPost.mockResolvedValueOnce({ status: 410 });
    app.get(MessageEvents).publish('created', owner.user.tenantId!, {
      _id: new Types.ObjectId(),
      conversationId: new Types.ObjectId(),
      direction: 'in',
      type: 'text',
      text: 'Hola',
      createdAt: new Date(),
    });
    await waitFor(() => callsTo(msgUrl)[0]);
    await new Promise((r) => setTimeout(r, 100));
    const hooks = await http().get('/api/v1/hooks').set(api(key)).expect(200);
    expect((hooks.body as { event: string }[]).map((h) => h.event)).toEqual([
      'lead.stage_changed',
    ]);
  });

  it('aislamiento: la clave web no entra al CRM, otra empresa no ve contactos ajenos, una clave revocada falla', async () => {
    const web = await createKey(owner, accountId, {
      name: 'Web',
      allowedDomains: ['mitienda.pe'],
    });
    await http()
      .get('/api/v1/me')
      .set(api(web))
      .set('Origin', 'https://mitienda.pe')
      .expect(403);
    await http()
      .post('/api-access')
      .set(bearer(owner))
      .send({ name: 'Web sin dominio', channel: 'whatsapp', accountId })
      .expect(400);

    const mine = await createKey(owner, accountId, { purpose: 'automation' });
    const c = await http()
      .post('/api/v1/contacts')
      .set(api(mine))
      .send({ name: 'Propio', email: 'propio@zap.pe' })
      .expect(201);
    const id = (c.body as { contact: { id: string } }).contact.id;

    const otherKey = await createKey(other, await waAccount(other), {
      purpose: 'automation',
    });
    await http().get(`/api/v1/contacts/${id}`).set(api(otherKey)).expect(404);
    await http()
      .post(`/api/v1/contacts/${id}/tags`)
      .set(api(otherKey))
      .send({ tags: ['x'] })
      .expect(404);
    const list = await http()
      .get('/api/v1/contacts')
      .set(api(otherKey))
      .expect(200);
    expect((list.body as { id: string }[]).some((x) => x.id === id)).toBe(
      false,
    );

    await http().get('/api/v1/me').expect(401);
    const accesses = await http()
      .get('/api-access')
      .set(bearer(owner))
      .expect(200);
    const accessId = (
      accesses.body as { _id: string; keyPrefix: string }[]
    ).find((a) => mine.startsWith(a.keyPrefix))!._id;
    await http()
      .post(`/api-access/${accessId}/revoke`)
      .set(bearer(owner))
      .expect(201);
    await http().get('/api/v1/me').set(api(mine)).expect(401);
  });

  it('C2: la especificación OpenAPI se genera, es válida y describe lo que devuelve la API', async () => {
    const res = await http().get('/api/v1/openapi.json').expect(200);
    const spec = res.body as {
      openapi: string;
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            responses: Doc;
            parameters?: { name: string; in: string }[];
          }
        >
      >;
      components: { schemas: Record<string, Doc> };
    };
    expect(spec.openapi).toMatch(/^3\.0\.\d$/);

    // Todas las $ref resuelven.
    const refs = JSON.stringify(spec).match(/"\$ref":"[^"]+"/g) ?? [];
    for (const r of refs) {
      const path = r.slice(8, -1).replace(/^#\//, '').split('/');
      let node: unknown = spec;
      for (const p of path) node = (node as Doc)?.[p];
      expect([r, node !== undefined]).toEqual([r, true]);
    }
    // operationId únicos, respuestas en todas y parámetros de ruta declarados.
    const ids: string[] = [];
    for (const [route, ops] of Object.entries(spec.paths)) {
      for (const op of Object.values(ops)) {
        ids.push(op.operationId);
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
        for (const name of route.match(/\{(\w+)\}/g) ?? [])
          expect(
            op.parameters?.some(
              (p) => p.in === 'path' && `{${p.name}}` === name,
            ),
          ).toBe(true);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'upsertContact',
        'createLead',
        'addTags',
        'sendWhatsappTemplate',
        'subscribeHook',
        'unsubscribeHook',
      ]),
    );

    // Los esquemas son JSON Schema válidos y las respuestas reales cumplen.
    const ajv = new Ajv({ nullable: true, allErrors: true, schemaId: '$id' });
    ajv.addSchema({ $id: 'maya', components: spec.components });
    for (const name of Object.keys(spec.components.schemas))
      expect(() =>
        ajv.getSchema(`maya#/components/schemas/${name}`),
      ).not.toThrow();
    const key = await createKey(owner, accountId, { purpose: 'automation' });
    const up = await http()
      .post('/api/v1/contacts')
      .set(api(key))
      .send({ name: 'Spec', email: 'spec@zap.pe' })
      .expect(201);
    const validUpsert = ajv.getSchema('maya#/components/schemas/UpsertResult')!;
    expect([validUpsert(up.body), validUpsert.errors]).toEqual([true, null]);
    const sample = await http()
      .get('/api/v1/hooks/samples/contact.created')
      .set(api(key))
      .expect(200);
    const validHook = ajv.getSchema('maya#/components/schemas/HookPayload')!;
    expect(validHook((sample.body as unknown[])[0])).toBe(true);
  });
});
