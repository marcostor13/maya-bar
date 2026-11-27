import { Types } from 'mongoose';
import { LEAD_STAGES } from '../leads/lead-stages.catalog';

/**
 * Datos ficticios de la empresa demo (HU86): una clínica dental. Generador puro
 * y determinista (misma semilla → mismos datos) con fechas relativas a `now`.
 * Todo es inventado: nombres, teléfonos `519000001xx` y correos de
 * `demo.mayacrm.site`.
 */

export const DEMO_SLUG = 'maya-demo';
export const DEMO_EMAIL = 'demo@demo.mayacrm.site';
export const DEMO_NAME = 'Clínica Dental Sonrisa (demo)';
const DAY = 86_400_000;
const MIN = 60_000;

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

export interface DemoData {
  tenant: Doc;
  users: Doc[];
  whatsappAccount: Doc;
  agent: Doc;
  customers: Doc[];
  conversations: Doc[];
  messages: Doc[];
  leads: Doc[];
}

/** PRNG pequeño (mulberry32) para que la demo sea siempre igual. */
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

const TEAM = [
  { name: 'Valeria Ríos', email: DEMO_EMAIL, role: 'TENANT_ADMIN' },
  { name: 'Diego Paredes', email: 'diego@demo.mayacrm.site', role: 'MANAGER' },
  {
    name: 'Lucía Fernández',
    email: 'lucia@demo.mayacrm.site',
    role: 'MANAGER',
  },
  { name: 'Andrés Quispe', email: 'andres@demo.mayacrm.site', role: 'MANAGER' },
];

const PEOPLE = [
  'María Torres',
  'José Huamán',
  'Carmen Vargas',
  'Luis Mendoza',
  'Rosa Castillo',
  'Jorge Salazar',
  'Ana Gutiérrez',
  'Carlos Rojas',
  'Patricia Flores',
  'Miguel Chávez',
  'Sofía Ramírez',
  'Ricardo Díaz',
  'Gabriela Medina',
  'Fernando Ortiz',
  'Daniela Cruz',
  'Alberto Navarro',
  'Claudia Reyes',
  'Raúl Espinoza',
  'Mónica Aguilar',
  'Hugo Delgado',
  'Elena Campos',
  'Víctor Palacios',
  'Natalia Cabrera',
  'Óscar Lozano',
  'Silvia Paredes',
  'Martín Silva',
  'Lorena Cárdenas',
  'Pablo Benites',
  'Teresa Arias',
  'Iván Montes',
  'Karina Núñez',
  'Renato Vega',
];

const TREATMENTS = [
  { name: 'Limpieza dental', value: 120 },
  { name: 'Blanqueamiento', value: 450 },
  { name: 'Ortodoncia', value: 3800 },
  { name: 'Implante dental', value: 2900 },
  { name: 'Carillas de porcelana', value: 1800 },
  { name: 'Endodoncia', value: 650 },
  { name: 'Diseño de sonrisa', value: 5500 },
];

type Turn = ['c' | 'ai' | 'h', string];

