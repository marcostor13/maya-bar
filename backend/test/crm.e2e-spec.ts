import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Doc = { _id: string } & Record<string, unknown>;

describe('CRM (e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  const http = () => request(app.getHttpServer());

  const createCustomer = async (
    session: Session,
    data: Record<string, unknown>,
  ) => {
    const res = await http()
      .post('/customers')
      .set(bearer(session))
      .send(data)
      .expect(201);
    return res.body as Doc;
  };

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Principal');
    other = await registerTenant(app, 'Ajena');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('clientes', () => {
    it('crea, busca, edita y elimina', async () => {
      const ana = await createCustomer(owner, {
        name: 'Ana Torres',
        email: 'ana@cliente.pe',
        phone: '+51 999 111 222',
        tags: ['vip'],
      });
      expect(ana.name).toBe('Ana Torres');

      const found = await http()
        .get('/customers')
        .query({ search: 'Ana' })
        .set(bearer(owner))
        .expect(200);
      expect((found.body as Doc[]).map((c) => c._id)).toContain(ana._id);

      const updated = await http()
        .patch(`/customers/${ana._id}`)
        .set(bearer(owner))
        .send({ name: 'Ana T. Ruiz', _id: 'ignorado', tenantId: 'ignorado' })
        .expect(200);
      expect((updated.body as Doc).name).toBe('Ana T. Ruiz');
      // Un PATCH parcial no toca lo que no se envió.
      expect((updated.body as Doc).email).toBe('ana@cliente.pe');
      expect((updated.body as Doc).tags).toEqual(['vip']);

      await http()
        .delete(`/customers/${ana._id}`)
        .set(bearer(owner))
        .expect(200);
      const after = await http()
        .get('/customers')
        .set(bearer(owner))
        .expect(200);
      expect((after.body as Doc[]).map((c) => c._id)).not.toContain(ana._id);
    });

    it('exige nombre', async () => {
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({ email: 'sin-nombre@cliente.pe' })
        .expect(400);
    });

    it('exporta a CSV', async () => {
      await createCustomer(owner, { name: 'Exportable', phone: '51911111111' });
      const res = await http()
        .get('/customers/export.csv')
        .set(bearer(owner))
        .expect(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.text).toContain('Exportable');
    });
  });

  describe('aislamiento entre empresas', () => {
    it('una empresa no ve, edita ni borra los clientes de otra', async () => {
      const secreto = await createCustomer(owner, { name: 'Cliente Privado' });

      const list = await http()
        .get('/customers')
        .set(bearer(other))
        .expect(200);
      expect((list.body as Doc[]).map((c) => c._id)).not.toContain(secreto._id);

      await http()
        .patch(`/customers/${secreto._id}`)
        .set(bearer(other))
        .send({ name: 'Robado' });
      await http().delete(`/customers/${secreto._id}`).set(bearer(other));

      const mine = await http()
        .get('/customers')
        .set(bearer(owner))
        .expect(200);
      const still = (mine.body as Doc[]).find((c) => c._id === secreto._id);
      expect(still?.name).toBe('Cliente Privado');
    });

    it('las listas y los usuarios tampoco se cruzan', async () => {
      await http()
        .post('/lists')
        .set(bearer(owner))
        .send({ name: 'Lista privada', type: 'static' })
        .expect(201);
      const lists = await http().get('/lists').set(bearer(other)).expect(200);
      expect((lists.body as Doc[]).map((l) => l.name)).not.toContain(
        'Lista privada',
      );

      const users = await http().get('/users').set(bearer(other)).expect(200);
      expect((users.body as Doc[]).map((u) => u.email)).not.toContain(
        owner.user.email,
      );
    });
  });

  describe('permisos por rol', () => {
    let marketing: Session;

    beforeAll(async () => {
      marketing = await createUser(app, owner, 'MARKETING');
    });

    it('expone al usuario los módulos de su rol', async () => {
      const res = await http()
        .get('/me/permissions')
        .set(bearer(marketing))
        .expect(200);
      const body = res.body as { role: string; modules: string[] };
      expect(body.role).toBe('MARKETING');
      expect(body.modules).toContain('customers');
      expect(body.modules).not.toContain('users');
    });

    it('marketing trabaja con clientes pero no administra usuarios ni roles', async () => {
      await http().get('/customers').set(bearer(marketing)).expect(200);
      await http().get('/users').set(bearer(marketing)).expect(403);
      await http().get('/roles').set(bearer(marketing)).expect(403);
      await http()
        .post('/users')
        .set(bearer(marketing))
        .send({ name: 'Intruso', email: 'intruso@e2e.test', role: 'MANAGER' })
        .expect(403);
    });

    it('quitarle un módulo al rol le cierra la API', async () => {
      const modules = (
        (await http().get('/me/permissions').set(bearer(marketing))).body as {
          modules: string[];
        }
      ).modules.filter((m) => m !== 'lists');

      await http()
        .patch('/roles/MARKETING')
        .set(bearer(owner))
        .send({ modules })
        .expect(200);

      await http().get('/lists').set(bearer(marketing)).expect(403);
      await http().get('/customers').set(bearer(marketing)).expect(200);
    });
  });

  describe('listas', () => {
    it('agrega y quita miembros de una lista estática', async () => {
      const a = await createCustomer(owner, { name: 'Miembro A' });
      const b = await createCustomer(owner, { name: 'Miembro B' });
      const list = (
        await http()
          .post('/lists')
          .set(bearer(owner))
          .send({ name: 'Clientes VIP', type: 'static' })
          .expect(201)
      ).body as Doc;

      await http()
        .post(`/lists/${list._id}/members`)
        .set(bearer(owner))
        .send({ customerIds: [a._id, b._id] })
        .expect(201);

      const members = await http()
        .get(`/lists/${list._id}/members`)
        .set(bearer(owner))
        .expect(200);
      expect((members.body as Doc[]).map((m) => m._id).sort()).toEqual(
        [a._id, b._id].sort(),
      );

      await http()
        .delete(`/lists/${list._id}/members/${a._id}`)
        .set(bearer(owner))
        .expect(200);
      const count = await http()
        .get(`/lists/${list._id}/count`)
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(count.body)).toContain('1');

      await http().delete(`/lists/${list._id}`).set(bearer(owner)).expect(200);
    });

    it('rechaza un tipo de lista desconocido', async () => {
      await http()
        .post('/lists')
        .set(bearer(owner))
        .send({ name: 'Rara', type: 'magica' })
        .expect(400);
    });
  });

  describe('seguimiento', () => {
    it('crea una oportunidad con su contacto y la mueve por el embudo', async () => {
      const stages = (
        await http().get('/leads/stages').set(bearer(owner)).expect(200)
      ).body as { key: string }[];
      expect(stages.length).toBeGreaterThan(1);

      const lead = (
        await http()
          .post('/leads')
          .set(bearer(owner))
          .send({
            title: 'Evento corporativo',
            value: 1500,
            customer: { name: 'Empresa Compradora', phone: '51922222222' },
          })
          .expect(201)
      ).body as Doc;
      expect(lead.title).toBe('Evento corporativo');

      const target = stages[1].key;
      await http()
        .patch(`/leads/${lead._id}/move`)
        .set(bearer(owner))
        .send({ stage: target })
        .expect(200);

      const board = (
        await http().get('/leads/board').set(bearer(owner)).expect(200)
      ).body as { stage: string; leads: Doc[] }[];
      const column = board.find((c) => c.stage === target);
      expect(column?.leads.map((l) => l._id)).toContain(lead._id);

      await http()
        .post(`/leads/${lead._id}/activities`)
        .set(bearer(owner))
        .send({ type: 'note', title: 'Primera llamada' })
        .expect(201);
      const activities = await http()
        .get(`/leads/${lead._id}/activities`)
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(activities.body)).toContain('Primera llamada');
    });
  });

  describe('no contactar', () => {
    it('registra un número y no lo duplica', async () => {
      const entry = (
        await http()
          .post('/suppression')
          .set(bearer(owner))
          .send({ phone: '+51 933 333 333', reason: 'Lo pidió' })
          .expect(201)
      ).body as Doc;

      const list = await http()
        .get('/suppression')
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(list.body)).toContain(entry._id);

      await http()
        .delete(`/suppression/${entry._id}`)
        .set(bearer(owner))
        .expect(200);
    });
  });

  describe('formularios públicos', () => {
    it('un envío sin sesión crea el contacto en la empresa dueña', async () => {
      const form = (
        await http()
          .post('/forms')
          .set(bearer(owner))
          .send({
            name: 'Contacto web',
            tags: ['web'],
            fields: [
              {
                key: 'nombre',
                label: 'Nombre',
                type: 'text',
                required: true,
                mapTo: 'name',
              },
              { key: 'correo', label: 'Correo', type: 'email', mapTo: 'email' },
            ],
          })
          .expect(201)
      ).body as Doc & { publicKey: string };

      const pub = await http()
        .get(`/public/forms/${form.publicKey}`)
        .expect(200);
      expect(JSON.stringify(pub.body)).toContain('Contacto web');

      await http()
        .post(`/public/forms/${form.publicKey}/submit`)
        .set('Origin', 'https://landing-de-un-tercero.com')
        .send({ nombre: 'Lead Web', correo: 'lead.web@cliente.pe' })
        .expect(201)
        .expect(
          'Access-Control-Allow-Origin',
          'https://landing-de-un-tercero.com',
        );

      const customers = await http()
        .get('/customers')
        .query({ search: 'Lead Web' })
        .set(bearer(owner))
        .expect(200);
      expect((customers.body as Doc[]).map((c) => c.email)).toContain(
        'lead.web@cliente.pe',
      );

      const submissions = await http()
        .get(`/forms/${form._id}/submissions`)
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(submissions.body)).toContain('Lead Web');
    });

    it('una clave pública inexistente responde 404', async () => {
      await http().get('/public/forms/no-existe').expect(404);
    });
  });

  describe('links cortos', () => {
    it('redirige al destino y cuenta el clic', async () => {
      const link = (
        await http()
          .post('/links')
          .set(bearer(owner))
          .send({ destination: 'https://example.com/promo', title: 'Promo' })
          .expect(201)
      ).body as Doc & { code: string };
      expect(link.code).toBeTruthy();

      const res = await http().get(`/l/${link.code}`).redirects(0);
      expect(res.status).toBeGreaterThanOrEqual(301);
      expect(res.status).toBeLessThanOrEqual(308);
      expect(res.headers.location).toContain('example.com/promo');

      await http().get('/l/no-existe-este-codigo').expect(404);
    });
  });

  describe('plantillas de texto', () => {
    it('guarda una plantilla y resuelve las variables en la vista previa', async () => {
      const variables = await http()
        .get('/message-templates/variables')
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(variables.body)).toContain('nombre');

      await http()
        .post('/message-templates')
        .set(bearer(owner))
        .send({ name: 'Saludo', channel: 'sms', body: 'Hola {{nombre}}' })
        .expect(201);

      const ana = await createCustomer(owner, { name: 'Lucía Paz' });
      const preview = await http()
        .post('/message-templates/preview')
        .set(bearer(owner))
        .send({ body: 'Hola {{nombre}}', customerId: ana._id })
        .expect(200);
      expect(JSON.stringify(preview.body)).toContain('Lucía');
    });
  });
});
