import { T, money, rejectReason } from './billing-email.templates';

const plan = {
  planName: 'Crece',
  period: 'monthly',
  amount: 293.82,
  currency: 'PEN',
};
const next = new Date('2026-12-24T15:00:00Z');

/** HU50 C3: cada plantilla lleva el monto, el plan y el enlace correctos. */
describe('Plantillas de correos de cobro (HU50)', () => {
  it('money formatea soles y dólares', () => {
    expect(money(293.82, 'PEN')).toBe('S/ 293.82');
    expect(money(79, 'USD')).toBe('US$ 79.00');
  });

  const cases: [string, ReturnType<(typeof T)[keyof typeof T]>, string[]][] = [
    [
      'bienvenida',
      T.welcome({
        ...plan,
        name: 'Ana',
        accessUrl: 'https://app/acceso?token=t&email=a',
      }),
      [
        'Crece',
        'S/ 293.82',
        'https://app/acceso?token=t&amp;email=a',
        'Crear mi contraseña',
      ],
    ],
    [
      'pago confirmado',
      T.paymentConfirmed({
        ...plan,
        nextDate: next,
        accountUrl: 'https://app/settings/plan',
      }),
      [
        'Crece',
        'S/ 293.82',
        'https://app/settings/plan',
        '24 de diciembre de 2026',
      ],
    ],
    [
      'comprobante',
      T.receipt({
        kind: 'factura',
        code: 'F001-7',
        amount: 293.82,
        currency: 'PEN',
        pdfUrl: 'https://nf/x.pdf',
        xmlUrl: 'https://nf/x.xml',
      }),
      ['F001-7', 'S/ 293.82', 'https://nf/x.pdf', 'https://nf/x.xml'],
    ],
    [
      'PagoEfectivo',
      T.pending({ ...plan, cip: '12345678', ticketUrl: 'https://mp/ticket' }),
      ['12345678', 'S/ 293.82', 'https://mp/ticket', 'Crece'],
    ],
    [
      'rechazado',
      T.rejected({
        ...plan,
        reason: rejectReason('cc_rejected_insufficient_amount'),
        retryUrl: 'https://app/checkout?plan=crece',
      }),
      [
        'saldo suficiente',
        'S/ 293.82',
        'https://app/checkout?plan=crece',
        'Intentar con otro medio',
      ],
    ],
    [
      'prueba',
      T.trial({ daysLeft: 4, plansUrl: 'https://app/checkout' }),
      ['4 días', 'https://app/checkout', 'Elegir plan'],
    ],
    [
      'renovación',
      T.renewal({
        ...plan,
        period: 'annual',
        amount: 2938.2,
        endDate: next,
        payUrl: 'https://mp/renovar',
      }),
      ['Crece', 'S/ 2,938.20', 'https://mp/renovar', 'diciembre'],
    ],
    [
      'cobro mensual fallido',
      T.monthlyFailed({
        ...plan,
        reason: 'x',
        graceEndsAt: next,
        updateUrl: 'https://app/settings/plan',
      }),
      [
        'Actualizar medio de pago',
        'Crece',
        'S/ 293.82',
        'https://app/settings/plan',
      ],
    ],
    [
      'créditos IA',
      T.aiCredits({
        percent: 80,
        remaining: 100,
        total: 500,
        rechargeUrl: 'https://app/settings/plan',
      }),
      ['100 de 500', 'https://app/settings/plan', '80 %'],
    ],
    [
      'reenvío de acceso',
      T.access({
        name: 'Ana',
        accessUrl: 'https://app/acceso?token=z&email=a',
      }),
      ['https://app/acceso?token=z&amp;email=a', 'Crear mi contraseña'],
    ],
    [
      'superadmin 60 días',
      T.longExpired({
        tenant: 'Acme',
        since: next,
        url: 'https://app/admin/tenants',
      }),
      ['Acme', 'https://app/admin/tenants', 'no se borra'],
    ],
    [
      'cambio de plan',
      T.planChange({
        what: 'Pasas al plan Inicia',
        from: next,
        accountUrl: 'https://app/settings/plan',
      }),
      ['Pasas al plan Inicia', 'https://app/settings/plan'],
    ],
  ];

  it.each(cases)('%s: lleva monto, plan y enlace', (_name, c, expected) => {
    const all = `${c.subject}\n${c.html}`;
    for (const e of expected) expect(all).toContain(e);
    expect(c.text.length).toBeGreaterThan(10);
  });

  it('escapa los datos del cliente', () => {
    const c = T.welcome({
      ...plan,
      name: '<script>x</script>',
      accessUrl: 'https://a',
    });
    expect(c.html).not.toContain('<script>');
  });

  it('no escapa dos veces y el texto plano sale sin entidades', () => {
    const c = T.welcome({
      ...plan,
      name: 'Pérez & Hijos',
      accessUrl: 'https://a',
    });
    expect(c.html).toContain('Pérez &amp; Hijos');
    expect(c.html).not.toContain('&amp;amp;');
    expect(c.text).toContain('Pérez & Hijos');
    const r = T.pending({ ...plan, cip: 'A&B' });
    expect(r.text).toContain('A&B');
    expect(r.text).not.toContain('&amp;');
  });
});