/** Guiones de conversación; `{n}` = nombre de pila del cliente. */
const SCRIPTS: {
  turns: Turn[];
  escalated?: boolean;
  human?: boolean;
  unread?: number;
  ad?: boolean;
}[] = [
  {
    ad: true,
    turns: [
      ['c', 'Hola, vi su anuncio del blanqueamiento. ¿Cuánto cuesta?'],
      [
        'ai',
        '¡Hola {n}! El blanqueamiento en consultorio cuesta S/ 450 e incluye evaluación y limpieza previa. ¿Te gustaría agendar una cita esta semana?',
      ],
      ['c', 'Sí, ¿tienen el jueves en la tarde?'],
      [
        'ai',
        'Tengo el jueves a las 4:00 p. m. o a las 5:30 p. m. ¿Cuál prefieres?',
      ],
      ['c', '5:30 por favor'],
      [
        'ai',
        'Listo {n}, tu cita quedó el jueves a las 5:30 p. m. con la Dra. Ríos. Te enviaremos un recordatorio un día antes. 😊',
      ],
    ],
  },
  {
    escalated: true,
    human: true,
    turns: [
      ['c', 'Buenas, quiero información de ortodoncia para mi hija de 13 años'],
      [
        'ai',
        '¡Hola {n}! Para ortodoncia primero hacemos una evaluación con radiografía (S/ 80). El tratamiento con brackets metálicos va desde S/ 3,800. ¿Te interesa conocer las opciones de pago?',
      ],
      ['c', '¿Se puede pagar en cuotas?'],
      [
        'ai',
        'Te paso con Diego, de nuestro equipo, para que te explique los planes de pago.',
      ],
      [
        'h',
        'Hola {n}, soy Diego. Sí, tenemos cuotas mensuales sin intereses durante el tratamiento. ¿Te agendo la evaluación para el sábado?',
      ],
      ['c', 'Perfecto, el sábado en la mañana'],
    ],
  },
  {
    turns: [
      ['c', 'Hola, me duele mucho una muela, ¿atienden emergencias?'],
      [
        'ai',
        'Lo siento mucho, {n}. Sí atendemos urgencias: hoy tenemos un espacio a las 9:00 a. m. La consulta de urgencia cuesta S/ 60. ¿Te lo reservo?',
      ],
      ['c', 'Sí por favor'],
      [
        'ai',
        'Reservado, {n}. Te esperamos a las 9:00 a. m. en Av. Larco 123, Miraflores. Si el dolor aumenta, puedes tomar un analgésico que ya uses.',
      ],
    ],
  },
  {
    human: true,
    turns: [
      [
        'h',
        'Hola {n}, te recordamos tu cita de limpieza mañana a las 11:00 a. m. ¿Nos confirmas tu asistencia?',
      ],
      ['c', 'Confirmado, gracias'],
      ['h', '¡Gracias {n}! Te esperamos.'],
    ],
  },
  {
    human: true,
    turns: [
      ['c', 'Hola, ¿cuánto cuesta un implante?'],
      [
        'ai',
        'Hola {n}, el implante dental completo (implante, pilar y corona) va desde S/ 2,900. Primero hacemos una tomografía para planificarlo. ¿Quieres una evaluación?',
      ],
      ['c', 'Sí, pero quisiera una cotización formal'],
      [
        'h',
        'Hola {n}, soy Lucía. Te envío la cotización en PDF después de la evaluación. ¿Te va bien el martes a las 6:00 p. m.?',
      ],
    ],
  },
  {
    unread: 1,
    turns: [['c', 'Hola, ¿atienden los sábados?']],
  },
  {
    unread: 2,
    turns: [
      ['c', 'Buenas noches'],
      ['c', '¿Hacen carillas? Quiero cambiar mi sonrisa para mi boda'],
    ],
  },
  {
    human: true,
    turns: [
      ['h', 'Hola {n}, ¿cómo te sentiste después de la endodoncia?'],
      ['c', 'Muy bien, ya no me duele nada. Gracias'],
      ['h', 'Qué bueno. Recuerda tu control en 15 días. ¡Que tengas buen día!'],
    ],
  },
  {
    turns: [
      ['c', 'Hola, ¿tienen convenio con algún seguro?'],
      [
        'ai',
        'Hola {n}, por ahora atendemos de forma particular y emitimos boleta o factura para que solicites el reembolso a tu seguro. ¿Te ayudo con algún tratamiento?',
      ],
      ['c', 'Una limpieza'],
      [
        'ai',
        'La limpieza dental cuesta S/ 120 y dura unos 40 minutos. ¿Te agendo para esta semana?',
      ],
    ],
  },
];

