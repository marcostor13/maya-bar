import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Event } from '../src/events/event.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

interface PublicEventRes {
  event: { title: string };
  brand: Record<string, unknown> | null;
}

/** HU26: logo y favicon de la empresa en la landing de sus eventos. */
describe('Marca de la empresa en la landing (HU26)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let manager: Session;
  let slug: string;
  const http = () => request(app.getHttpServer());
  const patch = (s: Session, body: object) =>
    http().patch('/tenants/me/branding').set(bearer(s)).send(body);

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Marca propia');
    other = await registerTenant(app, 'Otra marca');
    manager = await createUser(app, owner, 'MANAGER');
    slug = `marca-${Date.now()}`;
    await app.get<Model<Event>>(getModelToken(Event.name)).create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      localId: new Types.ObjectId(),
      date: new Date('2030-01-01'),
      title: 'Lanzamiento',
      slug,
      status: 'published',
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('C1: el administrador guarda logo y favicon de su empresa', async () => {
    const res = await patch(owner, {
      logo: 'https://cdn.ejemplo.com/logo.png',
      favicon: 'https://cdn.ejemplo.com/icon.png',
    }).expect(200);
    expect(res.body).toEqual({
      logo: 'https://cdn.ejemplo.com/logo.png',
      favicon: 'https://cdn.ejemplo.com/icon.png',
    });
    const me = await http().get('/tenants/me').set(bearer(owner)).expect(200);
    expect((me.body as { branding: unknown }).branding).toMatchObject({
      logo: 'https://cdn.ejemplo.com/logo.png',
      favicon: 'https://cdn.ejemplo.com/icon.png',
    });
    // La otra empresa no se toca.
    const otherMe = await http()
      .get('/tenants/me')
      .set(bearer(other))
      .expect(200);
    expect(
      (otherMe.body as { branding?: { logo?: string } }).branding?.logo,
    ).toBeUndefined();
  });

  it('C3: la landing pública trae solo nombre, logo y favicon', async () => {
    const res = await http().get(`/public/events/${slug}`).expect(200);
    const body = res.body as PublicEventRes;
    expect(body.event.title).toBe('Lanzamiento');
    expect(body.brand).toEqual({
      name: expect.stringMatching(/^Marca propia \d+$/),
      logo: 'https://cdn.ejemplo.com/logo.png',
      favicon: 'https://cdn.ejemplo.com/icon.png',
    });
  });

  it('C2: null quita el logo y conserva el favicon', async () => {
    const res = await patch(owner, { logo: null }).expect(200);
    expect(res.body).toEqual({ favicon: 'https://cdn.ejemplo.com/icon.png' });
    const pub = await http().get(`/public/events/${slug}`).expect(200);
    expect((pub.body as PublicEventRes).brand).toEqual({
      name: expect.stringMatching(/^Marca propia \d+$/),
      favicon: 'https://cdn.ejemplo.com/icon.png',
    });
  });

  it('C4: un usuario que no es administrador recibe 403', async () => {
    await patch(manager, { logo: 'https://cdn.ejemplo.com/x.png' }).expect(403);
    await http()
      .patch('/tenants/me/branding')
      .send({ logo: 'https://cdn.ejemplo.com/x.png' })
      .expect(401);
  });

  it('C5: rechaza URLs que no son https', async () => {
    await patch(owner, { logo: 'http://cdn.ejemplo.com/a.png' }).expect(400);
    await patch(owner, { favicon: 'javascript:alert(1)' }).expect(400);
    await patch(owner, {
      logo: `https://cdn.ejemplo.com/${'a'.repeat(2100)}.png`,
    }).expect(400);
  });
});
