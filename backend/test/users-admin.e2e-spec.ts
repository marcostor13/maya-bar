import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User } from '../src/users/user.schema';
import { hashResetCode } from '../src/users/users.service';
import { MailService } from '../src/mail/mail.service';
import {
  ADMIN,
  bearer,
  createApp,
  createUser,
  login,
  registerTenant,
  type Session,
} from './support/app';

type UserRow = {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  lastAccessAt?: string;
  password?: string;
};
type AuditRow = {
  action: string;
  targetEmail: string;
  actorName?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
};

describe('Administración de usuarios (e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session & { email: string; password: string };
  let other: Session & { email: string; password: string };
  let superadmin: Session;
  let users: Model<User>;
  const http = () => request(app.getHttpServer());

  const team = async (s: Session = owner) =>
    (await http().get('/users').set(bearer(s)).expect(200)).body as UserRow[];
  const audit = async (s: Session = owner) =>
    (await http().get('/users/audit').set(bearer(s)).expect(200))
      .body as AuditRow[];

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Principal');
    other = await registerTenant(app, 'Ajena');
    superadmin = await login(app, ADMIN.email, ADMIN.password);
    users = app.get<Model<User>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app.close();
  });

  it('el último acceso se anota al entrar; quien nunca entró no lo tiene', async () => {
    const created = (
      await http()
        .post('/users')
        .set(bearer(owner))
        .send({
          name: 'Nunca',
          email: `nunca-${Date.now()}@e2e.test`,
          role: 'SERVER',
        })
        .expect(201)
    ).body as { user: UserRow };
    const list = await team();
    expect(
      list.find((u) => u.email === owner.email)?.lastAccessAt,
    ).toBeTruthy();
    expect(
      list.find((u) => u._id === created.user._id)?.lastAccessAt,
    ).toBeUndefined();
    // Nunca se devuelve la contraseña.
    expect(list.every((u) => u.password === undefined)).toBe(true);
  });

  it('cambiar el correo a uno ya usado da 409 y no cambia nada', async () => {
    const seller = await createUser(app, owner, 'MARKETING');
    await http()
      .patch(`/users/${seller.user.id}`)
      .set(bearer(owner))
      .send({ email: other.email })
      .expect(409);
    const row = (await team()).find((u) => u._id === seller.user.id)!;
    expect(row.email).toBe(seller.user.email);

    await http()
      .patch(`/users/${seller.user.id}`)
      .set(bearer(owner))
      .send({ email: `Nuevo-${Date.now()}@E2E.test`, phone: '51999111222' })
      .expect(200);
  });

  it('restablecer con temporal: fuera la contraseña vieja, el token y el refresh', async () => {
    const victim = await createUser(app, owner, 'MARKETING');
    const res = await http()
      .post(`/users/${victim.user.id}/reset-access`)
      .set(bearer(owner))
      .send({ mode: 'temp' })
      .expect(201);
    const { tempPassword } = res.body as { tempPassword: string };
    expect(tempPassword).toMatch(/^Tmp@/);

    await http().get('/conversations').set(bearer(victim)).expect(401);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: victim.refreshToken })
      .expect(401);
    const fresh = await login(app, victim.user.email, tempPassword);
    const me = await users.findById(fresh.user.id).lean();
    expect(me?.mustChangePassword).toBe(true);

    // Sin proveedor de correo, el modo "email" se rechaza con un motivo.
    await http()
      .post(`/users/${victim.user.id}/reset-access`)
      .set(bearer(owner))
      .send({ mode: 'email' })
      .expect(400);
  });

  it('cambiar el rol invalida el token, pero al renovar llega el rol nuevo', async () => {
    const u = await createUser(app, owner, 'MARKETING');
    await http()
      .patch(`/users/${u.user.id}`)
      .set(bearer(owner))
      .send({ role: 'MANAGER' })
      .expect(200);
    await http().get('/conversations').set(bearer(u)).expect(401);
    const renewed = (
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: u.refreshToken })
        .expect(201)
    ).body as { user: { role: string } };
    expect(renewed.user.role).toBe('MANAGER');
  });

  it('nadie se desactiva, elimina ni se cambia el rol a sí mismo; la empresa no se queda sin admin', async () => {
    const me = owner.user.id;
    await http()
      .patch(`/users/${me}`)
      .set(bearer(owner))
      .send({ role: 'MANAGER' })
      .expect(403);
    await http().delete(`/users/${me}`).set(bearer(owner)).expect(403);
    await http()
      .delete(`/users/${me}?mode=delete`)
      .set(bearer(owner))
      .expect(403);
    // El superadmin tampoco puede dejar a la empresa sin su único admin.
    await http()
      .patch(`/admin/users/${me}/active`)
      .set(bearer(superadmin))
      .send({ isActive: false })
      .expect(403);
  });

  it('traspasa la administración y queda en el registro', async () => {
    const t = await registerTenant(app, 'Traspaso');
    const next = await createUser(app, t, 'MANAGER');
    await http()
      .post('/users/transfer-admin')
      .set(bearer(t))
      .send({ toUserId: next.user.id, newRole: 'MANAGER' })
      .expect(201);

    // El antiguo dueño ya no es admin (su token se invalidó).
    await http().get('/users').set(bearer(t)).expect(401);
    const asNewAdmin = (
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: next.refreshToken })
        .expect(201)
    ).body as { access_token: string; user: { role: string } };
    expect(asNewAdmin.user.role).toBe('TENANT_ADMIN');
    const asOldOwner = (
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: t.refreshToken })
        .expect(201)
    ).body as { user: { role: string } };
    expect(asOldOwner.user.role).toBe('MANAGER');

    const rows = (
      await http()
        .get('/users/audit')
        .set({ Authorization: `Bearer ${asNewAdmin.access_token}` })
        .expect(200)
    ).body as AuditRow[];
    const transfers = rows.filter((r) => r.action === 'transfer_admin');
    expect(transfers.map((r) => r.changes?.role?.to).sort()).toEqual([
      'MANAGER',
      'TENANT_ADMIN',
    ]);
  });

  it('el registro guarda cada acción sin secretos y está aislado por empresa', async () => {
    const u = await createUser(app, owner, 'MARKETING');
    await http()
      .patch(`/users/${u.user.id}`)
      .set(bearer(owner))
      .send({ role: 'MANAGER' })
      .expect(200);
    await http().delete(`/users/${u.user.id}`).set(bearer(owner)).expect(200);
    await http()
      .patch(`/users/${u.user.id}`)
      .set(bearer(owner))
      .send({ isActive: true })
      .expect(200);
    const res = await http()
      .post(`/users/${u.user.id}/reset-access`)
      .set(bearer(owner))
      .send({ mode: 'temp' })
      .expect(201);
    await http()
      .delete(`/users/${u.user.id}?mode=delete`)
      .set(bearer(owner))
      .expect(200);

    const mine = (await audit()).filter((r) => r.targetEmail === u.user.email);
    expect(mine.map((r) => r.action).sort()).toEqual(
      [
        'activate',
        'create',
        'deactivate',
        'delete',
        'reset_access',
        'update',
      ].sort(),
    );
    expect(mine.find((r) => r.action === 'update')?.changes?.role).toEqual({
      from: 'MARKETING',
      to: 'MANAGER',
    });
    expect(JSON.stringify(mine)).not.toContain(
      (res.body as { tempPassword: string }).tempPassword,
    );
    expect(mine[0].actorName).toBeTruthy();

    const foreign = await audit(other);
    expect(foreign.some((r) => r.targetEmail === u.user.email)).toBe(false);
    const platform = (
      await http().get('/admin/users/audit').set(bearer(superadmin)).expect(200)
    ).body as AuditRow[];
    expect(platform.some((r) => r.targetEmail === u.user.email)).toBe(true);
  });

  it('aislamiento: otra empresa recibe 404, un no admin 403 y /admin/users exige superadmin', async () => {
    const mk = await createUser(app, owner, 'MARKETING');
    await http()
      .patch(`/users/${mk.user.id}`)
      .set(bearer(other))
      .send({ name: 'x' })
      .expect(404);
    await http()
      .post(`/users/${mk.user.id}/reset-access`)
      .set(bearer(other))
      .send({ mode: 'temp' })
      .expect(404);
    await http().delete(`/users/${mk.user.id}`).set(bearer(other)).expect(404);
    await http()
      .get(`/users/${mk.user.id}/impact`)
      .set(bearer(other))
      .expect(404);
    await http().get('/users').set(bearer(mk)).expect(403);
    await http().get('/admin/users?q=ab').set(bearer(owner)).expect(403);
    await http()
      .patch(`/admin/users/${mk.user.id}/active`)
      .set(bearer(owner))
      .send({ isActive: false })
      .expect(403);
  });

  it('el superadmin busca en toda la plataforma y gestiona dentro de la empresa del usuario', async () => {
    const target = await createUser(app, other, 'MARKETING');
    const dest = await createUser(app, other, 'MANAGER');
    const found = (
      await http()
        .get(`/admin/users?q=${encodeURIComponent(target.user.email)}`)
        .set(bearer(superadmin))
        .expect(200)
    ).body as Array<UserRow & { tenantName: string }>;
    expect(found).toHaveLength(1);
    expect(found[0].tenantName).toMatch(/^Ajena/);

    // No aparece ningún superadmin.
    const admins = (
      await http()
        .get('/admin/users?q=admin@e2e')
        .set(bearer(superadmin))
        .expect(200)
    ).body as UserRow[];
    expect(admins).toEqual([]);

    await http()
      .patch(`/admin/users/${target.user.id}/active`)
      .set(bearer(superadmin))
      .send({ isActive: false })
      .expect(200);
    await http().get('/conversations').set(bearer(target)).expect(401);
    await http()
      .post(`/admin/users/${target.user.id}/reset-access`)
      .set(bearer(superadmin))
      .send({ mode: 'temp' })
      .expect(201);
    const impact = await http()
      .get(`/admin/users/${target.user.id}/impact`)
      .set(bearer(superadmin))
      .expect(200);
    expect(impact.body).toMatchObject({ email: target.user.email });

    // Reasignar a alguien de otra empresa no vale.
    await http()
      .delete(`/admin/users/${target.user.id}?reassignTo=${owner.user.id}`)
      .set(bearer(superadmin))
      .expect(404);
    await http()
      .delete(`/admin/users/${target.user.id}?reassignTo=${dest.user.id}`)
      .set(bearer(superadmin))
      .expect(200);
    expect(await users.findById(target.user.id)).toBeNull();
  });

  it('recuperar la contraseña por código invalida las sesiones y no revela si el correo existe', async () => {
    const u = await createUser(app, owner, 'MARKETING');
    const mailSpy = jest.spyOn(app.get(MailService), 'sendPasswordResetEmail');
    const unknown = await http()
      .post('/auth/forgot-password')
      .send({ email: `nadie-${Date.now()}@e2e.test` })
      .expect(201);
    const known = await http()
      .post('/auth/forgot-password')
      .send({ email: u.user.email })
      .expect(201);
    expect(known.body).toEqual(unknown.body);

    // En la base solo queda el hash: el código sale únicamente por correo.
    const stored = (await users.findById(u.user.id).lean())!;
    expect(stored.resetPasswordCode).toMatch(/^[0-9a-f]{64}$/);
    const code = mailSpy.mock.calls.at(-1)![1];
    expect(stored.resetPasswordCode).toBe(hashResetCode(code));
    await http()
      .post('/auth/reset-password')
      .send({
        email: u.user.email,
        code: stored.resetPasswordCode,
        newPassword: 'Nueva-Clave-123',
      })
      .expect(400);
    await http()
      .post('/auth/reset-password')
      .send({ email: u.user.email, code, newPassword: 'Nueva-Clave-123' })
      .expect(201);
    await http().get('/conversations').set(bearer(u)).expect(401);
    await login(app, u.user.email, 'Nueva-Clave-123');
    mailSpy.mockRestore();
  });

  it('el alta no devuelve el hash de la contraseña', async () => {
    const res = await http()
      .post('/users')
      .set(bearer(owner))
      .send({
        name: 'Alta',
        email: `alta-${Date.now()}@e2e.test`,
        role: 'MARKETING',
      })
      .expect(201);
    const body = res.body as {
      user: Record<string, unknown>;
      tempPassword: string;
    };
    expect(body.tempPassword).toMatch(/^Tmp@/);
    expect(body.user.email).toBeDefined();
    expect(body.user).not.toHaveProperty('password');
  });

  it('ninguna lista devuelve contraseñas ni códigos de recuperación', async () => {
    const u = await createUser(app, owner, 'MARKETING');
    await http()
      .post('/auth/forgot-password')
      .send({ email: u.user.email })
      .expect(201);
    const lists = [
      (await http().get('/users').set(bearer(owner)).expect(200)).body,
      (
        await http()
          .get(`/users/${owner.user.id}/reassign-candidates`)
          .set(bearer(owner))
          .expect(200)
      ).body,
      (
        await http()
          .get(`/admin/users?q=${encodeURIComponent(u.user.email)}`)
          .set(bearer(superadmin))
          .expect(200)
      ).body,
    ] as Record<string, unknown>[][];
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(0);
      for (const row of list) {
        for (const secret of [
          'password',
          'resetPasswordCode',
          'resetPasswordExpires',
          'emailVerificationCodeHash',
        ])
          expect(row).not.toHaveProperty(secret);
      }
    }
  });

  it('eliminar al único admin da 403; a un admin inactivo se le puede eliminar si queda otro activo', async () => {
    const t = await registerTenant(app, 'Tercera');
    await http()
      .delete(`/admin/users/${t.user.id}`)
      .set(bearer(superadmin))
      .expect(403);

    const exAdmin = await createUser(app, t, 'MANAGER');
    await users.updateOne(
      { _id: exAdmin.user.id },
      { $set: { role: 'TENANT_ADMIN', isActive: false } },
    );
    await http()
      .delete(`/users/${exAdmin.user.id}?mode=delete`)
      .set(bearer(t))
      .expect(200);
    expect(await users.findById(exAdmin.user.id)).toBeNull();
  });
});