export function buildDemoData(now = new Date(), seed = 86): DemoData {
  const r = rng(seed);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const t0 = now.getTime();
  const ago = (ms: number) => new Date(t0 - ms);
  const tenantId = new Types.ObjectId();

  const tenant: Doc = {
    _id: tenantId,
    name: DEMO_NAME,
    slug: DEMO_SLUG,
    email: DEMO_EMAIL,
    phone: '51900000100',
    plan: 'escala',
    legacy: true,
    demo: true,
    isActive: true,
    createdAt: ago(90 * DAY),
    updatedAt: now,
  };

  const users: Doc[] = TEAM.map((u) => ({
    _id: new Types.ObjectId(),
    ...u,
    tenantId,
    isActive: true,
    createdAt: ago(90 * DAY),
    updatedAt: now,
  }));
  const sellers = users.slice(1);

  const whatsappAccount: Doc = {
    _id: new Types.ObjectId(),
    tenantId,
    label: 'WhatsApp de la clínica (demo)',
    provider: 'cloudapi',
    phoneNumber: '+51 900 000 100',
    active: true,
    createdAt: ago(90 * DAY),
    updatedAt: now,
  };

  const agent: Doc = {
    _id: new Types.ObjectId(),
    tenantId,
    name: 'Asistente de la clínica',
    description: 'Responde precios, horarios y agenda citas.',
    systemPrompt: [
      'Eres el asistente de la Clínica Dental Sonrisa (Av. Larco 123, Miraflores, Lima).',
      'Horario: lunes a sábado de 9:00 a. m. a 8:00 p. m. Urgencias el mismo día.',
      'Precios: limpieza S/ 120, blanqueamiento S/ 450, endodoncia S/ 650, carillas desde S/ 1,800,',
      'implante desde S/ 2,900, ortodoncia desde S/ 3,800, evaluación de ortodoncia S/ 80, urgencia S/ 60.',
      'Responde breve y amable, en español de Perú, de tú. Ofrece siempre agendar una cita.',
      'Si preguntan por financiamiento, seguros o una cotización formal, deriva a una persona del equipo.',
      'No des diagnósticos: invita a una evaluación.',
    ].join('\n'),
    provider: 'auto',
    temperature: 0.3,
    maxTokens: 400,
    greeting:
      '¡Hola! Soy el asistente de la Clínica Dental Sonrisa. ¿En qué te ayudo?',
    ragEnabled: false,
    accountIds: [whatsappAccount._id],
    handoffEnabled: true,
    published: true,
    createdAt: ago(90 * DAY),
    updatedAt: now,
  };

  const customers: Doc[] = PEOPLE.map((name, i) => {
    const owner = sellers[i % sellers.length];
    const created = ago(Math.floor(r() * 88 * DAY) + DAY);
    const first = name
      .split(' ')[0]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    return {
      _id: new Types.ObjectId(),
      tenantId,
      name,
      phone: `51900000${String(101 + i)}`,
      email: i % 3 === 0 ? `${first}${101 + i}@demo.mayacrm.site` : undefined,
      tags: [
        pick(TREATMENTS).name.toLowerCase(),
        ...(i % 4 === 0 ? ['paciente frecuente'] : []),
      ],
      source: i % 5 === 0 ? 'form' : 'whatsapp',
      ownerId: owner._id,
      assignedAt: created,
      createdAt: created,
      updatedAt: created,
    };
  });

  const conversations: Doc[] = [];
  const messages: Doc[] = [];
  // 30 conversaciones: cada guion se repite con clientes distintos.
  for (let i = 0; i < 30; i++) {
    const script = SCRIPTS[i % SCRIPTS.length];
    const customer = customers[i];
    const firstName = String(customer.name).split(' ')[0];
    const owner = sellers.find((s) =>
      s._id.equals(customer.ownerId as Types.ObjectId),
    )!;
    // Las primeras conversaciones son las más recientes (arriba en la bandeja).
    const end =
      t0 -
      (i < 6 ? i * 25 * MIN + 5 * MIN : (i * 0.9 + Math.floor(r() * 3)) * DAY);
    const convId = new Types.ObjectId();
    const n = script.turns.length;
    let lastAt = new Date(end);
    script.turns.forEach(([who, text], k) => {
      const at = new Date(end - (n - 1 - k) * (2 + Math.floor(r() * 6)) * MIN);
      lastAt = at;
      messages.push({
        _id: new Types.ObjectId(),
        tenantId,
        conversationId: convId,
        direction: who === 'c' ? 'in' : 'out',
        author: who === 'c' ? 'customer' : who === 'ai' ? 'agent' : 'human',
        type: 'text',
        text: text.replace(/\{n\}/g, firstName),
        status: who === 'c' ? 'delivered' : k === n - 1 ? 'delivered' : 'read',
        ...(who === 'h' ? { sentBy: owner._id } : {}),
        at,
        createdAt: at,
        updatedAt: at,
      });
    });
    const last = script.turns[n - 1];
    conversations.push({
      _id: convId,
      tenantId,
      channel: 'whatsapp',
      accountId: whatsappAccount._id,
      agentId: agent._id,
      contact: customer.phone,
      contactName: customer.name,
      customerId: customer._id,
      lastMessageAt: lastAt,
      lastMessagePreview: last[1].replace(/\{n\}/g, firstName).slice(0, 120),
      lastMessageDirection: last[0] === 'c' ? 'in' : 'out',
      unreadCount: script.unread ?? 0,
      autoReply: !script.human,
      status: i > 20 ? 'closed' : 'open',
      escalated: !!script.escalated,
      ...(script.escalated
        ? {
            escalatedAt: lastAt,
            escalationReason: 'Consulta de financiamiento',
          }
        : {}),
      ...(script.human
        ? {
            takenOverBy: owner._id,
            takenOverByName: owner.name,
            takenOverAt: lastAt,
          }
        : {}),
      ...(script.ad
        ? {
            adReferral: {
              headline: 'Blanqueamiento dental S/ 450',
              sourceType: 'ad',
              body: 'Sonrisa más blanca en una sesión',
            },
          }
        : {}),
      createdAt: new Date(lastAt.getTime() - DAY),
      updatedAt: lastAt,
    });
  }

  // 42 oportunidades en todas las etapas del embudo, en los últimos 90 días.
  const stageWeights: [string, number][] = [
    ['new', 9],
    ['contacted', 8],
    ['qualified', 7],
    ['proposal', 6],
    ['negotiation', 4],
    ['won', 6],
    ['lost', 2],
  ];
  const leads: Doc[] = [];
  const known = new Set(LEAD_STAGES.map((s) => s.key));
  let li = 0;
  for (const [stage, count] of stageWeights) {
    if (!known.has(stage)) continue;
    for (let k = 0; k < count; k++, li++) {
      const customer = customers[li % customers.length];
      const treatment = TREATMENTS[(li * 3 + k) % TREATMENTS.length];
      const created = ago(Math.floor(r() * 85 * DAY) + 2 * DAY);
      const closed = stage === 'won' || stage === 'lost';
      const activity = new Date(
        Math.min(t0 - MIN, created.getTime() + Math.floor(r() * 10) * DAY),
      );
      leads.push({
        _id: new Types.ObjectId(),
        tenantId,
        customerId: customer._id,
        title: `${treatment.name} — ${String(customer.name)}`,
        stage,
        status: stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : 'open',
        value: treatment.value,
        currency: 'PEN',
        priority:
          treatment.value >= 2000
            ? 'high'
            : treatment.value >= 400
              ? 'medium'
              : 'low',
        ownerId: customer.ownerId,
        assignedAt: created,
        source: customer.source === 'form' ? 'form' : 'whatsapp',
        tags: [treatment.name.toLowerCase()],
        position: k,
        lastActivityAt: activity,
        ...(closed ? { closedAt: activity } : {}),
        ...(stage === 'lost'
          ? { lostReason: 'Eligió otra clínica por precio' }
          : {}),
        ...(!closed && k % 2 === 0
          ? {
              nextActionAt: new Date(t0 + (k + 1) * DAY),
              nextActionTitle: 'Llamar para confirmar evaluación',
            }
          : {}),
        createdAt: created,
        updatedAt: activity,
      });
    }
  }

  return {
    tenant,
    users,
    whatsappAccount,
    agent,
    customers,
    conversations,
    messages,
    leads,
  };
}
