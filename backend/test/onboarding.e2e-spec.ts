import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN, bearer, createApp, login, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import type { InvoiceRequest } from '../src/billing/invoicing/invoice-provider';
import { AccountProvisioningService } from '../src/auth/account-provisioning.service';
import { money } from '../src/billing/emails/billing-email.templates';

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const boleta = {
  docType: 'boleta',
  docNumber: '12345678',
  legalName: 'Ana Pérez',
};
let seq = 0;

interface Task {
  _id: string;
  sessionPublicId: string;
  packageName: string;
  status: string;
  contact: { email: string; company: string };
  checklist: { label: string; done: boolean }[];
}

/** HU55: implementación de pago único descontable. */
describe('Implementación en el checkout (HU55)', () => {
  let app: NestExpressApplication;
  let createPref: jest.SpyInstance;
  let createPre: jest.SpyInstance;
  let issue: jest.SpyInstance;
  let sendHtml: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const buy = (email: string, period: string, setup?: string) =>
    http()
      .post('/public/checkout')
      .send({
        plan: 'crece',
        period,
        currency: 'PEN',
        buyer: {
          company: `Empresa ${email}`,
          name: 'Ana Pérez',
          email,
          phone: '999888777',
        },
        billing: boleta,
        acceptTerms: true,
        ...(setup ? { setup } : {}),
      });

  const approve = async (
    ref: string,
    total: number,
    extra: Partial<MpPayment> = {},
  ) => {
    const p: MpPayment = {
      id: `onb-${++seq}`,
      status: 'approved',
      transaction_amount: total,
      currency_id: 'PEN',
      external_reference: ref,
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
      ...extra,
    };
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    return p;
  };

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    const mp = app.get(MercadoPagoClient);
    createPref = jest
      .spyOn(mp, 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/pref' });
    createPre = jest.spyOn(mp, 'createPreapproval').mockResolvedValue({
      id: 'pre-onb',
      init_point: 'https://mp.test/pre',
      status: 'pending',
    });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    issue = jest.spyOn(nf, 'issue').mockResolvedValue({
      pdfUrl: 'https://nf.test/a.pdf',
      xmlUrl: 'https://nf.test/a.xml',
    });
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1: Crece anual con Puesta en marcha muestra S/ 490 y su descuento, y el total coincide con Mercado Pago', async () => {
    const q = (
      await http()
        .get('/public/checkout/quote')
        .query({
          plan: 'crece',
          period: 'anual',
          currency: 'PEN',
          setup: 'puesta',
        })
        .expect(200)
    ).body as {
      total: number;
      setup: {
        price: number;
        discount: number;
        subtotal: number;
        total: number;
      };
      dueToday: number;
    };
    // 10 % de 2.490 = 249 de descuento sobre los 490.
    expect(q.setup).toMatchObject({
      price: 490,
      discount: 249,
      subtotal: 241,
      total: 284.38,
    });
    expect(q.total).toBe(2938.2);
    expect(q.dueToday).toBe(3222.58);

    createPref.mockClear();
    const res = (await buy('onb-anual@e2e.test', 'anual', 'puesta').expect(201))
      .body as { session: string; dueToday: number };
    const items = (
      createPref.mock.calls[0] as [
        { items: { unit_price: number; title: string }[] },
      ]
    )[0].items;
    expect(items).toHaveLength(2);
    expect(items[1].title).toContain('Puesta en marcha');
    expect(
      Math.round(items.reduce((n, i) => n + i.unit_price, 0) * 100) / 100,
    ).toBe(res.dueToday);

    // C2: pagado, aparece la tarea en el panel del superadmin.
    sendHtml.mockClear();
    await approve(res.session, res.dueToday);
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const tasks = (
      await http()
        .get('/billing/admin/onboarding')
        .set(bearer(admin))
        .expect(200)
    ).body as Task[];
    const t = tasks.find((x) => x.sessionPublicId === res.session)!;
    expect(t).toMatchObject({
      packageName: 'Puesta en marcha',
      status: 'pending',
      contact: { email: 'onb-anual@e2e.test' },
    });
    expect(t.checklist.length).toBeGreaterThan(3);
    // Correo al cliente con el enlace para agendar.
    const subjects = sendHtml.mock.calls.map(
      (c) => (c as [{ subject: string; to: string }])[0].subject,
    );
    expect(subjects).toContain(
      'Agenda tu Puesta en marcha con el equipo de Maya',
    );

    // Comprobante con una línea aparte para la implementación.
    await app.get(InvoicingService).drain();
    const req = issue.mock.calls
      .map((c) => (c as [InvoiceRequest])[0])
      .find((r) => r.lines?.length === 2)!;
    expect(req.total).toBe(3222.58);
    expect(req.lines![1]).toMatchObject({
      base: 241,
      total: 284.38,
      discount: 249,
    });
    expect(req.lines![1].description).toContain(
      'Servicio de implementación: Puesta en marcha',
    );
    const body = NubefactProvider.body(req) as {
      items: { subtotal: number; descuento?: number }[];
      total_descuento?: number;
    };
    expect(body.items[1]).toMatchObject({ subtotal: 241, descuento: 249 });
    expect(body.total_descuento).toBe(249);
  });

  it('mensual: la implementación es un pago aparte; al pagarlo aparece la tarea (una sola vez)', async () => {
    createPref.mockClear();
    createPre.mockClear();
    const res = (
      await buy('onb-mensual@e2e.test', 'mensual', 'pro').expect(201)
    ).body as {
      session: string;
      total: number;
      setup: { total: number; discount: number };
    };
    expect(res.setup.discount).toBe(0);
    expect(
      (
        createPre.mock.calls[0] as [
          { auto_recurring: { transaction_amount: number } },
        ]
      )[0].auto_recurring.transaction_amount,
    ).toBe(res.total);
    const pref = (
      createPref.mock.calls[0] as [
        { external_reference: string; items: { unit_price: number }[] },
      ]
    )[0];
    expect(pref.external_reference).toBe(`${res.session}:setup`);
    expect(pref.items[0].unit_price).toBe(1758.2);

    // El enlace aparte aparece una vez pagado el plan.
    expect(
      (
        (await http().get(`/public/checkout/${res.session}`).expect(200))
          .body as { setup: { redirectUrl?: string } }
      ).setup.redirectUrl,
    ).toBeUndefined();
    await approve(res.session, res.total);
    // El correo de bienvenida trae el enlace para pagar la implementación.
    expect(
      sendHtml.mock.calls.some((c) =>
        (c as [{ html: string }])[0].html.includes('https://mp.test/pref'),
      ),
    ).toBe(true);
    let st = (await http().get(`/public/checkout/${res.session}`).expect(200))
      .body as { setup: { paid: boolean; redirectUrl?: string } };
    expect(st.setup).toMatchObject({
      paid: false,
      redirectUrl: 'https://mp.test/pref',
    });

    const admin = await login(app, ADMIN.email, ADMIN.password);
    const list = async () =>
      (
        (
          await http()
            .get('/billing/admin/onboarding')
            .set(bearer(admin))
            .expect(200)
        ).body as Task[]
      ).filter((x) => x.sessionPublicId === res.session);
    expect(await list()).toHaveLength(0);

    await approve(`${res.session}:setup`, 1758.2);
    await approve(`${res.session}:setup`, 1758.2);
    expect(await list()).toHaveLength(1);
    st = (await http().get(`/public/checkout/${res.session}`).expect(200))
      .body as { setup: { paid: boolean; redirectUrl?: string } };
    expect(st.setup.paid).toBe(true);
    expect(st.setup.redirectUrl).toBeUndefined();
  });

  it('si el alta falla en el webhook, la tarea igual se crea y un reintento no la duplica', async () => {
    const prov = app.get(AccountProvisioningService);
    const fulfill = jest
      .spyOn(prov, 'fulfill')
      .mockRejectedValueOnce(new Error('caída'));
    const res = (await buy('onb-falla@e2e.test', 'anual', 'puesta').expect(201))
      .body as { session: string; dueToday: number };
    await approve(res.session, res.dueToday).catch(() => undefined);
    fulfill.mockRestore();
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const mine = async () =>
      (
        (
          await http()
            .get('/billing/admin/onboarding')
            .set(bearer(admin))
            .expect(200)
        ).body as Task[]
      ).filter((x) => x.sessionPublicId === res.session);
    expect(await mine()).toHaveLength(1);
    // El cron retoma el alta y el webhook se reintenta: sigue habiendo una.
    await prov.resumePending();
    await approve(res.session, res.dueToday, { id: 'onb-retry' });
    expect(await mine()).toHaveLength(1);
  });

  it('Escala anual: el descuento de la implementación llega como mucho a su precio; los correos usan el monto cobrado', async () => {
    const q = (
      await http()
        .get('/public/checkout/quote')
        .query({
          plan: 'escala',
          period: 'anual',
          currency: 'PEN',
          setup: 'puesta',
        })
        .expect(200)
    ).body as {
      setup: { discount: number; total: number };
      total: number;
      dueToday: number;
    };
    // 10 % de 5.490 = 549 > 490: se descuenta entero.
    expect(q.setup).toMatchObject({ discount: 490, total: 0 });
    expect(q.dueToday).toBe(q.total);

    const res = (await buy('onb-cip@e2e.test', 'anual', 'pro').expect(201))
      .body as { session: string; dueToday: number; total: number };
    expect(res.dueToday).toBeGreaterThan(res.total);
    sendHtml.mockClear();
    await approve(res.session, res.dueToday, {
      status: 'pending',
      payment_type_id: 'ticket',
      transaction_details: { payment_method_reference_id: '123' },
    });
    const html = sendHtml.mock.calls
      .map((c) => (c as [{ html: string; subject: string }])[0])
      .find((m) => /pendiente|PagoEfectivo|CIP/i.test(m.subject + m.html))!;
    expect(html.html).toContain(money(res.dueToday, 'PEN'));
    expect(html.html).not.toContain(money(res.total, 'PEN'));
  });

  it('un pago de implementación con otro monto no la marca pagada; la renovación no acepta implementación', async () => {
    const res = (
      await buy('onb-monto@e2e.test', 'mensual', 'puesta').expect(201)
    ).body as { session: string };
    await approve(`${res.session}:setup`, 1);
    const st = (await http().get(`/public/checkout/${res.session}`).expect(200))
      .body as { setup: { paid: boolean } };
    expect(st.setup.paid).toBe(false);
  });

  it('el superadmin avanza la tarea y su checklist; un administrador de empresa no la ve', async () => {
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const owner = await registerTenant(app, 'Curiosa SAC');
    await http()
      .get('/billing/admin/onboarding')
      .set(bearer(owner))
      .expect(403);
    const [t] = (
      await http()
        .get('/billing/admin/onboarding')
        .set(bearer(admin))
        .expect(200)
    ).body as Task[];
    const upd = (
      await http()
        .patch(`/billing/admin/onboarding/${t._id}`)
        .set(bearer(admin))
        .send({
          status: 'scheduled',
          checklist: [{ index: 0, done: true }],
          notes: 'Sesión el lunes',
        })
        .expect(200)
    ).body as Task;
    expect(upd.status).toBe('scheduled');
    expect(upd.checklist[0].done).toBe(true);
    await http()
      .patch(`/billing/admin/onboarding/${t._id}`)
      .set(bearer(admin))
      .send({ status: 'raro' })
      .expect(400);
    const filtered = (
      await http()
        .get('/billing/admin/onboarding')
        .query({ status: 'scheduled' })
        .set(bearer(admin))
        .expect(200)
    ).body as Task[];
    expect(filtered.every((x) => x.status === 'scheduled')).toBe(true);
  });
});
