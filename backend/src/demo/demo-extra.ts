import { Types } from 'mongoose';

/**
 * Datos extra de la demo (HU89): llenan cada pantalla del CRM (campañas,
 * automatizaciones, recuperación, links, plantillas, formularios, listas,
 * prospección, cotizaciones, llamadas, bajas, reparto, actividad, reportes y
 * auditoría) para que se vea todo funcionando.
 *
 * Reglas para no disparar procesos en segundo plano (la demo no tiene token de
 * WhatsApp y es de solo lectura):
 * - Campañas solo `sent` o `draft`; automatizaciones con disparadores por
 *   evento (nadie puede crear eventos en la demo) y ejecuciones terminadas.
 * - Recuperación en `done`/`review`, prospección en `done`, llamadas cerradas,
 *   tareas vencidas ya recordadas y sin aviso por WhatsApp.
 * - Los valores con índice único global (códigos de link, formularios,
 *   cotizaciones, llamadas, plantillas) llevan un sufijo de la empresa.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

export interface DemoBase {
  tenant: Doc;
  users: Doc[];
  whatsappAccount: Doc;
  agent: Doc;
  customers: Doc[];
  conversations: Doc[];
  messages: Doc[];
  leads: Doc[];
}

/** Documentos por modelo de Mongoose, en orden de inserción. */
export type DemoExtras = { model: string; docs: Doc[] }[];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const id = () => new Types.ObjectId();
const firstName = (c: Doc) => String(c.name).split(' ')[0];

