import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN, bearer, createApp, registerTenant } from './support/app';
import { hotp, stepAt } from '../src/auth/totp';

/** Código del paso siguiente: el actual ya se gastó al confirmar (anti-repetición). */
const code = (secret: string, ahead = 1) => hotp(secret, stepAt(Date.now()) + ahead);

describe('Doble factor de acceso (HU62)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function enableTotp(token: string) {
    const start = await http().post('/auth/2fa/setup').set({ Authorization: `Bearer ${token}` }).send({ method: 'totp' }).expect(201);
    const { secret, otpauthUrl } = start.body as { secret: string; otpauthUrl: string };
    expect(otpauthUrl).toContain('otpauth://totp/');
    await http().post('/auth/2fa/setup/confirm').set({ Authorization: `Bearer ${token}` }).send({ code: '000000' }).expect(400);
    const conf = await http().post('/auth/2fa/setup/confirm').set({ Authorization: `Bearer ${token}` }).send({ code: code(secret, 0) }).expect(201);
    const { backupCodes } = conf.body as { backupCodes: string[] };
    expect(backupCodes).toHaveLength(10);
    return { secret, backupCodes };
  }

  it('C1: con 2FA activo el login sin código no entrega tokens; con TOTP válido sí, y recuerda el dispositivo', async () => {
    const owner = await registerTenant(app, '2FA');
    const { secret } = await enableTotp(owner.token);

    const st = await http().get('/auth/2fa/status').set(bearer(owner)).expect(200);
    expect(st.body).toMatchObject({ enabled: true, method: 'totp', backupCodesLeft: 10 });

    const login = await http().post('/auth/login').send({ email: owner.email, password: owner.password }).expect(201);
    expect(login.body.access_token).toBeUndefined();
    expect(login.body.refresh_token).toBeUndefined();
    expect(login.body).toMatchObject({ twoFactorRequired: true, method: 'totp' });
    const challengeToken = login.body.challengeToken as string;

    await http().post('/auth/2fa/verify').send({ challengeToken, code: '123456' }).expect(401);
    await http().post('/auth/2fa/verify').send({ challengeToken: 'basura', code: code(secret) }).expect(401);
    const ok = await http().post('/auth/2fa/verify').send({ challengeToken, code: code(secret), rememberDevice: true }).expect(201);
    expect(ok.body.access_token).toEqual(expect.any(String));
    expect(ok.body.deviceToken).toEqual(expect.any(String));
    // El mismo código no sirve dos veces.
    await http().post('/auth/2fa/verify').send({ challengeToken, code: code(secret) }).expect(401);

    // Dispositivo recordado: entra sin segundo factor.
    const again = await http().post('/auth/login').send({ email: owner.email, password: owner.password, deviceToken: ok.body.deviceToken }).expect(201);
    expect(again.body.access_token).toEqual(expect.any(String));

    // Desactivar exige la contraseña; luego la marca del dispositivo ya no vale.
    await http().post('/auth/2fa/disable').set(bearer(owner)).send({ password: 'mala' }).expect(401);
    await http().post('/auth/2fa/disable').set(bearer(owner)).send({ password: owner.password }).expect(201);
    const plain = await http().post('/auth/login').send({ email: owner.email, password: owner.password }).expect(201);
    expect(plain.body.access_token).toEqual(expect.any(String));
  });

  it('C2: cada código de respaldo sirve una sola vez', async () => {
    const owner = await registerTenant(app, '2FA respaldo');
    const { backupCodes } = await enableTotp(owner.token);
    const challenge = async () =>
      (await http().post('/auth/login').send({ email: owner.email, password: owner.password }).expect(201)).body.challengeToken as string;

    const used = backupCodes[3];
    const ok = await http().post('/auth/2fa/verify').send({ challengeToken: await challenge(), code: used.toUpperCase() }).expect(201);
    expect(ok.body.access_token).toEqual(expect.any(String));
    await http().post('/auth/2fa/verify').send({ challengeToken: await challenge(), code: used }).expect(401);

    const st = await http().get('/auth/2fa/status').set({ Authorization: `Bearer ${ok.body.access_token}` }).expect(200);
    expect(st.body.backupCodesLeft).toBe(9);
  });

  it('C3: con 2FA obligatorio en la empresa hay que configurarlo antes de entrar; el admin puede reiniciarlo', async () => {
    const owner = await registerTenant(app, '2FA obligatorio');
    const created = await http().post('/users').set(bearer(owner)).send({ name: 'Vendedora', email: `v-${Date.now()}@e2e.test`, role: 'MANAGER' }).expect(201);
    const { tempPassword } = created.body as { tempPassword: string };
    const email = (created.body as { user?: { email: string }; email?: string }).user?.email ?? (created.body as { email: string }).email;
    const userId = String((created.body as { user?: { _id: string }; _id?: string }).user?._id ?? (created.body as { _id: string })._id);

    // Solo el administrador de la empresa fija la política.
    await http().put('/auth/2fa/policy').set(bearer(owner)).send({ required: true }).expect(200);

    const login = await http().post('/auth/login').send({ email, password: tempPassword }).expect(201);
    expect(login.body.access_token).toBeUndefined();
    expect(login.body).toMatchObject({ twoFactorSetupRequired: true, reason: 'tenant' });
    const challengeToken = login.body.challengeToken as string;
    // Con el reto de configuración no se puede "verificar" un login.
    await http().post('/auth/2fa/verify').send({ challengeToken, code: '123456' }).expect(401);

    const start = await http().post('/auth/2fa/enroll/start').send({ challengeToken, method: 'totp' }).expect(201);
    const secret = start.body.secret as string;
    const conf = await http().post('/auth/2fa/enroll/confirm').send({ challengeToken, code: code(secret, 0) }).expect(201);
    expect(conf.body.access_token).toEqual(expect.any(String));
    expect(conf.body.backupCodes).toHaveLength(10);
    const staff = { Authorization: `Bearer ${conf.body.access_token}` };

    // Obligatorio: no puede desactivarlo ni cambiar la política.
    await http().post('/auth/2fa/disable').set(staff).send({ password: tempPassword }).expect(403);
    await http().put('/auth/2fa/policy').set(staff).send({ required: false }).expect(403);

    // Otra empresa no puede reiniciarlo; su administrador sí.
    const other = await registerTenant(app, 'Ajena');
    await http().post(`/auth/2fa/reset/${userId}`).set(bearer(other)).expect(404);
    await http().post(`/auth/2fa/reset/${userId}`).set(bearer(owner)).expect(201);
    const after = await http().post('/auth/login').send({ email, password: tempPassword }).expect(201);
    expect(after.body).toMatchObject({ twoFactorSetupRequired: true });
  });

  it('el superadmin tiene 2FA obligatorio', async () => {
    process.env.SUPERADMIN_2FA = 'required';
    try {
      const login = await http().post('/auth/login').send(ADMIN).expect(201);
      expect(login.body.access_token).toBeUndefined();
      expect(login.body).toMatchObject({ twoFactorSetupRequired: true, reason: 'superadmin' });
    } finally {
      process.env.SUPERADMIN_2FA = 'optional';
    }
  });
});
