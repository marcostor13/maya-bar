import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ADMIN,
  bearer,
  createApp,
  createUser,
  login,
  registerTenant,
} from './support/app';

describe('Autenticación (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('siembra el superadmin y le deja entrar', async () => {
    const session = await login(app, ADMIN.email, ADMIN.password);
    expect(session.user.role).toBe('SUPERADMIN');
    expect(session.user.tenantId ?? null).toBeNull();
  });

  it('el login no distingue mayúsculas ni espacios en el email', async () => {
    await http()
      .post('/auth/login')
      .send({ email: ADMIN.email.toUpperCase(), password: ADMIN.password })
      .expect(201);
  });

  it('rechaza credenciales malas y cuerpos inválidos', async () => {
    await http()
      .post('/auth/login')
      .send({ email: ADMIN.email, password: 'incorrecta' })
      .expect(401);
    await http()
      .post('/auth/login')
      .send({ email: 'no-es-email', password: 'x' })
      .expect(400);
    await http().post('/auth/login').send({}).expect(400);
  });

  it('registra una empresa y abre sesión como su administrador', async () => {
    const owner = await registerTenant(app, 'Registro');
    expect(owner.user.role).toBe('TENANT_ADMIN');
    expect(owner.user.tenantId).toBeTruthy();

    const me = await http().get('/tenants/me').set(bearer(owner)).expect(200);
    expect((me.body as { name: string }).name).toContain('Registro');

    const again = await login(app, owner.email, owner.password);
    expect(again.user.tenantId).toBe(owner.user.tenantId);
  });

  it('no registra con contraseña corta', async () => {
    await http()
      .post('/auth/register')
      .send({
        name: 'X',
        email: 'corta@e2e.test',
        ownerName: 'X',
        ownerPassword: '1234',
      })
      .expect(400);
  });

  it('rota el refresh token y el anterior deja de valer', async () => {
    const owner = await registerTenant(app);
    const refreshed = await http()
      .post('/auth/refresh')
      .send({ refreshToken: owner.refreshToken })
      .expect(201);
    const body = refreshed.body as {
      access_token: string;
      refresh_token: string;
    };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).not.toBe(owner.refreshToken);

    await http()
      .get('/tenants/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
  });

  it('cerrar sesión invalida el refresh token', async () => {
    const owner = await registerTenant(app);
    await http()
      .post('/auth/logout')
      .send({ refreshToken: owner.refreshToken })
      .expect(201);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: owner.refreshToken })
      .expect(401);
  });

  it('cambia la contraseña y la vieja deja de servir', async () => {
    const owner = await registerTenant(app);
    const nueva = 'Otra-Clave-456';

    await http()
      .patch('/auth/change-password')
      .set(bearer(owner))
      .send({ currentPassword: 'equivocada', newPassword: nueva })
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));

    await http()
      .patch('/auth/change-password')
      .set(bearer(owner))
      .send({ currentPassword: owner.password, newPassword: nueva })
      .expect(200);

    await http()
      .post('/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(401);
    await login(app, owner.email, nueva);
  });

  it('recuperar contraseña no revela si el correo existe', async () => {
    const res = await http()
      .post('/auth/forgot-password')
      .send({ email: 'nadie@e2e.test' })
      .expect(201);
    expect((res.body as { message: string }).message).toMatch(/Si el correo/);

    await http()
      .post('/auth/reset-password')
      .send({
        email: 'nadie@e2e.test',
        code: '000000',
        newPassword: 'Nueva-Clave-789',
      })
      .expect(400);
  });

  it('un usuario nuevo entra con contraseña temporal y debe cambiarla', async () => {
    const owner = await registerTenant(app);
    const marketing = await createUser(app, owner, 'MARKETING');
    expect(marketing.user.role).toBe('MARKETING');
    expect(
      (marketing.user as unknown as { mustChangePassword: boolean })
        .mustChangePassword,
    ).toBe(true);
  });

  it('un usuario desactivado pierde el acceso', async () => {
    const owner = await registerTenant(app);
    const manager = await createUser(app, owner, 'MANAGER');
    await http().get('/customers').set(bearer(manager)).expect(200);

    await http()
      .delete(`/users/${manager.user.id}`)
      .set(bearer(owner))
      .expect(200);

    await http().get('/customers').set(bearer(manager)).expect(401);
  });
});