export function buildDemoExtras(
  base: DemoBase,
  now = new Date(),
  seed = 89,
): DemoExtras {
  const r = rng(seed);
  const t0 = now.getTime();
  const ago = (ms: number) => new Date(t0 - ms);
  const tenantId = base.tenant._id;
  const suffix = String(tenantId).slice(-8);
  const [admin, ...sellers] = base.users;
  const seller = (i: number) => sellers[i % sellers.length];
  const { customers, leads, conversations, messages, agent } = base;
  const account = base.whatsappAccount;
  const stamp = (at: Date) => ({ createdAt: at, updatedAt: at });
  const withEmail = customers.filter((c) => c.email);

  // ---------- Puntaje de los contactos (calientes, tibios y fríos) ----------
  const reasons = {
    hot: 'Preguntó precio y pidió cita esta semana',
    warm: 'Interesado, pero aún compara opciones',
    cold: 'Sin respuesta en más de 30 días',
  };
  customers.forEach((c, i) => {
    const score = Math.round(20 + ((i * 37) % 80));
    const label = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
    Object.assign(c, {
      score,
      scoreLabel: label,
      scoreReason: reasons[label],
      scoredAt: ago((i % 10) * HOUR + HOUR),
    });
  });
  for (const l of leads) {
    const c = customers.find((x) => x._id.equals(l.customerId as never));
    if (c)
      Object.assign(l, {
        score: c.score,
        scoreLabel: c.scoreLabel,
        scoreReason: c.scoreReason,
      });
  }

  // ---------- Conversaciones del anuncio: atribución a la campaña de Meta ----------
  for (const conv of conversations)
    if (conv.adReferral)
      Object.assign(conv, {
        adReferral: { ...conv.adReferral, adId: '120210000000086' },
        campaign: {
          kind: 'ad',
          id: '120210000000086',
          name: 'Blanqueamiento dental S/ 450',
          at: conv.createdAt,
        },
      });

  // ---------- Otros canales: Instagram, Messenger y chat web ----------
  const channelScripts: [string, [string, string][]][] = [
    [
      'instagram',
      [
        ['in', 'Hola! Vi su post del diseño de sonrisa, cuánto cuesta?'],
        [
          'out',
          'Hola {n}, el diseño de sonrisa empieza en S/ 5,500 e incluye evaluación y simulación digital. ¿Te agendo una evaluación?',
        ],
        ['in', 'Sí, el sábado puede ser?'],
        [
          'out',
          'Tengo el sábado a las 10:00 a. m. o a las 12:00 m. ¿Cuál prefieres?',
        ],
      ],
    ],
    [
      'instagram',
      [
        ['in', 'Hacen blanqueamiento en una sola sesión?'],
        [
          'out',
          'Sí, {n}: el blanqueamiento LED es en una sesión de 60 minutos y cuesta S/ 450. ¿Quieres reservar?',
        ],
      ],
    ],
    [
      'messenger',
      [
        ['in', 'Buenas tardes, atienden urgencias hoy?'],
        [
          'out',
          'Hola {n}, sí atendemos urgencias el mismo día (S/ 60 la consulta). ¿Qué molestia tienes?',
        ],
        ['in', 'Me duele una muela desde ayer'],
        [
          'out',
          'Te espero hoy a las 5:30 p. m. en Av. Larco 123, Miraflores. ¿Te confirmo la cita?',
        ],
      ],
    ],
    [
      'messenger',
      [
        ['in', 'Tienen convenio con Pacífico Seguros?'],
        [
          'out',
          'Te paso con una persona del equipo para revisarlo, {n}. Te escribe en unos minutos.',
        ],
      ],
    ],
    [
      'web',
      [
        ['in', 'Quisiera información de ortodoncia invisible'],
        [
          'out',
          'Claro, {n}: la ortodoncia invisible empieza en S/ 3,800 y la evaluación cuesta S/ 80. ¿Te agendo?',
        ],
        ['in', 'Ok, mañana en la tarde'],
      ],
    ],
    [
      'web',
      [
        ['in', 'Puedo pagar en cuotas los implantes?'],
        [
          'out',
          'Sí, {n}, hay financiamiento hasta 12 cuotas. Te paso con un asesor para darte la cotización.',
        ],
      ],
    ],
  ];
  channelScripts.forEach(([channel, turns], i) => {
    const c = customers[(i * 5 + 3) % customers.length];
    const convId = id();
    const end = t0 - (i + 1) * 3 * HOUR - i * DAY;
    let last = new Date(end);
    turns.forEach(([dir, text], k) => {
      const at = new Date(end - (turns.length - 1 - k) * 4 * MIN);
      last = at;
      messages.push({
        _id: id(),
        tenantId,
        conversationId: convId,
        direction: dir,
        author: dir === 'in' ? 'customer' : 'agent',
        type: 'text',
        text: text.replace('{n}', firstName(c)),
        status: dir === 'in' ? 'delivered' : 'read',
        at,
        ...stamp(at),
      });
    });
    const [dir, text] = turns[turns.length - 1];
    conversations.push({
      _id: convId,
      tenantId,
      channel,
      accountId: new Types.ObjectId(),
      agentId: agent._id,
      contact: `${channel}-${suffix}-${i}`,
      contactName: c.name,
      customerId: c._id,
      lastMessageAt: last,
      lastMessagePreview: text.replace('{n}', firstName(c)).slice(0, 120),
      lastMessageDirection: dir,
      unreadCount: dir === 'in' ? 1 : 0,
      autoReply: true,
      status: 'open',
      escalated: i === 3 || i === 5,
      ...(i === 3 || i === 5
        ? { escalatedAt: last, escalationReason: 'Pide convenio o cuotas' }
        : {}),
      createdAt: new Date(last.getTime() - HOUR),
      updatedAt: last,
    });
  });

  // ---------- Campañas ----------
  const campaigns: Doc[] = [];
  const recipients: Doc[] = [];
  const campaignDefs: {
    name: string;
    type: 'whatsapp' | 'email' | 'sms';
    days?: number;
    body?: string;
    subject?: string;
    templateName?: string;
    draft?: boolean;
    people: Doc[];
  }[] = [
    {
      name: 'Promo blanqueamiento noviembre',
      type: 'whatsapp',
      days: 6,
      body: 'Hola {{1}}, este mes el blanqueamiento LED está a S/ 450 (antes S/ 600). ¿Te reservo un turno?',
      templateName: 'promo_blanqueamiento',
      people: customers.slice(0, 28),
    },
    {
      name: 'Boletín: 5 hábitos para cuidar tu sonrisa',
      type: 'email',
      days: 12,
      subject: '5 hábitos para cuidar tu sonrisa este verano',
      people: withEmail,
    },
    {
      name: 'Recordatorio de control semestral',
      type: 'sms',
      days: 20,
      body: 'Clinica Sonrisa: te toca tu control semestral. Reserva aqui: {link}',
      people: customers.slice(4, 24),
    },
    {
      name: 'Reactivar pacientes de ortodoncia',
      type: 'whatsapp',
      days: 35,
      body: 'Hola {{1}}, hace tiempo no te vemos. Tu control de ortodoncia está pendiente, ¿te agendo?',
      templateName: 'control_ortodoncia',
      people: customers.slice(10, 26),
    },
    {
      name: 'Campaña Navidad: limpieza + blanqueamiento',
      type: 'email',
      draft: true,
      subject: 'Regálate una sonrisa nueva esta Navidad',
      people: [],
    },
    {
      name: 'Encuesta de satisfacción',
      type: 'whatsapp',
      draft: true,
      body: 'Hola {{1}}, ¿cómo calificarías tu última visita del 1 al 5?',
      templateName: 'encuesta_satisfaccion',
      people: [],
    },
  ];
  campaignDefs.forEach((d, ci) => {
    const cid = id();
    const sentAt = d.draft ? undefined : ago((d.days ?? 0) * DAY);
    const stats = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
    d.people.forEach((c, k) => {
      const status =
        k % 13 === 7 ? 'failed' : k % 17 === 9 ? 'skipped' : 'sent';
      stats.total++;
      stats[status]++;
      const at = new Date(sentAt!.getTime() + k * 20_000);
      const opened = d.type === 'email' && status === 'sent' && k % 3 !== 2;
      const clicked = opened && k % 2 === 0;
      recipients.push({
        _id: id(),
        tenantId,
        campaignId: cid,
        customerId: c._id,
        name: c.name,
        to: d.type === 'email' ? c.email : c.phone,
        status,
        attempts: 1,
        ...(status === 'sent'
          ? { sentAt: at, deliveredAt: new Date(at.getTime() + 30_000) }
          : {}),
        ...(status === 'failed' ? { error: 'Número sin WhatsApp' } : {}),
        ...(status === 'skipped'
          ? { error: 'Está en la lista de no contactar' }
          : {}),
        ...(opened
          ? { openedAt: new Date(at.getTime() + 2 * HOUR), opens: 1 + (k % 3) }
          : {}),
        ...(clicked
          ? {
              clickedAt: new Date(at.getTime() + 3 * HOUR),
              clicks: 1,
              lastClickUrl: 'https://clinicasonrisa.pe/blog/habitos',
              clickedUrls: ['https://clinicasonrisa.pe/blog/habitos'],
            }
          : {}),
        ...stamp(at),
      });
    });
    campaigns.push({
      _id: cid,
      tenantId,
      name: d.name,
      type: d.type,
      status: d.draft ? 'draft' : 'sent',
      targeting: d.people.length ? 'contacts' : 'tags',
      customerIds: d.people.map((c) => c._id),
      recipientTags: d.people.length ? [] : ['paciente frecuente'],
      recipientCount: d.people.length,
      ...(d.body ? { body: d.body } : {}),
      ...(d.subject
        ? {
            subject: d.subject,
            preheader: 'Consejos de nuestros odontólogos',
            html: '<h1>Cuida tu sonrisa</h1><p>1. Cepíllate 2 minutos. 2. Usa hilo dental cada noche. 3. Cambia el cepillo cada 3 meses. 4. Reduce el azúcar. 5. Visítanos cada 6 meses.</p><p><a href="https://clinicasonrisa.pe/blog/habitos">Leer más</a></p>',
          }
        : {}),
      ...(d.templateName
        ? {
            templateName: d.templateName,
            templateLanguage: 'es',
            templateVars: ['{nombre}'],
          }
        : {}),
      ...(d.draft ? {} : { stats, startedAt: sentAt, sentAt }),
      ...stamp(sentAt ?? ago((ci + 1) * HOUR)),
    });
  });

  // ---------- Plantillas ----------
  const waTemplates: Doc[] = [
    [
      'promo_blanqueamiento',
      'MARKETING',
      'APPROVED',
      'Hola {{1}}, este mes el blanqueamiento LED está a S/ 450 (antes S/ 600). ¿Te reservo un turno?',
    ],
    [
      'control_ortodoncia',
      'MARKETING',
      'APPROVED',
      'Hola {{1}}, hace tiempo no te vemos. Tu control de ortodoncia está pendiente, ¿te agendo?',
    ],
    [
      'recordatorio_cita',
      'UTILITY',
      'APPROVED',
      'Hola {{1}}, te recordamos tu cita el {{2}} a las {{3}} en Clínica Dental Sonrisa. Responde 1 para confirmar o 2 para reprogramar.',
    ],
    [
      'encuesta_satisfaccion',
      'MARKETING',
      'PENDING',
      'Hola {{1}}, ¿cómo calificarías tu última visita del 1 al 5?',
    ],
    [
      'descuento_referido',
      'MARKETING',
      'REJECTED',
      'Trae a un amigo y ambos ganan 50% de descuento en tu próxima limpieza.',
    ],
  ].map(([name, category, status, body], i) => ({
    _id: id(),
    tenantId,
    accountId: account._id,
    metaId: `demo-${suffix}-${i}`,
    name,
    language: 'es',
    category,
    status,
    body,
    footer: 'Clínica Dental Sonrisa',
    ...(status === 'REJECTED'
      ? { rejectedReason: 'Promesa de descuento poco clara para Meta' }
      : {}),
    ...(status === 'APPROVED' ? { qualityScore: 'GREEN' } : {}),
    ...stamp(ago((40 - i * 5) * DAY)),
  }));

  const messageTemplates: Doc[] = [
    [
      'Confirmación de cita',
      'whatsapp',
      'Hola {nombre}, tu cita quedó confirmada para el {fecha}. Te esperamos en Av. Larco 123, Miraflores.',
    ],
    [
      'Indicaciones post blanqueamiento',
      'whatsapp',
      'Hola {nombre}, durante 48 horas evita café, vino y gaseosas oscuras. Cualquier molestia, escríbenos.',
    ],
    [
      'Recordatorio SMS',
      'sms',
      'Clinica Sonrisa: recuerda tu cita manana. Responde SI para confirmar.',
    ],
    [
      'Seguimiento de presupuesto',
      'whatsapp',
      'Hola {nombre}, ¿pudiste revisar el presupuesto de {tratamiento}? Tenemos cuotas sin intereses.',
    ],
    [
      'Bienvenida por correo',
      'email',
      'Hola {nombre}, gracias por elegir Clínica Dental Sonrisa. Aquí tienes todo lo que necesitas para tu primera visita.',
    ],
  ].map(([name, channel, body], i) => ({
    _id: id(),
    tenantId,
    name,
    channel,
    body,
    ...(channel === 'email'
      ? { subject: 'Bienvenido a Clínica Dental Sonrisa' }
      : {}),
    ...stamp(ago((30 - i * 4) * DAY)),
  }));

  const emailTemplates: Doc[] = [
    [
      'Boletín mensual',
      'Novedades de tu clínica',
      '<h1>Novedades de noviembre</h1><p>Nuevo equipo de rayos X digital y horario extendido los sábados.</p>',
    ],
    [
      'Promoción de temporada',
      'Tu sonrisa merece un regalo',
      '<h1>Blanqueamiento a S/ 450</h1><p>Solo hasta el 30 de noviembre. Reserva por WhatsApp.</p>',
    ],
    [
      'Bienvenida de paciente',
      'Bienvenido a Clínica Dental Sonrisa',
      '<h1>¡Bienvenido!</h1><p>Llega 10 minutos antes de tu cita y trae tu DNI.</p>',
    ],
  ].map(([name, subject, html], i) => ({
    _id: id(),
    tenantId,
    name,
    mode: 'html',
    subject,
    preheader: 'Clínica Dental Sonrisa',
    html,
    ...stamp(ago((25 - i * 6) * DAY)),
  }));

  // ---------- Links cortos y sus clics ----------
  const links: Doc[] = [];
  const clicks: Doc[] = [];
  const linkDefs = [
    ['Agenda tu cita', 'https://clinicasonrisa.pe/agenda', 'whatsapp', 140],
    [
      'Promo blanqueamiento',
      'https://clinicasonrisa.pe/blanqueamiento',
      'sms',
      95,
    ],
    ['Blog: 5 hábitos', 'https://clinicasonrisa.pe/blog/habitos', 'email', 60],
    [
      'Ubicación en Google Maps',
      'https://maps.google.com/?q=Av.+Larco+123+Miraflores',
      'whatsapp',
      45,
    ],
    ['Reseñas en Google', 'https://g.page/clinicasonrisa/review', 'other', 22],
  ] as const;
  const devices = ['mobile', 'mobile', 'mobile', 'desktop', 'tablet'];
  const browsers = [
    'Chrome',
    'Safari',
    'Chrome',
    'Samsung Internet',
    'Firefox',
  ];
  const oses = ['Android', 'iOS', 'Android', 'Windows', 'macOS'];
  const cities = [
    'Lima',
    'Lima',
    'Miraflores',
    'San Isidro',
    'Surco',
    'Arequipa',
  ];
  const referers = [
    'wa.me',
    'instagram.com',
    'facebook.com',
    '',
    'mail.google.com',
  ];
  linkDefs.forEach(([title, destination, channel, total], li) => {
    const lid = id();
    let unique = 0;
    let lastAt = ago(30 * DAY);
    for (let k = 0; k < total; k++) {
      const at = ago(Math.floor(r() * 29 * DAY) + Math.floor(r() * 12) * HOUR);
      const isUnique = k % 4 !== 3;
      if (isUnique) unique++;
      if (at > lastAt) lastAt = at;
      const v = Math.floor(r() * 5);
      clicks.push({
        _id: id(),
        tenantId,
        linkId: lid,
        at,
        device: devices[v],
        browser: browsers[v],
        os: oses[v],
        country: 'PE',
        city: cities[Math.floor(r() * cities.length)],
        language: 'es-PE',
        refererHost: referers[li % referers.length] || undefined,
        visitorId: `v${li}-${k % 70}`,
        isBot: false,
        isUnique,
      });
    }
    links.push({
      _id: lid,
      tenantId,
      code: `s${suffix.slice(-5)}${li}`,
      domain: '',
      destination,
      title,
      channel,
      status: li === 4 ? 'paused' : 'active',
      utm: { source: channel, medium: 'maya', campaign: 'demo' },
      clicks: total,
      uniqueClicks: unique,
      botClicks: 0,
      lastClickAt: lastAt,
      createdBy: admin._id,
      ...stamp(ago((45 - li * 6) * DAY)),
    });
  });

  // ---------- Formularios y envíos ----------
  const forms: Doc[] = [];
  const submissions: Doc[] = [];
  const formDefs = [
    { name: 'Agenda tu evaluación (web)', tags: ['web'], count: 9 },
    { name: 'Landing blanqueamiento', tags: ['blanqueamiento'], count: 6 },
  ];
  const fromForm = customers.filter((c) => c.source === 'form');
  formDefs.forEach((f, fi) => {
    const fid = id();
    let lastAt = ago(60 * DAY);
    for (let k = 0; k < f.count; k++) {
      const c = fromForm[(k + fi) % fromForm.length] ?? customers[k];
      const at = ago(Math.floor(r() * 50 * DAY) + HOUR);
      if (at > lastAt) lastAt = at;
      submissions.push({
        _id: id(),
        tenantId,
        formId: fid,
        customerId: c._id,
        data: {
          name: c.name,
          phone: c.phone,
          email: c.email ?? '',
          tratamiento: ['Limpieza', 'Blanqueamiento', 'Ortodoncia', 'Implante'][
            k % 4
          ],
          mensaje: 'Quisiera una cita esta semana, de preferencia en la tarde.',
        },
        pageUrl:
          fi === 0
            ? 'https://clinicasonrisa.pe/contacto'
            : 'https://clinicasonrisa.pe/blanqueamiento',
        referer: 'https://www.google.com/',
        ...stamp(at),
      });
    }
    forms.push({
      _id: fid,
      tenantId,
      name: f.name,
      publicKey: `demo${suffix}${fi}`,
      fields: [
        {
          key: 'name',
          label: 'Nombre completo',
          type: 'text',
          required: true,
          mapTo: 'name',
        },
        {
          key: 'phone',
          label: 'Celular',
          type: 'tel',
          required: true,
          mapTo: 'phone',
        },
        {
          key: 'email',
          label: 'Correo',
          type: 'email',
          required: false,
          mapTo: 'email',
        },
        {
          key: 'tratamiento',
          label: '¿Qué tratamiento te interesa?',
          type: 'select',
          required: true,
          options: ['Limpieza', 'Blanqueamiento', 'Ortodoncia', 'Implante'],
          mapTo: '',
        },
        {
          key: 'mensaje',
          label: 'Mensaje',
          type: 'textarea',
          required: false,
          mapTo: 'notes',
        },
      ],
      tags: f.tags,
      active: true,
      successMessage: '¡Gracias! Te escribimos por WhatsApp en minutos.',
      submissionCount: f.count,
      lastSubmissionAt: lastAt,
      createdBy: admin._id,
      ...stamp(ago(80 * DAY)),
    });
  });
  for (const c of fromForm)
    Object.assign(c, { formId: forms[0]._id, formIds: [forms[0]._id] });

  // ---------- Listas ----------
  const ortho = customers.filter((_, i) => i % 3 === 0);
  const white = customers.filter((_, i) => i % 4 === 1);
  const lists: Doc[] = [
    {
      _id: id(),
      tenantId,
      name: 'Pacientes de ortodoncia',
      type: 'static',
      memberIds: ortho.map((c) => c._id),
      memberCount: ortho.length,
      color: '#6366F1',
      description: 'Pacientes en tratamiento de brackets o alineadores',
    },
    {
      _id: id(),
      tenantId,
      name: 'Interesados en blanqueamiento',
      type: 'static',
      memberIds: white.map((c) => c._id),
      memberCount: white.length,
      color: '#F59E0B',
      description: 'Preguntaron por blanqueamiento en los últimos 60 días',
    },
    {
      _id: id(),
      tenantId,
      name: 'Pacientes frecuentes',
      type: 'dynamic',
      rules: [
        { field: 'tags', operator: 'has_any', value: ['paciente frecuente'] },
      ],
      memberCount: customers.filter((c) =>
        (c.tags as string[]).includes('paciente frecuente'),
      ).length,
      color: '#10B981',
      description: 'Se actualiza sola con la etiqueta "paciente frecuente"',
    },
  ].map((l, i) => ({
    ...l,
    createdBy: admin._id,
    ...stamp(ago((70 - i * 10) * DAY)),
  }));

  // ---------- Automatizaciones (por evento: no corren solas en la demo) ----------
  const autoDefs: {
    name: string;
    trigger: Record<string, unknown>;
    steps: ({ id: string; type: string } & Record<string, unknown>)[];
    active: boolean;
  }[] = [
    {
      name: 'Bienvenida a nuevos contactos',
      trigger: { type: 'contact_created' },
      steps: [
        {
          id: 's1',
          type: 'whatsapp',
          text: 'Hola {nombre}, gracias por escribir a Clínica Dental Sonrisa. ¿En qué tratamiento estás interesado?',
        },
        { id: 's2', type: 'wait', minutes: 1440 },
        {
          id: 's3',
          type: 'condition',
          condition: 'not_replied',
          otherwise: 'exit',
        },
        {
          id: 's4',
          type: 'reminder',
          title: 'Llamar al nuevo contacto',
          dueMinutes: 60,
        },
      ],
      active: true,
    },
    {
      name: 'Formulario web → asignar y agendar',
      trigger: { type: 'form_submitted', formId: forms[0]._id },
      steps: [
        { id: 's1', type: 'tag', tag: 'web' },
        { id: 's2', type: 'assign', userId: sellers[0]._id },
        {
          id: 's3',
          type: 'whatsapp',
          text: 'Hola {nombre}, recibimos tu solicitud. ¿Te acomoda mañana a las 10:00 o a las 16:00?',
        },
      ],
      active: true,
    },
    {
      name: 'Presupuesto enviado → seguimiento a los 2 días',
      trigger: { type: 'stage_changed', stage: 'proposal' },
      steps: [
        { id: 's1', type: 'wait', minutes: 2880 },
        {
          id: 's2',
          type: 'whatsapp',
          text: 'Hola {nombre}, ¿pudiste revisar tu presupuesto? Tenemos cuotas sin intereses.',
        },
        {
          id: 's3',
          type: 'reminder',
          title: 'Llamar por el presupuesto',
          dueMinutes: 120,
        },
      ],
      active: true,
    },
    {
      name: 'Etiqueta "ortodoncia" → recordatorio mensual',
      trigger: { type: 'tag_added', tag: 'ortodoncia' },
      steps: [
        { id: 's1', type: 'wait', minutes: 43200 },
        {
          id: 's2',
          type: 'whatsapp',
          text: 'Hola {nombre}, te toca tu control mensual de ortodoncia. ¿Te agendo?',
        },
      ],
      active: false,
    },
  ];
  const automations: Doc[] = [];
  const runs: Doc[] = [];
  autoDefs.forEach((a, ai) => {
    const aid = id();
    automations.push({
      _id: aid,
      tenantId,
      name: a.name,
      trigger: a.trigger,
      steps: a.steps,
      active: a.active,
      exitOnReply: true,
      sendWindow: { from: '09:00', to: '20:00' },
      createdBy: admin._id,
      ...stamp(ago((75 - ai * 8) * DAY)),
    });
    const n = [14, 9, 7, 4][ai];
    for (let k = 0; k < n; k++) {
      const c = customers[(k * 3 + ai * 5) % customers.length];
      const enrolled = ago(Math.floor(r() * 50 * DAY) + 2 * DAY);
      const replied = k % 3 === 0;
      const finished = new Date(enrolled.getTime() + (replied ? 6 : 26) * HOUR);
      runs.push({
        _id: id(),
        tenantId,
        automationId: aid,
        customerId: c._id,
        status: replied ? 'exited' : 'completed',
        ...(replied ? { exitReason: 'replied' } : {}),
        replied,
        stepIndex: replied ? 1 : a.steps.length,
        enrolledAt: enrolled,
        nextAt: finished,
        finishedAt: finished,
        log: a.steps.slice(0, replied ? 1 : a.steps.length).map((s, j) => ({
          stepId: s.id,
          type: s.type,
          at: new Date(enrolled.getTime() + j * HOUR),
          result: 'ok',
        })),
        ...stamp(enrolled),
      });
    }
  });

  // ---------- Recuperación de clientes ----------
  const recipientOf = (c: Doc, stage: string, sent: boolean, at: Date) => ({
    conversationId: String(
      conversations.find((x) => x.customerId === c._id)?._id ?? '',
    ),
    customerId: String(c._id),
    name: c.name,
    phone: c.phone,
    lastMessageAt: ago(45 * DAY),
    stage,
    note:
      stage === 'vio_precio'
        ? 'Preguntó precio de ortodoncia y no volvió'
        : 'Dijo que lo pensaría',
    insideWindow: false,
    reason: 'Conversación sin cierre hace más de 30 días',
    sendStatus: sent ? 'sent' : 'pending',
    ...(sent ? { sentAt: at } : {}),
  });
  const doneAt = ago(9 * DAY);
  const recovery: Doc[] = [
    {
      _id: id(),
      tenantId,
      name: 'Recuperar presupuestos de ortodoncia',
      status: 'done',
      lookbackDays: 120,
      context: 'Pacientes que pidieron precio de ortodoncia y no agendaron.',
      timezone: 'America/Lima',
      language: 'es',
      accountId: String(account._id),
      analysis: {
        total: 18,
        processed: 18,
        analyzedAt: ago(10 * DAY),
        headline: '18 pacientes interesados en ortodoncia quedaron sin cita',
        summary:
          'La mayoría preguntó precio y no recibió seguimiento. 6 tenían objeción de precio y responden bien a cuotas.',
        insights: [
          'El 60 % escribió fuera de horario y nadie respondió hasta el día siguiente.',
          'La objeción más común es el precio: ofrecer cuotas sin intereses.',
          'La mejor hora para escribir es entre 7 y 9 p. m.',
        ],
        hourHistogram: Array.from({ length: 24 }, (_, h) =>
          h >= 19 && h <= 21 ? 5 : h >= 9 && h <= 18 ? 2 : 0,
        ),
        bestHour: 20,
        insideWindow: 0,
      },
      segments: [
        {
          key: 'vio_precio',
          name: 'Vieron el precio',
          description: 'Preguntaron precio y no respondieron después',
          strategy: 'Ofrecer evaluación a S/ 80 y cuotas sin intereses',
          color: '#F59E0B',
          enabled: true,
          recipients: customers
            .slice(0, 10)
            .map((c, k) =>
              recipientOf(
                c,
                'vio_precio',
                true,
                new Date(doneAt.getTime() + k * MIN),
              ),
            ),
          message:
            'Hola {nombre}, ¿sigues interesado en tu ortodoncia? Este mes la evaluación cuesta S/ 80 y hay cuotas sin intereses.',
          templateName: 'control_ortodoncia',
          templateStatus: 'APPROVED',
          sendAt: doneAt,
          batchSize: 10,
          batchIntervalMinutes: 15,
          sendStatus: 'done',
        },
        {
          key: 'objecion',
          name: 'Objeción de precio',
          description: 'Dijeron que estaba caro',
          strategy: 'Mostrar plan de cuotas',
          color: '#EF4444',
          enabled: true,
          recipients: customers
            .slice(10, 18)
            .map((c, k) =>
              recipientOf(
                c,
                'objecion',
                true,
                new Date(doneAt.getTime() + (k + 10) * MIN),
              ),
            ),
          message:
            'Hola {nombre}, puedes empezar tu tratamiento con cuotas desde S/ 320 al mes. ¿Te cuento cómo?',
          templateName: 'control_ortodoncia',
          templateStatus: 'APPROVED',
          sendAt: doneAt,
          batchSize: 10,
          batchIntervalMinutes: 15,
          sendStatus: 'done',
        },
      ],
      excluded: [],
      ...stamp(ago(11 * DAY)),
    },
    {
      _id: id(),
      tenantId,
      name: 'Pacientes sin control en 6 meses',
      status: 'review',
      lookbackDays: 180,
      context: 'Pacientes que no vuelven a su control semestral.',
      timezone: 'America/Lima',
      language: 'es',
      accountId: String(account._id),
      analysis: {
        total: 12,
        processed: 12,
        analyzedAt: ago(DAY),
        headline: '12 pacientes no vinieron a su control semestral',
        summary:
          'Todos fueron atendidos antes; un recordatorio amable suele bastar.',
        insights: ['Responden mejor los sábados por la mañana.'],
        hourHistogram: Array.from({ length: 24 }, (_, h) =>
          h >= 9 && h <= 12 ? 3 : 0,
        ),
        bestHour: 10,
        insideWindow: 0,
      },
      segments: [
        {
          key: 'cliente',
          name: 'Pacientes antiguos',
          description: 'Ya se atendieron en la clínica',
          strategy: 'Recordatorio de control con turno sugerido',
          color: '#10B981',
          enabled: true,
          recipients: customers
            .slice(18, 30)
            .map((c) => recipientOf(c, 'cliente', false, now)),
          message:
            'Hola {nombre}, ya toca tu control semestral. ¿Te reservo el sábado a las 10:00?',
          sendStatus: 'idle',
        },
      ],
      excluded: [],
      ...stamp(ago(DAY)),
    },
  ];

  // ---------- Prospección (convenios corporativos) ----------
  const searchId = id();
  const companies = [
    ['Constructora Andina S.A.C.', 'Construcción', 86],
    ['Banco del Pacífico Sur', 'Banca', 92],
    ['Colegio San Martín de Miraflores', 'Educación', 78],
    ['Call Center Perú Contacta', 'Servicios', 74],
    ['Clínica Veterinaria Patitas', 'Salud', 41],
    ['Agencia de Viajes Nazca Tours', 'Turismo', 55],
    ['Minera Cordillera Azul', 'Minería', 88],
  ] as const;
  const prospects: Doc[] = companies.map(([name, industry, fit], i) => {
    const researched = i < 4;
    const status = [
      'qualified',
      'contacted',
      'meeting',
      'converted',
      'new',
      'discarded',
      'new',
    ][i];
    return {
      _id: id(),
      tenantId,
      searchId,
      name,
      industry,
      website: `https://www.${name
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 14)}.pe`,
      phone: `5114${String(400000 + i * 1111)}`,
      address: 'Lima, Perú',
      description: `Empresa de ${industry.toLowerCase()} con más de 100 colaboradores en Lima.`,
      source: 'google_maps',
      rating: 4 + (i % 5) / 10,
      reviewsCount: 40 + i * 13,
      fitScore: fit,
      fitReason:
        fit >= 70
          ? 'Más de 100 colaboradores en Lima: buen candidato para convenio dental'
          : 'Empresa pequeña, convenio poco probable',
      status,
      tags: ['convenio'],
      ...(status === 'converted' ? { leadId: leads[0]._id } : {}),
      research: researched
        ? {
            state: 'done',
            steps: [
              { key: 'place', label: 'Google Maps', status: 'ok' },
              { key: 'website', label: 'Sitio web', status: 'ok' },
              { key: 'ai', label: 'Análisis con IA', status: 'ok' },
            ],
            emails: [
              `rrhh@${name
                .toLowerCase()
                .replace(/[^a-z]/g, '')
                .slice(0, 14)}.pe`,
            ],
            people: [{ name: 'Gerencia de RR. HH.', role: 'Recursos Humanos' }],
            ai: {
              summary: `${name} tiene un equipo grande en Lima y programas de bienestar para su personal.`,
              fitReason: 'Ofrece beneficios de salud a sus colaboradores',
              digitalMaturity: 'Media',
              socialPresence: 'Activa en LinkedIn',
              strengths: ['Equipo numeroso', 'Programa de bienestar'],
              weaknesses: ['Sin convenio dental vigente'],
              opportunities: [
                'Convenio con descuento para colaboradores y familias',
              ],
              painPoints: ['Ausentismo por urgencias dentales'],
              talkingPoints: [
                'Atención de urgencias el mismo día',
                'Tarifa preferencial por volumen',
              ],
              approach:
                'Contactar a RR. HH. con propuesta de convenio corporativo',
              sizeEstimate: '100–500 colaboradores',
            },
          }
        : { state: 'idle' },
      ...(i === 1
        ? {
            material: {
              state: 'done',
              generatedAt: ago(3 * DAY),
              diagnosis:
                'El banco no tiene convenio dental y su personal trabaja cerca de Miraflores.',
              plan: {
                vision:
                  'Ser la clínica de referencia para los colaboradores del banco.',
                quickWins: ['Charla de salud bucal gratuita en la sede'],
                initiatives: [
                  'Convenio con 15 % de descuento',
                  'Jornada de evaluación en oficina',
                ],
                kpis: ['Colaboradores atendidos por mes'],
                suggestedServices: ['Limpieza', 'Blanqueamiento', 'Ortodoncia'],
              },
              outreach:
                'Hola, somos Clínica Dental Sonrisa en Miraflores. Queremos proponerles un convenio dental para sus colaboradores.',
            },
          }
        : { material: { state: 'idle' } }),
      ...stamp(ago((20 - i) * DAY)),
    };
  });
  const prospectSearches: Doc[] = [
    {
      _id: searchId,
      tenantId,
      name: 'Convenios corporativos en Lima',
      services: 'Convenios dentales para colaboradores de empresas',
      idealCustomer: 'Empresas con más de 100 colaboradores en Lima',
      location: 'Lima, Perú',
      industries: ['Banca', 'Educación', 'Construcción', 'Minería'],
      maxResults: 20,
      status: 'done',
      progress: 100,
      found: prospects.length,
      ...stamp(ago(21 * DAY)),
    },
  ];

  // ---------- Productos y cotizaciones ----------
  const productDefs = [
    ['Limpieza dental', 120],
    ['Blanqueamiento LED', 450],
    ['Endodoncia', 650],
    ['Carillas de porcelana (por pieza)', 1800],
    ['Implante dental', 2900],
    ['Ortodoncia con brackets', 3800],
    ['Evaluación de ortodoncia', 80],
  ] as const;
  const products: Doc[] = productDefs.map(([name, price], i) => ({
    _id: id(),
    tenantId,
    name,
    price,
    unit: 'unidad',
    taxIncluded: true,
    active: true,
    source: 'manual',
    ...stamp(ago((85 - i) * DAY)),
  }));
  const quoteStatus: Record<string, string> = {
    proposal: 'sent',
    negotiation: 'viewed',
    won: 'paid',
    lost: 'rejected',
  };
  const quotes: Doc[] = [];
  let seq = 0;
  for (const lead of leads) {
    const status = quoteStatus[String(lead.stage)];
    if (!status) continue;
    seq++;
    const p = products[seq % (products.length - 1)];
    const qty = String(p.name).startsWith('Carillas') ? 4 : 1;
    const total = Number(p.price) * qty + (seq % 2 ? 80 : 0);
    const base = Math.round((total / 1.18) * 100) / 100;
    const igv = Math.round((total - base) * 100) / 100;
    const sentAt = new Date((lead.createdAt as Date).getTime() + DAY);
    const items = [
      {
        productId: p._id,
        name: p.name,
        unit: 'unidad',
        quantity: qty,
        unitPrice: p.price,
        discountPct: 0,
        taxIncluded: true,
      },
      ...(seq % 2
        ? [
            {
              productId: products[6]._id,
              name: products[6].name,
              unit: 'unidad',
              quantity: 1,
              unitPrice: 80,
              discountPct: 0,
              taxIncluded: true,
            },
          ]
        : []),
    ].map((it) => {
      const t = Number(it.unitPrice) * it.quantity;
      const b = Math.round((t / 1.18) * 100) / 100;
      return { ...it, base: b, igv: Math.round((t - b) * 100) / 100, total: t };
    });
    quotes.push({
      _id: id(),
      tenantId,
      leadId: lead._id,
      seq,
      number: `COT-${String(seq).padStart(4, '0')}`,
      publicToken: `demo${suffix}q${seq}`,
      items,
      igvRate: 18,
      currency: 'PEN',
      subtotal: base,
      discount: 0,
      igv,
      total,
      validUntil: new Date(sentAt.getTime() + 15 * DAY),
      notes:
        'Incluye evaluación y controles durante el tratamiento. Cuotas sin intereses con tarjeta.',
      status,
      sentVia: ['whatsapp'],
      sentAt,
      ...(status !== 'sent'
        ? { viewedAt: new Date(sentAt.getTime() + 3 * HOUR) }
        : {}),
      ...(status === 'paid'
        ? {
            acceptedAt: new Date(sentAt.getTime() + DAY),
            paidAt: new Date(sentAt.getTime() + 2 * DAY),
          }
        : {}),
      ...(status === 'rejected'
        ? {
            rejectedAt: new Date(sentAt.getTime() + 2 * DAY),
            rejectReason: 'Encontró un precio menor',
          }
        : {}),
      ...stamp(sentAt),
    });
  }

  // ---------- Llamadas de WhatsApp ----------
  const calls: Doc[] = [];
  for (let k = 0; k < 18; k++) {
    const c = customers[(k * 7) % customers.length];
    const inbound = k % 3 !== 2;
    const status =
      k % 5 === 4 ? 'missed' : k % 11 === 10 ? 'rejected' : 'completed';
    const startedAt = ago(Math.floor(r() * 25 * DAY) + 2 * HOUR);
    const dur = status === 'completed' ? 60 + Math.floor(r() * 420) : 0;
    const by = seller(k);
    const conv = conversations.find((x) => x.customerId === c._id);
    calls.push({
      _id: id(),
      tenantId,
      accountId: account._id,
      waCallId: `demo-${suffix}-call-${k}`,
      direction: inbound ? 'inbound' : 'outbound',
      status,
      contact: c.phone,
      contactName: c.name,
      customerId: c._id,
      ...(conv ? { conversationId: conv._id } : {}),
      startedAt,
      ...(status === 'completed'
        ? {
            answeredBy: by._id,
            answeredByName: by.name,
            connectedAt: new Date(startedAt.getTime() + 8_000),
            endedAt: new Date(startedAt.getTime() + 8_000 + dur * 1000),
            durationSec: dur,
            endReason: 'hangup',
          }
        : {
            endedAt: new Date(startedAt.getTime() + 30_000),
            endReason: status,
          }),
      logged: true,
      missedReplySent: true,
      ...(k === 0
        ? {
            transcript: [
              {
                who: 'cliente',
                text: 'Hola, quería saber si atienden hoy una urgencia.',
                at: startedAt,
              },
              {
                who: 'agente',
                text: 'Sí, tenemos un espacio a las 5:30 p. m. ¿Lo reservo?',
                at: new Date(startedAt.getTime() + 20_000),
              },
              {
                who: 'cliente',
                text: 'Sí, por favor.',
                at: new Date(startedAt.getTime() + 35_000),
              },
            ],
            voiceSummary:
              'Paciente con dolor de muela; se reservó urgencia hoy a las 5:30 p. m.',
          }
        : {}),
      ...stamp(startedAt),
    });
  }

  // ---------- No contactar ----------
  const suppression: Doc[] = [
    {
      phone: '51900000999',
      name: 'Contacto que pidió no recibir mensajes',
      reason: 'Respondió "BAJA" a una campaña',
      source: 'reply',
    },
    {
      phone: '51900000998',
      name: 'Número equivocado',
      reason: 'No es paciente de la clínica',
      source: 'inbox',
    },
    {
      email: 'rebote@demo.mayacrm.site',
      name: 'Correo inválido',
      reason: 'El correo rebotó',
      source: 'bounce',
    },
  ].map((s, i) => ({
    _id: id(),
    tenantId,
    ...s,
    createdBy: admin._id,
    ...stamp(ago((15 - i * 4) * DAY)),
  }));

  // ---------- Reparto de leads ----------
  const ruleId = id();
  const routingRules: Doc[] = [
    {
      _id: ruleId,
      tenantId,
      name: 'Reparto equitativo de pacientes nuevos',
      appliesTo: 'both',
      match: { kind: 'any' },
      mode: 'round_robin',
      onTimeout: 'next',
      active: true,
      order: 0,
      members: sellers.map((s) => ({ userId: s._id, weight: 1 })),
      cursor: 0,
      responseMinutes: 15,
      ...stamp(ago(80 * DAY)),
    },
  ];
  const routingAssignments: Doc[] = leads.slice(0, 14).map((l, k) => {
    const at = l.createdAt as Date;
    const status = k % 6 === 5 ? 'expired' : 'answered';
    return {
      _id: id(),
      tenantId,
      ruleId,
      leadId: l._id,
      customerId: l.customerId,
      userId: l.ownerId,
      reason: status === 'expired' ? 'timeout_next' : 'auto',
      status,
      at,
      dueAt: new Date(at.getTime() + 15 * MIN),
      detail:
        status === 'expired'
          ? 'No respondió en 15 min; pasó al siguiente'
          : 'Asignado por turno',
      ...stamp(at),
    };
  });

  // ---------- Actividad: notas, llamadas y tareas ----------
  const contactActivities: Doc[] = [];
  const notes = [
    [
      'note',
      'Prefiere citas en la tarde',
      'Trabaja hasta las 5 p. m.; ofrecer turnos desde las 6.',
    ],
    [
      'call',
      'Llamada de seguimiento',
      'Confirmó interés; espera el presupuesto por WhatsApp.',
    ],
    [
      'whatsapp',
      'Envió fotos de su sonrisa',
      'Se pidió evaluación presencial para diagnóstico.',
    ],
    [
      'meeting',
      'Evaluación en clínica',
      'Se hizo radiografía panorámica; candidato a implante.',
    ],
    ['note', 'Alergia a la penicilina', 'Registrar en su historia clínica.'],
  ] as const;
  customers.forEach((c, i) => {
    const owner =
      sellers.find((s) => s._id.equals(c.ownerId as never)) ?? seller(i);
    contactActivities.push({
      _id: id(),
      tenantId,
      customerId: c._id,
      type: 'assignment',
      title: `Asignado a ${String(owner.name)}`,
      toUserId: owner._id,
      at: c.createdAt,
      ...stamp(c.createdAt as Date),
    });
    for (let k = 0; k < 2; k++) {
      const [type, title, body] = notes[(i + k) % notes.length];
      const at = ago(Math.floor(r() * 40 * DAY) + HOUR);
      contactActivities.push({
        _id: id(),
        tenantId,
        customerId: c._id,
        type,
        title,
        body,
        at,
        createdBy: owner._id,
        ...stamp(at),
      });
    }
  });

  const leadActivities: Doc[] = [];
  const order = [
    'new',
    'contacted',
    'qualified',
    'proposal',
    'negotiation',
    'won',
  ];
  leads.forEach((l, i) => {
    const created = (l.createdAt as Date).getTime();
    const stage = String(l.stage);
    const upto = stage === 'lost' ? 3 : Math.max(0, order.indexOf(stage));
    for (let s = 1; s <= upto; s++) {
      const at = new Date(Math.min(t0 - HOUR, created + s * DAY));
      leadActivities.push({
        _id: id(),
        tenantId,
        leadId: l._id,
        type: 'stage_change',
        title: `Pasó a ${order[s]}`,
        at,
        createdBy: l.ownerId,
        ...stamp(at),
      });
    }
    const noteAt = new Date(Math.min(t0 - 2 * HOUR, created + 2 * HOUR));
    leadActivities.push({
      _id: id(),
      tenantId,
      leadId: l._id,
      type: i % 2 ? 'call' : 'whatsapp',
      title:
        i % 2
          ? 'Llamada: resolvió dudas del tratamiento'
          : 'Envió presupuesto por WhatsApp',
      body: 'El paciente quiere empezar este mes; consultó por cuotas.',
      at: noteAt,
      createdBy: l.ownerId,
      ...stamp(noteAt),
    });
    if (l.status === 'open') {
      const future = i % 3 !== 0;
      const due = future
        ? new Date(t0 + ((i % 5) + 1) * DAY)
        : ago((i % 4) * DAY + DAY);
      leadActivities.push({
        _id: id(),
        tenantId,
        leadId: l._id,
        type: 'task',
        title: [
          'Llamar para confirmar cita',
          'Enviar presupuesto actualizado',
          'Confirmar pago de la cuota inicial',
        ][i % 3],
        dueAt: due,
        done: !future && i % 2 === 0,
        ...(!future && i % 2 === 0 ? { doneAt: due } : {}),
        ...(!future ? { remindedAt: due } : {}),
        remindByWhatsApp: false,
        createdBy: l.ownerId,
        at: ago(2 * DAY),
        ...stamp(ago(2 * DAY)),
      });
    }
  });

  // ---------- Reportes ----------
  const reports: Doc[] = [
    {
      name: 'Ventas ganadas por vendedor',
      source: 'leads',
      metric: 'sum_value',
      groupBy: 'owner',
      chart: 'bar',
      pinned: true,
      filters: { dateField: 'closedAt', range: 'last_90', status: 'won' },
    },
    {
      name: 'Oportunidades por etapa',
      source: 'leads',
      metric: 'count',
      groupBy: 'stage',
      chart: 'bar',
      pinned: true,
      filters: { dateField: 'createdAt', range: 'last_90' },
    },
    {
      name: 'Contactos nuevos por mes',
      source: 'customers',
      metric: 'count',
      groupBy: 'month',
      chart: 'line',
      pinned: false,
      filters: { dateField: 'createdAt', range: 'this_year' },
    },
    {
      name: 'Conversaciones por canal',
      source: 'conversations',
      metric: 'count',
      groupBy: 'channel',
      chart: 'bar',
      pinned: false,
      filters: { dateField: 'createdAt', range: 'last_30' },
    },
  ].map((rep, i) => ({
    _id: id(),
    tenantId,
    ...rep,
    sharedRoles: ['MANAGER'],
    createdBy: admin._id,
    ...stamp(ago((50 - i * 5) * DAY)),
  }));

  // ---------- Bitácora de actividad (auditoría) ----------
  const auditDefs: [string, Doc, string, number][] = [
    ['auth.login', admin, 'session', 0.2],
    ['auth.login', sellers[0], 'session', 0.5],
    ['customers.import', admin, 'customer', 60],
    ['channels.connected', admin, 'whatsapp', 85],
    ['users.created', admin, 'user', 88],
    ['users.created', admin, 'user', 88],
    ['users.created', admin, 'user', 88],
    ['roles.updated', admin, 'role', 70],
    ['customers.bulk_assigned', admin, 'customer', 30],
    ['customers.export', sellers[1], 'customer', 12],
    ['conversations.export', admin, 'conversation', 8],
    ['tenant.updated', admin, 'tenant', 40],
    ['auth.login_failed', sellers[2], 'session', 3],
    ['api_keys.created', admin, 'api_key', 25],
  ];
  const audit: Doc[] = auditDefs.map(([action, u, resource, days]) => ({
    _id: id(),
    tenantId,
    action,
    userId: u._id,
    actorEmail: u.email,
    actorRole: u.role,
    resource,
    success: action !== 'auth.login_failed',
    ip: '190.236.0.10',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131',
    createdAt: ago(days * DAY),
  }));

  // ---------- Base de conocimiento e historial del agente ----------
  const knowledgeDocs: Doc[] = [
    ['Lista de precios 2026.pdf', 'application/pdf', 14, 9800],
    [
      'Preguntas frecuentes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      22,
      15400,
    ],
    ['Indicaciones post tratamiento.pdf', 'application/pdf', 9, 6100],
  ].map(([filename, contentType, chunkCount, charCount], i) => ({
    _id: id(),
    tenantId,
    agentId: agent._id,
    filename,
    contentType,
    status: 'ready',
    chunkCount,
    charCount,
    ...stamp(ago((60 - i * 10) * DAY)),
  }));
  const promptVersions: Doc[] = [
    {
      prompt: String(agent.systemPrompt).split('\n').slice(0, 4).join('\n'),
      source: 'manual',
      note: 'Primera versión',
    },
    {
      prompt: String(agent.systemPrompt),
      source: 'suggestion',
      note: 'Se agregó derivar financiamiento a una persona',
    },
  ].map((v, i) => ({
    _id: id(),
    tenantId,
    agentId: agent._id,
    ...v,
    ...stamp(ago((60 - i * 30) * DAY)),
  }));
  const ws = conversations.filter((c) => c.channel === 'whatsapp');
  const promptReviews: Doc[] = [
    {
      _id: id(),
      tenantId,
      agentId: agent._id,
      days: 30,
      conversationsAnalyzed: 30,
      summary:
        'El agente responde rápido y agenda bien. Pierde ventas cuando preguntan por cuotas o seguros.',
      suggestions: [
        {
          title: 'Responder sobre cuotas antes de derivar',
          problem:
            '6 pacientes preguntaron por cuotas y esperaron a una persona.',
          evidence: ws.slice(0, 2).map((c) => ({
            conversationId: String(c._id),
            excerpt: '¿Puedo pagar en cuotas?',
          })),
          action: 'add',
          text: 'Si preguntan por cuotas: hay hasta 12 cuotas sin intereses con tarjeta. Luego ofrece la evaluación.',
          status: 'pending',
        },
        {
          title: 'Confirmar la dirección al agendar',
          problem:
            'Algunos pacientes preguntaron dónde queda la clínica después de agendar.',
          evidence: ws.slice(2, 3).map((c) => ({
            conversationId: String(c._id),
            excerpt: '¿Dónde queda la clínica?',
          })),
          action: 'add',
          text: 'Al confirmar una cita, incluye la dirección: Av. Larco 123, Miraflores.',
          status: 'applied',
        },
      ],
      ...stamp(ago(5 * DAY)),
    },
  ];

  return [
    { model: 'Campaign', docs: campaigns },
    { model: 'CampaignRecipient', docs: recipients },
    { model: 'WaTemplate', docs: waTemplates },
    { model: 'MessageTemplate', docs: messageTemplates },
    { model: 'EmailTemplate', docs: emailTemplates },
    { model: 'ShortLink', docs: links },
    { model: 'LinkClick', docs: clicks },
    { model: 'ContactForm', docs: forms },
    { model: 'FormSubmission', docs: submissions },
    { model: 'ContactList', docs: lists },
    { model: 'Automation', docs: automations },
    { model: 'AutomationRun', docs: runs },
    { model: 'RecoveryPlan', docs: recovery },
    { model: 'ProspectSearch', docs: prospectSearches },
    { model: 'Prospect', docs: prospects },
    { model: 'Product', docs: products },
    { model: 'Quote', docs: quotes },
    { model: 'Call', docs: calls },
    { model: 'SuppressionEntry', docs: suppression },
    { model: 'RoutingRule', docs: routingRules },
    { model: 'RoutingAssignment', docs: routingAssignments },
    { model: 'ContactActivity', docs: contactActivities },
    { model: 'LeadActivity', docs: leadActivities },
    { model: 'Report', docs: reports },
    { model: 'AuditEntry', docs: audit },
    { model: 'KnowledgeDoc', docs: knowledgeDocs },
    { model: 'AgentPromptVersion', docs: promptVersions },
    { model: 'AgentPromptReview', docs: promptReviews },
  ];
}
