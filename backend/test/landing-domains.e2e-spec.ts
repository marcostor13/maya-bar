import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Event } from '../src/events/event.schema';
import { LandingDomain } from '../src/links/landing-domain.schema';
import { ShortDomain } from '../src/links/link.schemas';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

interface DomainRow {
  _id: string;
  domain: string;
  eventId: string | null;
  status: string;
  checkMessage?: string;
  txtName?: string;
  txtValue?: string;
}

/** HU25: dominio propio para la landing de un evento. */
describe('Dominios propios de landings (HU25)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let impulsador: Session;
  let eventId: string;
  let draftId: string;
  const http = () => request(app.getHttpServer());
  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));
  // `.invalid` nunca resuelve (RFC 2606): la verificación no sale a internet.
  const host = (n: string) => `${n}-${Date.now()}.invalid`;

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Landing propia');
    other = await registerTenant(app, 'Otra landing');
    impulsador = await createUser(app, owner, 'IMPULSADOR');
    const events = model<Event>(Event.name);
    const base = {
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      localId: new Types.ObjectId(),
      date: new Date('2030-01-01'),
    };
    eventId = String(
      (
        await events.create({
          ...base,
          title: 'Fiesta',
          slug: `fiesta-${Date.now()}`,
          status: 'published',
        })
      )._id,
    );
    draftId = String(
      (
        await events.create({
          ...base,
          title: 'Borrador',
          slug: `borrador-${Date.now()}`,
          status: 'draft',
        })
      )._id,
    );
  });
  afterAll(async () => {
    await app.close();
  });

  const add = (s: Session, domain: string, ev?: string) =>
    http()
      .post('/landing-domains')
      .set(bearer(s))
      .send({ domain, ...(ev ? { eventId: ev } : {}) });

  it('C1: registra el dominio en minúsculas y lo verifica al momento', async () => {
    const name = host('Fiesta').toUpperCase();
    const res = await add(owner, name, eventId).expect(201);
    const row = res.body as DomainRow;
    expect(row.domain).toBe(name.toLowerCase());
    expect(row.eventId).toBe(eventId);
    expect(row.status).toBe('pending');
    expect(row.checkMessage).toContain('CNAME');
    expect(row.txtName).toBe(`_maya-verify.${name.toLowerCase()}`);
    expect(row.txtValue).toMatch(/^maya-verify=[0-9a-f]{24}$/);

    const list = await http()
      .get(`/landing-domains?eventId=${eventId}`)
      .set(bearer(owner))
      .expect(200);
    expect((list.body as { domains: DomainRow[] }).domains).toHaveLength(1);
  });

  it('C1: rechaza dominios inválidos, de la plataforma o ya usados', async () => {
    await add(owner, 'no es un dominio').expect(400);
    await add(owner, 'https://x.com/a').expect(400);
    const name = host('repetido');
    await add(owner, name).expect(201);
    await add(owner, name).expect(409);
    await add(other, name).expect(409);
    // Ya usado como dominio de links cortos.
    const shortName = host('links');
    await model<ShortDomain>(ShortDomain.name).create({
      tenantId: new Types.ObjectId(other.user.tenantId!),
      domain: shortName,
    });
    const res = await add(owner, shortName).expect(409);
    expect(JSON.stringify(res.body)).toContain('links cortos');
    // Un evento de otra empresa no se puede asignar.
    await add(other, host('ajeno'), eventId).expect(404);
    await http()
      .get('/landing-domains?eventId=abc')
      .set(bearer(owner))
      .expect(400);
  });

  it('C1: un dominio sin verificar de otra empresa se libera a las 72 h', async () => {
    const name = host('squat');
    const squat = (await add(other, name).expect(201)).body as DomainRow;
    await add(owner, name).expect(409);
    await model<LandingDomain>(LandingDomain.name).collection.updateOne(
      { _id: new Types.ObjectId(squat._id) },
      { $set: { createdAt: new Date(Date.now() - 73 * 3600 * 1000) } },
    );
    const mine = (await add(owner, name).expect(201)).body as DomainRow;
    expect(mine._id).not.toBe(squat._id);
    await http()
      .post(`/landing-domains/${squat._id}/verify`)
      .set(bearer(other))
      .expect(404);
  });

  it('C1: tope de dominios por empresa', async () => {
    const s = await registerTenant(app, 'Tope dominios');
    for (let i = 0; i < 10; i++) await add(s, host(`tope${i}`)).expect(201);
    const res = await add(s, host('tope-extra')).expect(400);
    expect(JSON.stringify(res.body)).toContain('10');
  });

  it('C3: la resolución pública solo responde con dominio activo y evento publicado', async () => {
    const domains = model<LandingDomain>(LandingDomain.name);
    const tid = new Types.ObjectId(owner.user.tenantId!);
    const active = host('activo');
    await domains.create({
      tenantId: tid,
      domain: active,
      verifyToken: 't',
      eventId: new Types.ObjectId(eventId),
      status: 'active',
    });
    const res = await http()
      .get(`/public/landing-domains/resolve?host=${active.toUpperCase()}`)
      .expect(200);
    const slug = (res.body as { slug: string }).slug;
    expect(slug).toMatch(/^fiesta-/);

    const pending = host('pendiente');
    await domains.create({
      tenantId: tid,
      domain: pending,
      verifyToken: 't',
      eventId: new Types.ObjectId(eventId),
      status: 'pending',
    });
    const draft = host('borrador');
    await domains.create({
      tenantId: tid,
      domain: draft,
      verifyToken: 't',
      eventId: new Types.ObjectId(draftId),
      status: 'active',
    });
    const none = host('sinevento');
    await domains.create({
      tenantId: tid,
      domain: none,
      verifyToken: 't',
      status: 'active',
    });
    for (const h of [pending, draft, none, 'nada.invalid'])
      await http().get(`/public/landing-domains/resolve?host=${h}`).expect(404);
  });

  it('C5: las rutas públicas de eventos aceptan el origen del dominio propio', async () => {
    const res = await http()
      .get('/public/landing-domains/resolve?host=nada.invalid')
      .set('Origin', 'https://fiesta.miempresa.com')
      .expect(404);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://fiesta.miempresa.com',
    );
    const ev = await http()
      .options('/public/events/x/register')
      .set('Origin', 'https://fiesta.miempresa.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(ev.headers['access-control-allow-origin']).toBe(
      'https://fiesta.miempresa.com',
    );
    // Con sesión abierta el interceptor añade Authorization: el preflight
    // debe aceptarlo o el navegador bloquea la landing.
    const auth = await http()
      .options('/public/events/x')
      .set('Origin', 'https://mayacrm.site')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204);
    expect(auth.headers['access-control-allow-headers']).toMatch(
      /authorization/i,
    );
  });

  it('C6: cambia el evento, quita el dominio, aísla empresas y roles', async () => {
    const row = (await add(owner, host('gestion'), eventId).expect(201))
      .body as DomainRow;
    const changed = await http()
      .patch(`/landing-domains/${row._id}`)
      .set(bearer(owner))
      .send({ eventId: draftId })
      .expect(200);
    expect((changed.body as DomainRow).eventId).toBe(draftId);

    // Otra empresa no lo ve ni lo toca.
    await http()
      .post(`/landing-domains/${row._id}/verify`)
      .set(bearer(other))
      .expect(404);
    await http()
      .delete(`/landing-domains/${row._id}`)
      .set(bearer(other))
      .expect(404);
    const otherList = await http()
      .get('/landing-domains')
      .set(bearer(other))
      .expect(200);
    expect(
      (otherList.body as { domains: DomainRow[] }).domains.some(
        (d) => d._id === row._id,
      ),
    ).toBe(false);

    // Un impulsador puede ver, pero no registrar, verificar ni quitar.
    const seen = await http()
      .get('/landing-domains')
      .set(bearer(impulsador))
      .expect(200);
    expect((seen.body as { canManage: boolean }).canManage).toBe(false);
    await add(impulsador, host('impulsador')).expect(403);
    await http()
      .post(`/landing-domains/${row._id}/verify`)
      .set(bearer(impulsador))
      .expect(403);
    await http()
      .patch(`/landing-domains/${row._id}`)
      .set(bearer(owner))
      .send({ eventId: null })
      .expect(400);
    await http()
      .delete(`/landing-domains/${row._id}`)
      .set(bearer(impulsador))
      .expect(403);

    await http()
      .delete(`/landing-domains/${row._id}`)
      .set(bearer(owner))
      .expect(200);
    await http()
      .post(`/landing-domains/${row._id}/verify`)
      .set(bearer(owner))
      .expect(404);
    await http().get('/landing-domains').expect(401);
  });
});
