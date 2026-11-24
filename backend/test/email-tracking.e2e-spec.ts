import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { ResendConfig } from '../src/resend/resend-config.schema';
import { Campaign } from '../src/campaigns/campaign.schema';
import { CampaignRecipient } from '../src/campaigns/campaign-recipient.schema';
import { CampaignSenderService } from '../src/campaigns/campaign-sender.service';
import { Customer } from '../src/customers/customer.schema';
import { ContactActivity } from '../src/customers/contact-activity.schema';
import { SuppressionEntry } from '../src/suppression/suppression-entry.schema';
import { Automation } from '../src/automations/automation.schema';
import { signSvix } from '../src/shared/svix-signature';
import { bearer, createApp, registerTenant, type Session } from './support/app';

const SECRET = `whsec_${Buffer.from('secreto-de-webhook-e2e-32-bytes!').toString('base64')}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Aperturas y clics de email (HU61, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let tid: Types.ObjectId;
  let recipients: Model<CampaignRecipient>;
  let activities: Model<ContactActivity>;
  let suppression: Model<SuppressionEntry>;
  let customers: Model<Customer>;
  let campaignId: string;
  let seq = 0;
  const http = () => request(app.getHttpServer());

  /** Envía un evento firmado como lo haría Resend (Svix). */
  const send = (
    type: string,
    data: Record<string, unknown>,
    opts: { id?: string; secret?: string; tenant?: string } = {},
  ) => {
    const body = JSON.stringify({
      type,
      created_at: new Date().toISOString(),
      data,
    });
    const id = opts.id ?? `msg_${++seq}`;
    const ts = String(Math.floor(Date.now() / 1000));
    return http()
      .post(`/resend/webhook/${opts.tenant ?? String(tid)}`)
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', ts)
      .set('svix-signature', signSvix(opts.secret ?? SECRET, id, ts, body))
      .send(body);
  };

  const addRecipient = async (email: string, providerId: string) => {
    const c = await customers.create({
      tenantId: tid,
      name: `Cliente ${email}`,
      email,
      tags: [],
      source: 'manual',
    });
    await recipients.create({
      tenantId: tid,
      campaignId: new Types.ObjectId(campaignId),
      customerId: c._id,
      name: c.name,
      to: email,
      status: 'sent',
      providerId,
      sentAt: new Date(),
    });
    return c;
  };

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Marketing');
    tid = new Types.ObjectId(owner.user.tenantId as string);
    recipients = app.get(getModelToken(CampaignRecipient.name));
    activities = app.get(getModelToken(ContactActivity.name));
    suppression = app.get(getModelToken(SuppressionEntry.name));
    customers = app.get(getModelToken(Customer.name));
    const configs: Model<ResendConfig> = app.get(
      getModelToken(ResendConfig.name),
    );
    await configs.create({
      tenantId: tid,
      enabled: false,
      fromEmail: 'hola@marca.pe',
    });
    await http()
      .put('/resend/webhook-secret')
      .set(bearer(owner))
      .send({ secret: 'malo' })
      .expect(400);
    const cfg = (
      await http()
        .put('/resend/webhook-secret')
        .set(bearer(owner))
        .send({ secret: SECRET })
        .expect(200)
    ).body as { hasWebhookSecret: boolean; webhookUrl: string };
    expect(cfg.hasWebhookSecret).toBe(true);
    expect(cfg.webhookUrl).toContain(`/resend/webhook/${String(tid)}`);
    const campaigns: Model<Campaign> = app.get(getModelToken(Campaign.name));
    campaignId = String(
      (
        await campaigns.create({
          tenantId: tid,
          name: 'Black Friday',
          type: 'email',
          status: 'sent',
        })
      )._id,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1: un email.clicked firmado marca el clic y la URL, sin contar dos veces el mismo evento', async () => {
    const c = await addRecipient('ana@x.pe', 'em_1');
    const automations: Model<Automation> = app.get(
      getModelToken(Automation.name),
    );
    await automations.create({
      tenantId: tid,
      name: 'Clic → etiqueta',
      active: true,
      trigger: { type: 'email_clicked', campaignId },
      steps: [{ id: 's1', type: 'tag', tag: 'interesado' }],
      exitOnReply: false,
    });

    const res = await send(
      'email.clicked',
      {
        email_id: 'em_1',
        to: ['ana@x.pe'],
        click: { link: 'https://marca.pe/oferta' },
      },
      { id: 'msg_click' },
    ).expect(200);
    expect((res.body as { result: string }).result).toBe('clicked');
    await send(
      'email.clicked',
      { email_id: 'em_1', click: { link: 'https://marca.pe/oferta' } },
      { id: 'msg_click' },
    ).expect(200);
    const r = await recipients.findOne({ providerId: 'em_1' }).lean().exec();
    expect(r).toMatchObject({
      clicks: 1,
      lastClickUrl: 'https://marca.pe/oferta',
    });
    expect(r?.clickedAt).toBeTruthy();
    expect(r?.openedAt).toBeTruthy(); // un clic implica apertura
    expect(
      await activities.exists({ customerId: c._id, type: 'email_click' }),
    ).toBeTruthy();

    let tags: string[] = [];
    for (let i = 0; i < 60 && !tags.includes('interesado'); i++) {
      await wait(40);
      tags = (await customers.findById(c._id).lean().exec())?.tags ?? [];
    }
    expect(tags).toContain('interesado');

    const m = (
      await http()
        .get(`/campaigns/${campaignId}/email-metrics`)
        .set(bearer(owner))
        .expect(200)
    ).body as {
      clicked: number;
      opened: number;
      clickers: { to: string }[];
      rates: { click: number };
    };
    expect(m.clicked).toBe(1);
    expect(m.opened).toBe(1);
    expect(m.clickers.map((x) => x.to)).toEqual(['ana@x.pe']);
  });

  it('C2: un rebote duro va a la lista de no contactar; uno temporal no', async () => {
    await addRecipient('rebote@x.pe', 'em_2');
    await addRecipient('lleno@x.pe', 'em_3');
    const hard = await send('email.bounced', {
      email_id: 'em_2',
      to: ['rebote@x.pe'],
      bounce: { type: 'Permanent', message: 'No existe' },
    }).expect(200);
    expect((hard.body as { result: string }).result).toBe('bounced_suppressed');
    await send('email.bounced', {
      email_id: 'em_3',
      to: ['lleno@x.pe'],
      bounce: { type: 'Transient', message: 'Buzón lleno' },
    }).expect(200);
    expect(
      await suppression
        .findOne({ tenantId: tid, email: 'rebote@x.pe' })
        .lean()
        .exec(),
    ).toMatchObject({ source: 'bounce' });
    expect(
      await suppression.exists({ tenantId: tid, email: 'lleno@x.pe' }),
    ).toBeNull();
    expect(
      (await recipients.findOne({ providerId: 'em_3' }).lean().exec())
        ?.bounceType,
    ).toBe('soft');

    // Queja → no contactar; sin destinatario conocido también.
    await send('email.complained', {
      email_id: 'desconocido',
      to: ['spam@x.pe'],
    }).expect(200);
    expect(
      await suppression
        .findOne({ tenantId: tid, email: 'spam@x.pe' })
        .lean()
        .exec(),
    ).toMatchObject({ source: 'complaint' });
  });

  it('C3: firma inválida o empresa sin secreto → 401; aperturas cuentan veces y la baja entra en las métricas', async () => {
    await addRecipient('luis@x.pe', 'em_4');
    await send(
      'email.opened',
      { email_id: 'em_4' },
      {
        secret: `whsec_${Buffer.from('otra-clave-cualquiera!!').toString('base64')}`,
      },
    ).expect(401);
    const other = await registerTenant(app, 'Sin secreto');
    await send(
      'email.opened',
      { email_id: 'em_4' },
      { tenant: other.user.tenantId as string },
    ).expect(401);
    expect(
      (await recipients.findOne({ providerId: 'em_4' }).lean().exec())?.opens,
    ).toBe(0);

    await send('email.opened', { email_id: 'em_4' }).expect(200);
    await send('email.opened', { email_id: 'em_4' }).expect(200);
    await send('email.delivered', { email_id: 'em_4' }).expect(200);
    const r = await recipients.findOne({ providerId: 'em_4' }).lean().exec();
    expect(r?.opens).toBe(2);
    expect(r?.deliveredAt).toBeTruthy();
    expect(
      await activities.countDocuments({
        customerId: r?.customerId,
        type: 'email_open',
      }),
    ).toBe(1);

    const token = app
      .get(CampaignSenderService)
      .unsubscribeToken(String(tid), 'luis@x.pe');
    await http().post(`/u/${token}`).expect(200);
    const m = (
      await http()
        .get(`/campaigns/${campaignId}/email-metrics`)
        .set(bearer(owner))
        .expect(200)
    ).body as { unsubscribed: number; bounced: number; sent: number };
    expect(m.unsubscribed).toBe(1);
    expect(m.bounced).toBe(2);
    expect(m.sent).toBe(4);
    await http()
      .get(`/campaigns/${campaignId}/email-metrics`)
      .set(bearer(other))
      .expect(404);
  });
});
