import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ADMIN,
  bearer,
  createApp,
  listRoutes,
  login,
  registerTenant,
  type RouteInfo,
  type Session,
} from './support/app';

/**
 * Rutas que se sirven sin sesión a propósito. Añadir una aquí es una decisión
 * de seguridad: cualquier ruta nueva que no esté en la lista debe responder 401
 * sin token, o esta prueba falla.
 */
const PUBLIC_ROUTES: RegExp[] = [
  /^GET \/$/,
  /^POST \/auth\/(login|refresh|logout|register|forgot-password|reset-password)$/,
  /^(GET|POST|PATCH) \/public\//,
  // Webhooks de Meta/WAHA: se autentican con verify token o firma, no con JWT.
  /^(GET|POST) \/(wa|ig|messenger)\/webhook/,
  // Vuelta de los proveedores OAuth: la sesión viaja en el `state` firmado.
  /^GET \/(calendar|email-accounts)\/oauth\/:provider\/callback$/,
  /^GET \/(instagram|messenger)-accounts\/oauth\/callback$/,
  // Links cortos y baja de campañas: los abre el destinatario.
  /^(GET|HEAD) \/l\/:code$/,
  /^(GET|POST) \/u\/:token$/,
];

const isPublic = (r: RouteInfo) =>
  PUBLIC_ROUTES.some((re) => re.test(`${r.method} ${r.path}`));

const ID = '507f1f77bcf86cd799439011';
/** Sustituye cada `:param` por un ObjectId válido que no existe. */
const fill = (path: string) => path.replace(/:[A-Za-z]+/g, ID);

describe('Plataforma (e2e)', () => {
  let app: NestExpressApplication;
  let routes: RouteInfo[];

  beforeAll(async () => {
    app = await createApp();
    routes = listRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('arranca y responde en la raíz', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('registra las rutas de todos los módulos', () => {
    expect(routes.length).toBeGreaterThan(250);
  });

  it('ninguna ruta privada responde sin sesión', async () => {
    const open: string[] = [];
    for (const route of routes.filter((r) => !isPublic(r))) {
      const method = route.method.toLowerCase() as 'get';
      const res = await request(app.getHttpServer())[method](fill(route.path));
      if (res.status !== 401)
        open.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('un token inválido se rechaza', async () => {
    await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  describe('lecturas con sesión', () => {
    let admin: Session;
    let superadmin: Session;

    beforeAll(async () => {
      admin = await registerTenant(app);
      superadmin = await login(app, ADMIN.email, ADMIN.password);
    });

    // Un GET sobre una empresa recién creada, o sobre un id que no existe,
    // puede contestar 200, 400, 403 o 404; lo que nunca puede es reventar.
    it.each([
      ['administrador de empresa', () => admin],
      ['superadmin', () => superadmin],
    ])('ningún GET devuelve 5xx para %s', async (_label, session) => {
      const broken: string[] = [];
      const gets = routes.filter(
        (r) =>
          r.method === 'GET' &&
          // Salen a un proveedor externo o redirigen fuera.
          !/oauth|webhook|\/l\/:code|\/u\/:token/.test(r.path),
      );
      for (const route of gets) {
        const res = await request(app.getHttpServer())
          .get(fill(route.path))
          .set(bearer(session()));
        if (res.status >= 500)
          broken.push(
            `GET ${route.path} → ${res.status} ${JSON.stringify(res.body)}`,
          );
      }
      expect(broken).toEqual([]);
    });
  });
});
