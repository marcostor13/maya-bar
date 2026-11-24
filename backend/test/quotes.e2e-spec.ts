import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { execFileSync } from 'child_process';
import { bearer, createApp, registerTenant, type Session } from './support/app';
import { Lead } from '../src/leads/lead.schema';
import { LeadActivity } from '../src/leads/lead-activity.schema';
import { MailService } from '../src/mail/mail.service';
import { MercadoPagoClient } from '../src/billing/mercadopago/mercadopago.client';
import { EventTicketsService } from '../src/event-tickets/event-tickets.service';

type QuoteRes = {
  _id: string;
  number: string;
  publicToken: string;
  status: string;
  subtotal: number;
  igv: number;
  total: number;
};

const ITEMS = [
  {
    name: 'Implementación CRM',
    quantity: 1,
    unitPrice: 1000,
    discountPct: 10,
    taxIncluded: false,
  },
  { name: 'Licencia mensual', quantity: 3, unitPrice: 9.99, taxIncluded: true },
];

describe('Cotizaciones desde la oportunidad (HU68, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let leads: Model<Lead>;
  let sendHtml: jest.SpyInstance;
  let pref: jest.SpyInstance;
  let tickets: EventTicketsService;
  const http = () => request(app.getHttpServer());

  const newLead = async (title: string) => {
    const res = await http()
      .post('/leads')
      .set(bearer(owner))
      .send({
        title,
        customer: { name: 'Lucía Pérez', email: 'lucia@cliente.pe' },
      })
      .expect(201);
    return (res.body as { _id: string })._id;
  };
  const newQuote = async (
    leadId: string,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await http()
        .post('/quotes')
        .set(bearer(owner))
        .send({ leadId, items: ITEMS, ...extra })
        .expect(201)
    ).body as QuoteRes;
  const leadOf = (id: string) => leads.findById(id).lean<Lead>().exec();

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Consultora Andina');
    other = await registerTenant(app, 'Otra Empresa');
    leads = app.get<Model<Lead>>(getModelToken(Lead.name));
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    tickets = app.get(EventTicketsService);
    jest.spyOn(tickets, 'sellerToken').mockResolvedValue('APP_USR-SELLER');
    jest
      .spyOn(tickets, 'status')
      .mockResolvedValue({ connected: true } as Awaited<
        ReturnType<EventTicketsService['status']>
      >);
    pref = jest
      .spyOn(app.get(MercadoPagoClient), 'createPreferenceFor')
      .mockResolvedValue({
        id: 'pref-q',
        init_point:
          'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=q',
      });
  });
  afterAll(() => app.close());

  it('C1: calcula subtotal, IGV y total, numera por empresa y el PDF los muestra', async () => {
    const leadId = await newLead('CRM para Andina');
    const q = await newQuote(leadId, { notes: 'Pago 50% adelantado' });
    expect(q).toMatchObject({
      number: 'COT-0001',
      status: 'draft',
      subtotal: 925.4,
      igv: 166.57,
      total: 1091.97,
    });
    expect((await newQuote(leadId)).number).toBe('COT-0002');

    // Otra empresa no la ve ni puede cotizar sobre esa oportunidad.
    await http().get(`/quotes/${q._id}`).set(bearer(other)).expect(404);
    await http()
      .post('/quotes')
      .set(bearer(other))
      .send({ leadId, items: ITEMS })
      .expect(404);

    const pdf = await http()
      .get(`/public/quotes/${q.publicToken}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    // pdf.js no corre dentro de Jest: se extrae el texto en un Node aparte.
    const text = execFileSync(
      process.execPath,
      [
        '-e',
        "const c=[];process.stdin.on('data',d=>c.push(d)).on('end',async()=>{const{PDFParse}=await import('pdf-parse');const r=await new PDFParse({data:new Uint8Array(Buffer.concat(c))}).getText();process.stdout.write(r.text)})",
      ],
      { input: pdf.body as Buffer, encoding: 'utf8' },
    );
    for (const s of [
      'COT-0001',
      'Consultora Andina',
      'Lucía Pérez',
      'Implementación CRM',
      'S/ 925.40',
      'IGV (18%)',
      'S/ 166.57',
      'S/ 1,091.97',
      'Pago 50% adelantado',
    ])
      expect(text).toContain(s);
  });

  it('envía por email con el link, la marca vista al abrirla y C2: aceptar mueve la oportunidad a Ganada', async () => {
    const leadId = await newLead('Renovación anual');
    const q = await newQuote(leadId);
    await http()
      .post(`/quotes/${q._id}/send`)
      .set(bearer(owner))
      .send({ channel: 'email' })
      .expect(201);
    const mail = (sendHtml.mock.calls.at(-1) as unknown[])[0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(mail.to).toBe('lucia@cliente.pe');
    expect(mail.subject).toContain(q.number);
    expect(mail.html).toContain(`/q/${q.publicToken}`);
    // Sin cuenta de WhatsApp no se puede mandar por ahí.
    await http()
      .post(`/quotes/${q._id}/send`)
      .set(bearer(owner))
      .send({ channel: 'whatsapp' })
      .expect(400);

    const view = await http()
      .get(`/public/quotes/${q.publicToken}`)
      .expect(200);
    expect(view.body).toMatchObject({
      number: q.number,
      status: 'viewed',
      total: 1091.97,
    });
    expect((view.body as { company: { name: string } }).company.name).toContain(
      'Consultora Andina',
    );

    await http().post(`/public/quotes/${q.publicToken}/accept`).expect(201);
    const lead = await leadOf(leadId);
    expect(lead).toMatchObject({ status: 'won', value: 1091.97 });
    const acts = await app
      .get<Model<LeadActivity>>(getModelToken(LeadActivity.name))
      .find({ leadId: new Types.ObjectId(leadId) })
      .lean()
      .exec();
    expect(acts.map((a) => a.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('enviada por email'),
        expect.stringContaining('aceptada por el cliente'),
      ]),
    );
    // Ya cerrada: ni se acepta de nuevo ni se edita.
    await http().post(`/public/quotes/${q.publicToken}/accept`).expect(409);
    await http()
      .patch(`/quotes/${q._id}`)
      .set(bearer(owner))
      .send({ leadId, items: ITEMS })
      .expect(409);
  });

  it('rechazar no gana la oportunidad y una vencida no se acepta', async () => {
    const leadId = await newLead('Piloto');
    const q = await newQuote(leadId);
    await http()
      .post(`/public/quotes/${q.publicToken}/reject`)
      .send({ reason: 'Muy caro' })
      .expect(201);
    expect((await leadOf(leadId))!.status).toBe('open');

    const old = await newQuote(leadId, { validUntil: '2020-01-01' });
    await http().post(`/public/quotes/${old.publicToken}/accept`).expect(409);
    expect(
      (await http().get(`/public/quotes/${old.publicToken}`)).body,
    ).toMatchObject({ expired: true });
  });

  it('link de pago con la cuenta de la empresa; el pago aprobado gana la oportunidad', async () => {
    const leadId = await newLead('Compra directa');
    const noPay = await newQuote(leadId);
    await http().post(`/public/quotes/${noPay.publicToken}/pay`).expect(400);

    const q = await newQuote(leadId, { payOnline: true });
    expect(
      (await http().get(`/public/quotes/${q.publicToken}`)).body,
    ).toMatchObject({ canPay: true });
    const res = await http()
      .post(`/public/quotes/${q.publicToken}/pay`)
      .expect(201);
    expect((res.body as { initPoint: string }).initPoint).toContain(
      'mercadopago',
    );
    const [token, body] = pref.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];
    expect(token).toBe('APP_USR-SELLER');
    expect(body).toMatchObject({
      external_reference: `quo:${q._id}`,
      items: [{ quantity: 1, unit_price: 1091.97, currency_id: 'PEN' }],
    });

    const tenantId = new Types.ObjectId(owner.user.tenantId!);
    await tickets.applyPayment(tenantId, {
      id: 555,
      status: 'pending',
      external_reference: `quo:${q._id}`,
    } as never);
    expect((await leadOf(leadId))!.status).toBe('open');
    await tickets.applyPayment(tenantId, {
      id: 555,
      status: 'approved',
      external_reference: `quo:${q._id}`,
    } as never);
    await tickets.applyPayment(tenantId, {
      id: 555,
      status: 'approved',
      external_reference: `quo:${q._id}`,
    } as never);
    const quote = (
      await http().get(`/quotes/${q._id}`).set(bearer(owner)).expect(200)
    ).body as QuoteRes & { mpPaymentId: string };
    expect(quote).toMatchObject({ status: 'paid', mpPaymentId: '555' });
    expect(await leadOf(leadId)).toMatchObject({
      status: 'won',
      value: 1091.97,
    });
  });

  it('catálogo: crear, listar y solo administradores editan', async () => {
    const p = await http()
      .post('/products')
      .set(bearer(owner))
      .send({
        name: 'Hora de consultoría',
        price: 150,
        taxIncluded: false,
        unit: 'hora',
      })
      .expect(201);
    const list = await http().get('/products').set(bearer(owner)).expect(200);
    expect((list.body as { name: string }[]).map((x) => x.name)).toContain(
      'Hora de consultoría',
    );
    await http().get('/products').set(bearer(other)).expect(200).expect([]);
    await http()
      .delete(`/products/${(p.body as { _id: string })._id}`)
      .set(bearer(other))
      .expect(404);
    await http()
      .post('/products/import-woocommerce')
      .set(bearer(owner))
      .send({ storeUrl: 'http://127.0.0.1' })
      .expect(400);
  });
});
