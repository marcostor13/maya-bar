import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { ApiAccess } from '../src/api-access/api-access.schema';
import { hashKey } from '../src/api-access/api-access.service';
import { User } from '../src/users/user.schema';
import {
  ADMIN,
  bearer,
  createApp,
  createUser,
  login,
  registerTenant,
  type Session,
} from './support/app';

type Doc = { _id: string } & Record<string, unknown>;

describe('Empresas, eventos, campañas y entradas públicas (e2e)', () => {
  let app: NestExpressApplication;
  let root: Session;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    root = await login(app, ADMIN.email, ADMIN.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('administración de empresas (superadmin)', () => {
    it('crea una empresa con credenciales temporales que funcionan', async () => {
      const res = await http()
        .post('/tenants')
        .set(bearer(root))
        .send({ name: 'Cliente Nuevo SAC', email: 'nuevo@cliente-sac.pe' })
        .expect(201);
      const { tenant, credentials } = res.body as {
        tenant: Doc;
        credentials: { email: string; password: string };
      };
      expect(tenant.name).toBe('Cliente Nuevo SAC');

      const admin = await login(app, credentials.email, credentials.password);
      expect(admin.user.role).toBe('TENANT_ADMIN');
      expect(admin.user.tenantId).toBe(tenant._id);

      const all = await http().get('/tenants').set(bearer(root)).expect(200);
      expect((all.body as Doc[]).map((t) => t._id)).toContain(tenant._id);
    });

    it('no permite dos empresas con el mismo correo', async () => {
      const body = { name: 'Duplicada Uno', email: 'dup@cliente.pe' };
      await http().post('/tenants').set(bearer(root)).send(body).expect(201);
      await http()
        .post('/tenants')
        .set(bearer(root))
        .send({ ...body, name: 'Duplicada Dos' })
        .expect(409);
    });

    it('cambia el plan de una empresa', async () => {
      const owner = await registerTenant(app, 'Plan');
      const res = await http()
        .patch(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ plan: 'crece' })
        .expect(200);
      expect((res.body as Doc).plan).toBe('crece');

      await http()
        .patch(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ plan: 'inventado' })
        .expect(400);
    });

    it('eliminar una empresa borra también sus datos y sus accesos', async () => {
      const owner = await registerTenant(app, 'Efímera');
      const survivor = await registerTenant(app, 'Permanente');
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({ name: 'Se va con la empresa' })
        .expect(201);
      const kept = (
        await http()
          .post('/customers')
          .set(bearer(survivor))
          .send({ name: 'Se queda' })
          .expect(201)
      ).body as Doc;

      const name = (
        (await http().get('/tenants/me').set(bearer(owner)).expect(200))
          .body as Doc
      ).name as string;
      // HU16 C5: sin el nombre exacto no se borra nada.
      await http()
        .delete(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ confirmName: 'otro nombre' })
        .expect(400);
      await http()
        .delete(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ confirmName: name })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(401);
      // El borrado en cascada no toca a las demás empresas.
      const others = await http()
        .get('/customers')
        .set(bearer(survivor))
        .expect(200);
      expect((others.body as Doc[]).map((c) => c._id)).toContain(kept._id);
    });

    it('una empresa no administra a las demás ni se sube de plan', async () => {
      const owner = await registerTenant(app, 'Curiosa');
      const victim = await registerTenant(app, 'Víctima');

      await http().get('/tenants').set(bearer(owner)).expect(403);
      await http()
        .post('/tenants')
        .set(bearer(owner))
        .send({ name: 'Otra', email: 'otra@cliente.pe' })
        .expect(403);
      await http()
        .patch(`/tenants/${victim.user.tenantId}`)
        .set(bearer(owner))
        .send({ name: 'Secuestrada' })
        .expect(403);
      await http()
        .delete(`/tenants/${victim.user.tenantId}`)
        .set(bearer(owner))
        .expect(403);

      // Sus datos de contacto sí; el plan y el estado no.
      await http()
        .patch('/tenants/me')
        .set(bearer(owner))
        .send({ phone: '+51 900 000 000', plan: 'escala', isActive: false })
        .expect(200);
      const me = await http().get('/tenants/me').set(bearer(owner)).expect(200);
      expect((me.body as Doc).phone).toBe('+51 900 000 000');
      expect((me.body as Doc).plan).not.toBe('escala');
      expect((me.body as Doc).isActive).not.toBe(false);

      const marketing = await createUser(app, owner, 'MARKETING');
      await http()
        .patch('/tenants/me')
        .set(bearer(marketing))
        .send({ name: 'Renombrada' })
        .expect(403);
    });
  });

  describe('administración total de empresas (HU16)', () => {
    it('C4: suspender corta login, sesiones, refresh y claves de API; reactivar lo devuelve', async () => {
      const owner = await registerTenant(app, 'Suspendible');
      const tid = owner.user.tenantId!;
      const key = `mk_e2e_${Date.now()}`;
      await app.get<Model<ApiAccess>>(getModelToken(ApiAccess.name)).create({
        tenantId: new Types.ObjectId(tid),
        name: 'Web',
        channel: 'whatsapp',
        accountId: new Types.ObjectId(),
        keyHash: hashKey(key),
        keyPrefix: key.slice(0, 10),
        allowedDomains: ['x.pe'],
      });
      const apiStatus = () =>
        http()
          .get(`/public/v1/messages/${String(new Types.ObjectId())}`)
          .set('Authorization', `Bearer ${key}`)
          .set('Origin', 'https://x.pe');
      // Clave válida: el mensaje no existe (404), pero la clave pasa.
      await apiStatus().expect(404);

      await http()
        .patch(`/tenants/${tid}`)
        .set(bearer(root))
        .send({ isActive: false })
        .expect(200);

      await http().get('/customers').set(bearer(owner)).expect(401);
      const login401 = await http()
        .post('/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(401);
      expect(JSON.stringify(login401.body)).toContain('suspendida');
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: owner.refreshToken })
        .expect(401);
      await apiStatus().expect(401);

      await http()
        .patch(`/tenants/${tid}`)
        .set(bearer(root))
        .send({ isActive: true })
        .expect(200);
      const back = await login(app, owner.email, owner.password);
      await http().get('/customers').set(bearer(back)).expect(200);
      await apiStatus().expect(404);

      const audit = (
        await http()
          .get(`/admin/tenants/${tid}/audit`)
          .set(bearer(root))
          .expect(200)
      ).body as Doc[];
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining(['suspend', 'reactivate']),
      );
    });

    it('C2, C3, C6, C7: ficha con usuarios y uso; edición con plan y fechas; 409 y 403', async () => {
      const owner = await registerTenant(app, 'Ficha');
      const other = await registerTenant(app, 'Otra Ficha');
      const tid = owner.user.tenantId!;
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({ name: 'Cliente uno' })
        .expect(201);

      const overview = (
        await http()
          .get(`/admin/tenants/${tid}/overview`)
          .set(bearer(root))
          .expect(200)
      ).body as {
        tenant: Doc;
        users: Doc[];
        usage: { contacts: number; accounts: Record<string, number> };
      };
      expect(overview.tenant._id).toBe(tid);
      expect(overview.users.map((u) => u.email)).toContain(owner.email);
      expect(JSON.stringify(overview.users)).not.toContain('password');
      expect(overview.usage.contacts).toBe(1);
      expect(overview.usage.accounts.whatsapp).toBe(0);

      const patched = (
        await http()
          .patch(`/tenants/${tid}`)
          .set(bearer(root))
          .send({
            plan: 'escala',
            planExpiresAt: '2027-01-31',
            trialEndsAt: null,
          })
          .expect(200)
      ).body as Doc;
      expect(patched.plan).toBe('escala');
      expect(String(patched.planExpiresAt)).toContain('2027-01-31');
      expect(patched.trialEndsAt).toBeUndefined();

      await http()
        .patch(`/tenants/${tid}`)
        .set(bearer(root))
        .send({ plan: 'gratis' })
        .expect(400);
      const otherEmail = (
        (await http().get('/tenants/me').set(bearer(other)).expect(200))
          .body as Doc
      ).email;
      await http()
        .patch(`/tenants/${tid}`)
        .set(bearer(root))
        .send({ email: otherEmail })
        .expect(409);

      const audit = (
        await http()
          .get(`/admin/tenants/${tid}/audit`)
          .set(bearer(root))
          .expect(200)
      ).body as Doc[];
      const update = audit.find((a) => a.action === 'update')!;
      expect(update.changes).toMatchObject({
        plan: { to: 'escala' },
        planExpiresAt: { to: '2027-01-31' },
      });

      await http()
        .get(`/admin/tenants/${tid}/overview`)
        .set(bearer(owner))
        .expect(403);
      await http()
        .get(`/admin/tenants/${tid}/audit`)
        .set(bearer(owner))
        .expect(403);
    });
  });

  describe('usuario principal de la empresa (HU17)', () => {
    type Overview = { owner: Doc | null; users: Doc[] };
    const overview = async (tid: string) =>
      (
        await http()
          .get(`/admin/tenants/${tid}/overview`)
          .set(bearer(root))
          .expect(200)
      ).body as Overview;

    it('C1, C2, C5: recupera la cuenta con correo nuevo, reactivación y contraseña temporal', async () => {
      const owner = await registerTenant(app, 'Recuperable');
      const tid = owner.user.tenantId!;
      expect((await overview(tid)).owner?.email).toBe(owner.email);

      // Con la cuenta activa: su token deja de valer al recuperarla.
      const first = await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(root))
        .send({ userId: owner.user.id, mode: 'temp' })
        .expect(201);
      await http().get('/customers').set(bearer(owner)).expect(401);
      owner.password = (first.body as { tempPassword: string }).tempPassword;

      // Sin proveedor de correo, el modo email se rechaza sin cambiar nada.
      await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(root))
        .send({
          userId: owner.user.id,
          email: `no-${Date.now()}@e2e.test`,
          mode: 'email',
        })
        .expect(400);
      expect((await overview(tid)).owner?.email).toBe(owner.email);

      const uid = owner.user.id;
      // Un segundo admin para poder desactivar al principal.
      await http()
        .post(`/admin/tenants/${tid}/owner/assign`)
        .set(bearer(root))
        .send({ name: 'Segundo', email: `segundo-${Date.now()}@e2e.test` })
        .expect(201);
      // El principal sigue siendo el más antiguo aunque haya otro admin.
      expect((await overview(tid)).owner?.email).toBe(owner.email);
      await http()
        .patch(`/admin/users/${String(uid)}/active`)
        .set(bearer(root))
        .send({ isActive: false })
        .expect(200);
      expect((await overview(tid)).owner?.email).not.toBe(owner.email);

      const newEmail = `recuperado-${Date.now()}@e2e.test`;
      const res = await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(root))
        .send({ userId: uid, email: newEmail, mode: 'temp' })
        .expect(201);
      const { tempPassword, user } = res.body as {
        tempPassword: string;
        user: Doc;
      };
      expect(user.email).toBe(newEmail);
      expect(user.isActive).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('$2');

      await http().get('/customers').set(bearer(owner)).expect(401);
      await http()
        .post('/auth/login')
        .send({ email: newEmail, password: owner.password })
        .expect(401);
      const back = await login(app, newEmail, tempPassword);
      expect(
        (back.user as { mustChangePassword?: boolean }).mustChangePassword,
      ).toBe(true);

      const audit = (
        await http()
          .get(`/admin/tenants/${tid}/audit`)
          .set(bearer(root))
          .expect(200)
      ).body as Doc[];
      const reset = audit.find((a) => a.action === 'owner_reset')!;
      expect(reset.changes).toMatchObject({
        email: { from: owner.email, to: newEmail },
        mode: { to: 'temp' },
      });
      expect(audit.map((a) => a.action)).toContain('owner_assign');
      expect(JSON.stringify(audit)).not.toContain(tempPassword);
      // También en el registro de usuarios, sin la contraseña.
      const userLog = (
        await http().get('/users/audit').set(bearer(back)).expect(200)
      ).body as Doc[];
      expect(userLog.map((a) => a.action)).toEqual(
        expect.arrayContaining(['reset_access', 'activate']),
      );
      expect(JSON.stringify(userLog)).not.toContain(tempPassword);
    });

    it('C3, C4, C6: solo administradores de esa empresa; nombrar a uno existente; 403', async () => {
      const owner = await registerTenant(app, 'Nombrable');
      const other = await registerTenant(app, 'Ajena');
      const tid = owner.user.tenantId!;
      const sales = await createUser(app, owner, 'MARKETING');
      const salesId = sales.user.id;

      await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(root))
        .send({ userId: other.user.id, mode: 'temp' })
        .expect(404);
      await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(root))
        .send({ userId: salesId, mode: 'temp' })
        .expect(400);

      const assigned = await http()
        .post(`/admin/tenants/${tid}/owner/assign`)
        .set(bearer(root))
        .send({ userId: salesId })
        .expect(201);
      expect((assigned.body as { user: Doc }).user.role).toBe('TENANT_ADMIN');
      const created = await http()
        .post(`/admin/tenants/${tid}/owner/assign`)
        .set(bearer(root))
        .send({
          name: 'Nuevo admin',
          email: `nuevo-admin-${Date.now()}@e2e.test`,
        })
        .expect(201);
      const { user, tempPassword } = created.body as {
        user: Doc;
        tempPassword: string;
      };
      const fresh = await login(app, user.email as string, tempPassword);
      expect(fresh.user.role).toBe('TENANT_ADMIN');

      // Sin administradores activos, la ficha no tiene principal.
      const lone = await registerTenant(app, 'Sin admin');
      // El último admin no se desactiva por la API (HU5): se fuerza en la base.
      await app
        .get<Model<User>>(getModelToken(User.name))
        .updateOne({ email: lone.email }, { $set: { isActive: false } });
      expect((await overview(lone.user.tenantId!)).owner).toBeNull();

      await http()
        .post(`/admin/tenants/${tid}/owner/assign`)
        .set(bearer(owner))
        .send({ userId: salesId })
        .expect(403);
      await http()
        .post(`/admin/tenants/${tid}/owner/recover`)
        .set(bearer(owner))
        .send({ userId: salesId, mode: 'temp' })
        .expect(403);
    });
  });

  describe('locales y eventos', () => {
    let owner: Session;
    let local: Doc;

    beforeAll(async () => {
      owner = await registerTenant(app, 'Eventos');
      local = (
        await http()
          .post('/locals')
          .set(bearer(owner))
          .send({ name: 'Sede Central', type: 'bar', tableCount: 12 })
          .expect(201)
      ).body as Doc;
    });

    it('edita y lista el local', async () => {
      await http()
        .patch(`/locals/${local._id}`)
        .set(bearer(owner))
        .send({ address: 'Av. Siempre Viva 123' })
        .expect(200);
      const list = await http().get('/locals').set(bearer(owner)).expect(200);
      const found = (list.body as Doc[]).find((l) => l._id === local._id);
      expect(found?.address).toBe('Av. Siempre Viva 123');
    });

    it('un evento en borrador no es público; publicado admite inscripciones', async () => {
      const event = (
        await http()
          .post('/events')
          .set(bearer(owner))
          .send({
            localId: local._id,
            title: 'Noche de Jazz',
            date: '2030-05-20',
            capacity: 50,
          })
          .expect(201)
      ).body as Doc & { slug: string };
      expect(event.slug).toBeTruthy();

      await http().get(`/public/events/${event.slug}`).expect(404);

      await http()
        .patch(`/events/${event._id}`)
        .set(bearer(owner))
        .send({ status: 'published' })
        .expect(200);

      const pub = await http().get(`/public/events/${event.slug}`).expect(200);
      expect(JSON.stringify(pub.body)).toContain('Noche de Jazz');

      await http()
        .post(`/public/events/${event._id}/register`)
        .send({ name: 'Invitada Uno', email: 'no-es-email' })
        .expect(400);
      await http()
        .post(`/public/events/${event._id}/register`)
        .send({ name: 'Invitada Uno', email: 'invitada@cliente.pe' })
        .expect(201);

      const regs = await http()
        .get(`/events/${event._id}/registrations`)
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(regs.body)).toContain('invitada@cliente.pe');
    });

    it('otra empresa no ve ni toca el evento', async () => {
      const event = (
        await http()
          .post('/events')
          .set(bearer(owner))
          .send({ localId: local._id, title: 'Privado', date: '2030-06-01' })
          .expect(201)
      ).body as Doc;
      const intruder = await registerTenant(app, 'Intrusa');

      const res = await http()
        .get(`/events/${event._id}`)
        .set(bearer(intruder));
      expect([403, 404]).toContain(res.status);
      const del = await http()
        .delete(`/events/${event._id}`)
        .set(bearer(intruder));
      expect([403, 404]).toContain(del.status);

      await http().get(`/events/${event._id}`).set(bearer(owner)).expect(200);
    });
  });

  describe('campañas', () => {
    it('guarda un borrador, calcula su audiencia y no envía nada por sí sola', async () => {
      const owner = await registerTenant(app, 'Campañas');
      for (const [name, email] of [
        ['Con Correo', 'con.correo@cliente.pe'],
        ['Sin Correo', undefined],
      ] as const)
        await http()
          .post('/customers')
          .set(bearer(owner))
          .send({ name, email, tags: ['promo'] })
          .expect(201);

      const preview = await http()
        .post('/campaigns/audience-preview')
        .set(bearer(owner))
        .send({ type: 'email', targeting: 'tags', recipientTags: ['promo'] })
        .expect(200);
      // Solo cuenta a quien tiene correo: el canal manda.
      expect(JSON.stringify(preview.body)).toMatch(/\b1\b/);

      const campaign = (
        await http()
          .post('/campaigns')
          .set(bearer(owner))
          .send({
            name: 'Promo de mayo',
            type: 'email',
            subject: 'Hola {{nombre}}',
            body: 'Tenemos una oferta',
            targeting: 'tags',
            recipientTags: ['promo'],
          })
          .expect(201)
      ).body as Doc;
      expect(campaign.status).toBe('draft');

      const list = await http()
        .get('/campaigns')
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(list.body)).toContain('Promo de mayo');

      await http()
        .post('/campaigns')
        .set(bearer(owner))
        .send({ name: 'Canal raro', type: 'paloma-mensajera' })
        .expect(400);

      await http()
        .delete(`/campaigns/${campaign._id}`)
        .set(bearer(owner))
        .expect(200);
    });
  });

  describe('entradas públicas', () => {
    it('los webhooks rechazan un verify token incorrecto', async () => {
      for (const path of [
        '/wa/webhook/cloud',
        '/ig/webhook',
        '/messenger/webhook',
      ]) {
        const res = await http().get(path).query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'token-falso',
          'hub.challenge': 'reto-123',
        });
        expect(res.text).not.toContain('reto-123');
      }
    });

    it('los webhooks aceptan basura sin caerse', async () => {
      for (const path of [
        '/wa/webhook/cloud',
        '/ig/webhook',
        '/messenger/webhook',
      ])
        await http().post(path).send({ cualquier: 'cosa' }).expect(200);
      // La app sigue viva después de procesarla en segundo plano.
      await http().get('/').expect(200);
    });

    it('un enlace de baja inventado no da de baja a nadie', async () => {
      const page = await http().get('/u/token-inventado').expect(200);
      expect(page.text).toContain('Enlace no válido');
      const done = await http().post('/u/token-inventado').expect(200);
      expect(done.text).toContain('Enlace no válido');
    });

    it('un Host desconocido no se toma por dominio corto: sigue siendo la API', async () => {
      const res = await http()
        .get('/customers')
        .set('Host', 'no-es-dominio-corto.test');
      expect(res.status).toBe(401);
    });
  });

  describe('agentes IA: destinatarios de la derivación', () => {
    it('guarda destinatarios de WhatsApp, correo y SMS ya normalizados', async () => {
      const owner = await registerTenant(app);
      const account = '64b7f0c2a1b2c3d4e5f60718';

      const created = await http()
        .post('/ai-agents')
        .set(bearer(owner))
        .send({
          name: 'Ventas',
          systemPrompt: 'Atiende con amabilidad.',
          handoffEnabled: true,
          handoffTargets: [
            { channel: 'whatsapp', to: '+51 999 888 777', accountId: account },
            { channel: 'email', to: ' Jefa@Empresa.pe ' },
            { channel: 'sms', to: '51911111111', accountId: account },
            { channel: 'email', to: 'no-es-correo' },
          ],
        })
        .expect(201);
      const agent = created.body as Doc;
      expect(agent.handoffTargets).toEqual([
        { channel: 'whatsapp', to: '51999888777', accountId: account },
        { channel: 'email', to: 'jefa@empresa.pe' },
        { channel: 'sms', to: '51911111111' },
      ]);

      // Un PATCH que no toca la derivación conserva la lista.
      const renamed = await http()
        .patch(`/ai-agents/${agent._id}`)
        .set(bearer(owner))
        .send({ name: 'Ventas 2' })
        .expect(200);
      expect((renamed.body as Doc).handoffTargets).toHaveLength(3);

      const replaced = await http()
        .patch(`/ai-agents/${agent._id}`)
        .set(bearer(owner))
        .send({ handoffTargets: [{ channel: 'sms', to: '51922222222' }] })
        .expect(200);
      expect((replaced.body as Doc).handoffTargets).toEqual([
        { channel: 'sms', to: '51922222222' },
      ]);
    });

    it('rechaza un canal que no existe', async () => {
      const owner = await registerTenant(app);
      await http()
        .post('/ai-agents')
        .set(bearer(owner))
        .send({
          name: 'Ventas',
          systemPrompt: 'x',
          handoffTargets: [{ channel: 'telegram', to: '51999888777' }],
        })
        .expect(400);
    });
  });
});
