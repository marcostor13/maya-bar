import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ADMIN } from './e2e-env';

export { ADMIN };

/** La aplicación real (mismos módulos y `configureApp` que `main.ts`). */
export async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export interface Session {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; tenantId: string | null };
}

interface SessionBody {
  access_token: string;
  refresh_token: string;
  user: Session['user'];
}

const toSession = (body: SessionBody): Session => ({
  token: body.access_token,
  refreshToken: body.refresh_token,
  user: body.user,
});

export const bearer = (session: Session) => ({
  Authorization: `Bearer ${session.token}`,
});

export async function login(
  app: NestExpressApplication,
  email: string,
  password: string,
): Promise<Session> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);
  return toSession(res.body as SessionBody);
}

let seq = 0;

/** Da de alta una empresa nueva y devuelve la sesión de su administrador. */
export async function registerTenant(
  app: NestExpressApplication,
  name = 'Empresa',
): Promise<Session & { email: string; password: string }> {
  const email = `owner${++seq}-${Date.now()}@e2e.test`;
  const password = 'Clave-Segura-123';
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      name: `${name} ${seq}`,
      email,
      ownerName: `Dueño ${seq}`,
      ownerPassword: password,
    })
    .expect(201);
  return { ...toSession(res.body as SessionBody), email, password };
}

/** Crea un usuario con el rol dado en la empresa del admin y abre su sesión. */
export async function createUser(
  app: NestExpressApplication,
  admin: Session,
  role: string,
): Promise<Session> {
  const email = `${role.toLowerCase()}${++seq}-${Date.now()}@e2e.test`;
  const res = await request(app.getHttpServer())
    .post('/users')
    .set(bearer(admin))
    .send({ name: `Usuario ${role}`, email, role })
    .expect(201);
  const { tempPassword } = res.body as { tempPassword: string };
  return login(app, email, tempPassword);
}

export interface RouteInfo {
  method: string;
  path: string;
}

/** Todas las rutas HTTP que Nest registró en Express, sin duplicados. */
export function listRoutes(app: NestExpressApplication): RouteInfo[] {
  type Layer = {
    route?: { path: string; methods: Record<string, boolean> };
  };
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack: Layer[] };
    _router?: { stack: Layer[] };
  };
  const stack = (instance.router ?? instance._router)?.stack ?? [];
  const seen = new Set<string>();
  const routes: RouteInfo[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      const key = `${method.toUpperCase()} ${layer.route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return routes;
}
