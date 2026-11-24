import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Conversation } from '../src/conversations/conversation.schema';
import { Message } from '../src/conversations/message.schema';
import { MessageEvents } from '../src/conversations/message-events';
import { WhatsAppAccount } from '../src/whatsapp-accounts/whatsapp-account.schema';
import { WaTemplate } from '../src/whatsapp-templates/wa-template.schema';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { MailService } from '../src/mail/mail.service';
import { SuppressionService } from '../src/suppression/suppression.service';
import { AutomationEngineService } from '../src/automations/automation-engine.service';
import { AutomationRun } from '../src/automations/automation.schema';
import { Customer } from '../src/customers/customer.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

const HOUR = 3600_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Automatizaciones y secuencias (HU58, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let engine: AutomationEngineService;
  let runs: Model<AutomationRun>;
  let graphPost: jest.SpyInstance;
  let mailSpy: jest.SpyInstance;
  let fakeNow = new Date();
  let seq = 0;
  const http = () => request(app.getHttpServer());
  const tenant = () => new Types.ObjectId(owner.user.tenantId as string);

  const metaSends = () =>
    (graphPost.mock.calls as [string, { json: Record<string, unknown> }][])
      .filter(([path]) => String(path).endsWith('/messages'))
      .map(([, opts]) => opts.json);

  /** Espera a que el primer paso (que sale sin esperar la pasada) termine. */
  const runOf = async (
    customerId: string,
    automationId: string,
    settledAt = 0,
  ) => {
    for (let i = 0; i < 100; i++) {
      const r = await runs
        .findOne({
          customerId: new Types.ObjectId(customerId),
          automationId: new Types.ObjectId(automationId),
        })
        .lean()
        .exec();
      if (r && !r.lockedUntil && r.log.length > settledAt) return r;
      await wait(40);
    }
    return runs
      .findOne({
        customerId: new Types.ObjectId(customerId),
        automationId: new Types.ObjectId(automationId),
      })
      .lean()
      .exec();
  };

  const makeForm = async () => {
    const f = (
      await http()
        .post('/forms')
        .set(bearer(owner))
        .send({
          name: `Contacto ${++seq}`,
          fields: [
            {
              key: 'name',
              label: 'Nombre',
              type: 'text',
              required: true,
              mapTo: 'name',
            },
            {
              key: 'email',
              label: 'Email',
              type: 'email',
              required: false,
              mapTo: 'email',
            },
            {
              key: 'phone',
              label: 'Teléfono',
              type: 'tel',
              required: false,
              mapTo: 'phone',
            },
          ],
        })
        .expect(201)
    ).body as { _id: string; publicKey: string };
    return f;
  };

  const submit = async (publicKey: string, phone: string) =>
    (
      await http()
        .post(`/public/forms/${publicKey}/submit`)
        .send({ name: 'Lucía Prueba', email: `lucia${phone}@e2e.test`, phone })
        .expect(201)
    ).body as { customerId: string };

  const sequence = async (formId: string) =>
    (
      await http()
        .post('/automations')
        .set(bearer(owner))
        .send({
          name: 'Seguimiento formulario',
          active: true,
          exitOnReply: true,
          trigger: { type: 'form_submitted', formId },
          steps: [
            {
              type: 'whatsapp',
              text: 'Hola {nombre}',
              template: {
                name: 'bienvenida',
                language: 'es',
                variables: ['{primer_nombre}'],
              },
            },
            { type: 'wait', minutes: 24 * 60 },
            {
              type: 'email',
              subject: 'Hola {nombre}',
              text: 'Seguimos atentos, {primer_nombre}.',
            },
          ],
        })
        .expect(201)
    ).body as { _id: string };

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Automatiza');
    engine = app.get(AutomationEngineService);
    engine.clock = () => fakeNow;
    runs = app.get<Model<AutomationRun>>(getModelToken(AutomationRun.name));
    const accounts = app.get<Model<WhatsAppAccount>>(
      getModelToken(WhatsAppAccount.name),
    );
    const account = await accounts.create({
      tenantId: tenant(),
      label: 'Ventas',
      provider: 'cloudapi',
      waPhoneNumberId: `PNIDauto${Date.now()}`,
      waAccessToken: 'token-de-prueba',
      active: true,
    });
    await app.get<Model<WaTemplate>>(getModelToken(WaTemplate.name)).create({
      tenantId: tenant(),
      accountId: account._id,
      metaId: 'meta-bienvenida',
      name: 'bienvenida',
      category: 'MARKETING',
      language: 'es',
      status: 'APPROVED',
      body: 'Hola {{1}}, gracias por escribirnos.',
    });
    let n = 0;
    graphPost = jest
      .spyOn(app.get(MetaGraphClient), 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(
          String(path).endsWith('/messages')
            ? { messages: [{ id: `wamid.auto${++n}` }] }
            : { success: true },
        ),
      );
    mailSpy = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mail-id');
  });

  beforeEach(() => {
    graphPost.mockClear();
    mailSpy.mockClear();
    fakeNow = new Date();
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1: el formulario inscribe; plantilla al instante y email a las 24 h (reloj simulado)', async () => {
    const form = await makeForm();
    const auto = await sequence(form._id);
    const { customerId } = await submit(form.publicKey, '51987650001');

    let run = (await runOf(customerId, auto._id))!;
    expect(run.status).toBe('active');
    expect(run.stepIndex).toBe(2);
    const sent = metaSends();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'template', to: '51987650001' });
    expect(JSON.stringify(sent[0])).toContain('Lucía');
    expect(mailSpy).not.toHaveBeenCalled();

    // Un segundo envío del mismo formulario no duplica la ejecución activa.
    await http().post(`/public/forms/${form.publicKey}/submit`).send({
      name: 'Lucía Prueba',
      email: 'otra@e2e.test',
      phone: '51987650001',
    });
    expect(
      await runs.countDocuments({
        automationId: new Types.ObjectId(auto._id),
        status: 'active',
      }),
    ).toBe(1);

    // 23 h después aún no toca.
    fakeNow = new Date(Date.now() + 23 * HOUR);
    await engine.tick();
    expect(mailSpy).not.toHaveBeenCalled();

    fakeNow = new Date(Date.now() + 24 * HOUR + 60_000);
    await engine.tick();
    expect(
      (mailSpy.mock.calls as [Record<string, unknown>][])[0][0],
    ).toMatchObject({
      to: 'lucia51987650001@e2e.test',
      subject: 'Hola Lucía Prueba',
    });
    run = (await runs.findById(run._id).lean().exec())!;
    expect(run.status).toBe('completed');

    const list = (
      await http().get('/automations').set(bearer(owner)).expect(200)
    ).body as { _id: string; stats: { entered: number; completed: number } }[];
    expect(list.find((a) => a._id === auto._id)?.stats).toMatchObject({
      entered: 1,
      completed: 1,
    });
  });

  it('C2: si responde antes del paso 2, sale y no recibe el email', async () => {
    const form = await makeForm();
    const auto = await sequence(form._id);
    const { customerId } = await submit(form.publicKey, '51987650002');
    const run = (await runOf(customerId, auto._id))!;
    expect(metaSends()).toHaveLength(1);

    const conv = (await app
      .get<Model<Conversation>>(getModelToken(Conversation.name))
      .findOne({ contact: '51987650002' })
      .lean()
      .exec())!;
    expect(String(conv.customerId)).toBe(customerId);
    const msg = await app
      .get<Model<Message>>(getModelToken(Message.name))
      .create({
        tenantId: tenant(),
        conversationId: conv._id,
        direction: 'in',
        author: 'customer',
        type: 'text',
        text: 'Sí, me interesa',
        status: 'sent',
        at: new Date(),
      });
    app.get(MessageEvents).publish('created', String(tenant()), msg);
    await wait(300);

    fakeNow = new Date(Date.now() + 25 * HOUR);
    await engine.tick();
    expect(mailSpy).not.toHaveBeenCalled();
    const after = (await runs.findById(run._id).lean().exec())!;
    expect(after).toMatchObject({
      status: 'exited',
      exitReason: 'replied',
      replied: true,
    });
  });

  it('C3: un contacto en "no contactar" nunca recibe pasos de envío', async () => {
    await app.get(SuppressionService).add(String(tenant()), {
      phone: '51987650003',
      email: 'lucia51987650003@e2e.test',
      reason: 'Pidió no ser contactado',
    });
    const form = await makeForm();
    const auto = await sequence(form._id);
    const { customerId } = await submit(form.publicKey, '51987650003');
    const run = (await runOf(customerId, auto._id))!;
    fakeNow = new Date(Date.now() + 25 * HOUR);
    await engine.tick();
    expect(metaSends()).toHaveLength(0);
    expect(mailSpy).not.toHaveBeenCalled();
    expect(run).toMatchObject({ status: 'exited', exitReason: 'suppressed' });
  });

  it('etiqueta: entra al añadirla, sale si se la quitan; horario de envío pospone', async () => {
    const auto = (
      await http()
        .post('/automations')
        .set(bearer(owner))
        .send({
          name: 'VIP',
          active: true,
          trigger: { type: 'tag_added', tag: 'vip' },
          sendWindow: { from: 9, to: 18 },
          steps: [
            { type: 'tag', tag: 'en-secuencia' },
            { type: 'wait', minutes: 60 },
            { type: 'sms', text: 'Hola' },
          ],
        })
        .expect(201)
    ).body as { _id: string };
    const c = (
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({ name: 'Vera', phone: '51987650004', tags: ['vip'] })
        .expect(201)
    ).body as { _id: string };
    let run = (await runOf(c._id, auto._id))!;
    expect(run.stepIndex).toBe(2);
    const customers = app.get<Model<Customer>>(getModelToken(Customer.name));
    expect((await customers.findById(c._id).lean().exec())!.tags).toContain(
      'en-secuencia',
    );

    await customers.updateOne({ _id: c._id }, { $pull: { tags: 'vip' } });
    fakeNow = new Date(Date.now() + 2 * HOUR);
    await engine.tick();
    run = (await runs.findById(run._id).lean().exec())!;
    expect(run).toMatchObject({ status: 'exited', exitReason: 'left_rule' });
  });

  it('valida pasos, crea desde plantilla y restringe por rol', async () => {
    await http()
      .post('/automations')
      .set(bearer(owner))
      .send({
        name: 'Mal',
        trigger: { type: 'contact_created' },
        steps: [{ type: 'email', subject: '' }],
      })
      .expect(400);
    await http()
      .post('/automations')
      .set(bearer(owner))
      .send({
        name: 'Mal',
        trigger: { type: 'contact_created' },
        steps: [{ type: 'webhook', url: 'http://x.test' }],
      })
      .expect(400);
    const tpls = (
      await http().get('/automations/templates').set(bearer(owner)).expect(200)
    ).body as { key: string }[];
    expect(tpls.map((t) => t.key)).toEqual([
      'form-followup',
      'event-reminder',
      'reactivation-30',
    ]);
    const a = (
      await http()
        .post('/automations/templates/event-reminder')
        .set(bearer(owner))
        .expect(201)
    ).body as { _id: string; active: boolean };
    expect(a.active).toBe(false);
    await http()
      .patch(`/automations/${a._id}/active`)
      .set(bearer(owner))
      .send({ active: true })
      .expect(200);
    const other = await registerTenant(app, 'Ajena');
    await http().get(`/automations/${a._id}`).set(bearer(other)).expect(404);
    const agent = await createUser(app, owner, 'IMPULSADOR');
    await http().get('/automations').set(bearer(agent)).expect(403);
  });
});
