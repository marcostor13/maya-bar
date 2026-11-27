/**
 * Plantillas de los correos de cobro (HU50). Puras: reciben los datos y
 * devuelven asunto, HTML y texto. Los colores van en hex porque los clientes
 * de correo no entienden variables CSS.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#E11D48';
const esc = (v: string | number | undefined | null) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const money = (amount: number, currency: string) =>
  `${currency === 'USD' ? 'US$' : 'S/'} ${amount.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const longDate = (d: Date) =>
  d.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

const PERIOD: Record<string, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  annual: 'anual',
};
export const periodName = (p?: string) => PERIOD[p ?? ''] ?? p ?? '';

interface Layout {
  title: string;
  /** Párrafos; ya escapados por quien llama con `esc`. */
  body: string[];
  cta?: { label: string; url: string };
  /** Tabla de detalle: [etiqueta, valor] sin escapar. */
  rows?: [string, string][];
  footer?: string;
}

function layout(l: Layout): string {
  const rows = l.rows?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">${l.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f1f5f9">${esc(k)}</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #f1f5f9">${esc(v)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const cta = l.cta
    ? `<p style="margin:28px 0;text-align:center"><a href="${esc(l.cta.url)}" style="background:${BRAND};color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">${esc(l.cta.label)}</a></p>
<p style="color:#9ca3af;font-size:12px;word-break:break-all">Si el botón no abre, copia este enlace: ${esc(l.cta.url)}</p>`
    : '';
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f9fafb;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:24px;padding:36px 28px;color:#111827">
<p style="margin:0 0 20px;font-weight:800;font-size:18px;color:${BRAND}">Maya CRM</p>
<h1 style="font-size:21px;margin:0 0 14px">${esc(l.title)}</h1>
${l.body.map((p) => `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 12px">${p}</p>`).join('\n')}
${rows}${cta}
<p style="color:#9ca3af;font-size:12px;margin-top:28px">${l.footer ?? 'Maya CRM · Si tienes dudas, responde este correo.'}</p>
</div></div>`;
}

const unescape = (v: string) =>
  v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const text = (l: Layout) =>
  [
    l.title,
    ...l.body.map((p) => unescape(p.replace(/<[^>]+>/g, ''))),
    ...(l.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    l.cta ? `${l.cta.label}: ${l.cta.url}` : '',
  ]
    .filter(Boolean)
    .join('\n');

const build = (subject: string, l: Layout): EmailContent => ({
  subject,
  html: layout(l),
  text: text(l),
});

export interface PlanInfo {
  planName: string;
  period?: string;
  amount: number;
  currency: string;
  nextDate?: Date;
  /** Compra de un add-on o recarga (HU53), no de un plan. */
  purchase?: boolean;
  /** Implementación (HU55); `payUrl` si falta pagarla aparte (mensual). */
  setup?: { name: string; payUrl?: string };
}

const planRows = (p: PlanInfo): [string, string][] => [
  p.purchase
    ? ['Compra', p.planName]
    : ['Plan', `${p.planName}${p.period ? ` (${periodName(p.period)})` : ''}`],
  ['Monto', money(p.amount, p.currency)],
  ...(p.nextDate
    ? ([['Próximo cobro o vencimiento', longDate(p.nextDate)]] as [
        string,
        string,
      ][])
    : []),
];

export const T = {
  /** Pago aprobado, cliente nuevo (con el enlace de acceso, HU47). */
  welcome(p: PlanInfo & { name?: string; accessUrl: string }) {
    return build('Tu cuenta de Maya CRM está lista', {
      title: `¡Bienvenido${p.name ? `, ${p.name}` : ''}! Tu pago se confirmó`,
      body: [
        `Tu cuenta con el plan <b>${esc(p.planName)}</b> ya está activa. Crea tu contraseña para entrar; el enlace sirve una sola vez y vence en 72 horas.`,
        ...(p.setup?.payUrl
          ? [
              `Falta pagar tu <b>${esc(p.setup.name)}</b> para que agendemos la primera sesión: <a href="${esc(p.setup.payUrl)}">págala aquí</a>.`,
            ]
          : p.setup
            ? [
                `Incluye tu <b>${esc(p.setup.name)}</b>: te escribimos para agendar la primera sesión.`,
              ]
            : []),
      ],
      rows: planRows(p),
      cta: { label: 'Crear mi contraseña y entrar', url: p.accessUrl },
    });
  },

  /** Reenvío del enlace de acceso (sin datos de pago). */
  access(p: { name?: string; accessUrl: string }) {
    return build('Tu acceso a Maya CRM', {
      title: `Hola${p.name ? ` ${p.name}` : ''}, aquí tienes tu acceso`,
      body: [
        'Crea tu contraseña con este enlace. Sirve una sola vez y vence en 72 horas.',
      ],
      cta: { label: 'Crear mi contraseña y entrar', url: p.accessUrl },
    });
  },

  /** Pago aprobado de un cliente existente (compra o renovación). */
  paymentConfirmed(p: PlanInfo & { accountUrl: string }) {
    return build(`Pago confirmado: ${p.purchase ? '' : 'plan '}${p.planName}`, {
      title: 'Recibimos tu pago',
      body: [
        p.purchase
          ? 'Gracias. Tu compra ya está disponible en tu cuenta.'
          : 'Gracias. Tu plan sigue activo sin cortes.',
      ],
      rows: planRows(p),
      cta: { label: 'Ir a mi cuenta', url: p.accountUrl },
    });
  },

  /** Comprobante emitido (HU49). */
  receipt(p: {
    kind: 'factura' | 'boleta' | 'nota de crédito';
    code: string;
    amount: number;
    currency: string;
    pdfUrl?: string;
    xmlUrl?: string;
  }) {
    const links = [
      p.pdfUrl
        ? `<a href="${esc(p.pdfUrl)}" style="color:${BRAND}">Descargar PDF</a>`
        : '',
      p.xmlUrl
        ? `<a href="${esc(p.xmlUrl)}" style="color:${BRAND}">Descargar XML</a>`
        : '',
    ].filter(Boolean);
    return build(`Tu ${p.kind} electrónica ${p.code} — Maya CRM`, {
      title: `Tu ${p.kind} electrónica ${p.code}`,
      body: [
        `Aquí tienes tu ${p.kind} por ${esc(money(p.amount, p.currency))}.`,
        ...(links.length ? [links.join(' · ')] : []),
        'También la encuentras en Maya CRM, en Configuración → Mi plan y consumo.',
      ],
    });
  },

  /** PagoEfectivo pendiente: código CIP e instrucciones. */
  pending(p: PlanInfo & { cip?: string; ticketUrl?: string }) {
    return build('Completa tu pago con PagoEfectivo', {
      title: 'Tu pago está pendiente',
      body: [
        p.cip
          ? `Tu código de pago (CIP) es <b>${esc(p.cip)}</b>.`
          : 'Tu código de pago (CIP) está en el enlace de abajo.',
        'Págalo en una agencia, agente o tu banca por internet (BCP, BBVA, Interbank, Scotiabank y otros) antes de que venza. Cuando se acredite te avisamos por correo.',
      ],
      rows: planRows(p),
      ...(p.ticketUrl
        ? { cta: { label: 'Ver instrucciones de pago', url: p.ticketUrl } }
        : {}),
    });
  },

  /** Pago rechazado, con motivo legible. */
  rejected(p: PlanInfo & { reason: string; retryUrl: string }) {
    return build('Tu pago no se aprobó', {
      title: 'Tu pago no se aprobó',
      body: [
        esc(p.reason),
        'No se hizo ningún cobro. Puedes intentarlo con otra tarjeta o con otro medio de pago.',
      ],
      rows: planRows(p),
      cta: { label: 'Intentar con otro medio', url: p.retryUrl },
    });
  },

  /** Renovación trimestral o anual, 7 días antes (HU48). */
  renewal(p: PlanInfo & { endDate: Date; payUrl: string }) {
    return build(`Tu plan ${p.planName} vence el ${longDate(p.endDate)}`, {
      title: `Tu plan vence el ${longDate(p.endDate)}`,
      body: [
        `Renueva tu plan <b>${esc(p.planName)}</b> para seguir sin cortes. Puedes pagar con tarjeta, Yape o PagoEfectivo.`,
      ],
      rows: planRows(p),
      cta: { label: 'Renovar ahora', url: p.payUrl },
    });
  },

  /** Cobro fallido o plan vencido sin pagar: gracia y "actualiza tu medio de pago" (HU51). */
  monthlyFailed(
    p: PlanInfo & { reason: string; updateUrl: string; graceEndsAt?: Date },
  ) {
    return build('No pudimos cobrar tu plan: actualiza tu medio de pago', {
      title: 'No pudimos cobrar tu plan',
      body: [
        esc(p.reason),
        p.graceEndsAt
          ? `Todo sigue funcionando hasta el <b>${esc(longDate(p.graceEndsAt))}</b>. Después la cuenta queda en solo lectura (tus datos no se borran) hasta que pagues.`
          : 'Actualiza tu medio de pago para no perder el acceso.',
      ],
      rows: planRows(p),
      cta: { label: 'Actualizar medio de pago', url: p.updateUrl },
    });
  },

  /** Al superadmin: una subida se pagó pero ya no aplicaba (HU52). */
  upgradeStale(p: {
    tenant: string;
    reference: string;
    amount: number;
    currency: string;
    url: string;
  }) {
    return build(`Revisar reembolso: subida de plan de ${p.tenant}`, {
      title: 'Una subida de plan se pagó pero no se aplicó',
      body: [
        `La empresa <b>${esc(p.tenant)}</b> pagó ${esc(money(p.amount, p.currency))} (compra ${esc(p.reference)}) por una subida que ya no correspondía: cambió de plan o de periodo antes de que se confirmara el pago.`,
        'No se tocó su plan. Revisa el caso y reembolsa desde Mercado Pago si corresponde.',
      ],
      cta: { label: 'Ver empresas', url: p.url },
    });
  },

  /** Implementación pagada (HU55): agendar la primera sesión. */
  onboarding(p: {
    name?: string;
    pkg: string;
    bookingUrl: string;
    items: string[];
  }) {
    return build(`Agenda tu ${p.pkg} con el equipo de Maya`, {
      title: `${p.name ? `${p.name}, ` : ''}agenda tu primera sesión`,
      body: [
        `Recibimos el pago de tu <b>${esc(p.pkg)}</b>. Elige el día y la hora de la primera sesión y te dejamos la cuenta lista.`,
        `Lo que haremos: ${p.items.map((i) => esc(i)).join(' · ')}.`,
      ],
      cta: { label: 'Agendar la primera sesión', url: p.bookingUrl },
    });
  },

  /** Al superadmin: nueva implementación por hacer (HU55). */
  onboardingTask(p: {
    company: string;
    pkg: string;
    email: string;
    phone?: string;
    url: string;
  }) {
    return build(`Nueva implementación: ${p.pkg} para ${p.company}`, {
      title: `${p.company} contrató ${p.pkg}`,
      body: [
        `Contacto: ${esc(p.email)}${p.phone ? ` · ${esc(p.phone)}` : ''}.`,
        'La tarea con su checklist ya está en el panel de implementaciones.',
      ],
      cta: { label: 'Ver implementaciones', url: p.url },
    });
  },

  /** Al superadmin: una cuenta lleva 60 días en solo lectura (HU51). */
  longExpired(p: { tenant: string; email?: string; since: Date; url: string }) {
    return build(`Revisar cuenta: ${p.tenant} lleva 60 días sin pagar`, {
      title: `${p.tenant} lleva 60 días en solo lectura`,
      body: [
        `La empresa <b>${esc(p.tenant)}</b>${p.email ? ` (${esc(p.email)})` : ''} está en solo lectura desde el <b>${esc(longDate(p.since))}</b>. Sus datos siguen guardados: no se borra nada solo.`,
        'Decide si la contactas, la suspendes o eliminas sus datos.',
      ],
      cta: { label: 'Ver empresas', url: p.url },
    });
  },

  /** Créditos de IA al 80 % o 100 %. */
  aiCredits(p: {
    percent: 80 | 100;
    remaining: number;
    total: number;
    rechargeUrl: string;
  }) {
    const done = p.percent >= 100;
    return build(
      done
        ? 'Se acabaron tus créditos de IA del mes'
        : 'Ya usaste el 80 % de tus créditos de IA',
      {
        title: done
          ? 'Se acabaron tus créditos de IA'
          : 'Te queda el 20 % de tus créditos de IA',
        body: [
          done
            ? 'El agente y las funciones de IA quedan en pausa hasta el próximo mes o hasta que recargues.'
            : 'Recarga ahora para que el agente no se detenga a mitad de mes.',
        ],
        rows: [['Saldo', `${p.remaining} de ${p.total} créditos`]],
        cta: { label: 'Recargar créditos', url: p.rechargeUrl },
      },
    );
  },

  /** Cambio de plan o cancelación (HU52). */
  planChange(p: {
    what: string;
    from: Date;
    accountUrl: string;
    canceled?: boolean;
  }) {
    return build(
      p.canceled
        ? 'Cancelaste tu plan de Maya CRM'
        : 'Cambiaste tu plan de Maya CRM',
      {
        title: p.canceled ? 'Tu plan quedó cancelado' : 'Tu plan cambió',
        body: [`${esc(p.what)} desde el <b>${esc(longDate(p.from))}</b>.`],
        cta: { label: 'Ir a mi cuenta', url: p.accountUrl },
      },
    );
  },

  /** Al dueño: nueva venta con los datos para facturar a mano (HU75). */
  saleAlert(p: {
    concept: string;
    amount: number;
    currency: string;
    paidAt: Date;
    paymentType?: string;
    providerPaymentId?: string;
    company?: string;
    buyer?: { name?: string; email?: string; phone?: string };
    billing?: {
      docType?: string;
      docNumber?: string;
      legalName?: string;
      address?: string;
      email?: string;
    };
    invoicing: 'manual' | 'auto';
    url: string;
  }) {
    const rows: [string, string][] = [
      ['Concepto', p.concept],
      ['Monto', money(p.amount, p.currency)],
      ['Fecha', longDate(p.paidAt)],
      ['Medio de pago', p.paymentType ?? '—'],
      ['Pago en Mercado Pago', p.providerPaymentId ?? '—'],
      ['Empresa', p.company ?? '—'],
      ['Comprador', p.buyer?.name ?? '—'],
      ['Correo', p.buyer?.email ?? '—'],
      ['Teléfono', p.buyer?.phone ?? '—'],
      ['Comprobante', p.billing?.docType ?? '—'],
      ['RUC / DNI', p.billing?.docNumber ?? '—'],
      ['Razón social / nombre', p.billing?.legalName ?? '—'],
      ['Dirección fiscal', p.billing?.address ?? '—'],
      ['Correo de facturación', p.billing?.email ?? '—'],
    ];
    return build(`Nueva venta: ${p.concept} · ${money(p.amount, p.currency)}`, {
      title: 'Nueva venta en Maya',
      body: [
        `${esc(p.company ?? p.buyer?.name ?? 'Un cliente')} pagó ${esc(money(p.amount, p.currency))}.`,
        p.invoicing === 'manual'
          ? '<b>Facturación manual:</b> Maya no emite el comprobante. Emítelo tú y márcalo como facturado en el panel.'
          : 'El comprobante se emite automáticamente.',
      ],
      rows,
      cta: { label: 'Ver pagos por facturar', url: p.url },
      footer: 'Aviso interno de Maya CRM.',
    });
  },
};

/** Motivos de rechazo de Mercado Pago en lenguaje claro. */
export function rejectReason(detail?: string): string {
  const map: Record<string, string> = {
    cc_rejected_insufficient_amount: 'La tarjeta no tiene saldo suficiente.',
    cc_rejected_bad_filled_security_code:
      'El código de seguridad de la tarjeta no es correcto.',
    cc_rejected_bad_filled_date:
      'La fecha de vencimiento de la tarjeta no es correcta.',
    cc_rejected_bad_filled_card_number:
      'El número de la tarjeta no es correcto.',
    cc_rejected_bad_filled_other: 'Algún dato de la tarjeta no es correcto.',
    cc_rejected_call_for_authorize:
      'Tu banco pide que autorices el pago: llámalo y vuelve a intentarlo.',
    cc_rejected_card_disabled:
      'La tarjeta no está activa. Actívala con tu banco o usa otra.',
    cc_rejected_duplicated_payment: 'Ya hiciste un pago igual hace poco.',
    cc_rejected_high_risk:
      'El pago fue rechazado por seguridad. Prueba con otro medio.',
    cc_rejected_max_attempts:
      'Llegaste al límite de intentos con esta tarjeta. Usa otra.',
    cc_rejected_blacklist: 'No pudimos procesar el pago con esta tarjeta.',
  };
  return map[detail ?? ''] ?? 'El banco o Mercado Pago no aprobó el pago.';
}
