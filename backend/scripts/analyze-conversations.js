/**
 * Analiza las conversaciones que el agente de IA tuvo en producción y genera un
 * reporte en Markdown: volumen, embudo de venta, latencia, dónde se cae el
 * cliente, calidad de los mensajes y (opcional) scoring cualitativo con un LLM.
 *
 * Uso:
 *   node scripts/analyze-conversations.js                        # últimos 30 días, todos los tenants
 *   node scripts/analyze-conversations.js --days 7 --tenant <id>
 *   node scripts/analyze-conversations.js --user admin@ignia.site   # resuelve el tenant por email
 *   node scripts/analyze-conversations.js --user admin@ignia.site --agent "Ventas" --vertical generico
 *   node scripts/analyze-conversations.js --channel whatsapp --out ../docs/reporte.md
 *   node scripts/analyze-conversations.js --llm --sample 25      # + rúbrica de ventas con IA
 *   node scripts/analyze-conversations.js --transcripts chats.jsonl
 *   node scripts/analyze-conversations.js --demo                 # datos sintéticos, sin Mongo
 *
 * Variables de entorno: MONGODB_URI (obligatoria salvo con --demo) y, para
 * --llm, DEEPSEEK_API_KEY | OPENAI_API_KEY | CLAUDE_API_KEY.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();

const DEFAULT_DAYS = 30;
const DEFAULT_SAMPLE = 20;
/** Un hueco mayor a esto entre mensajes se considera otra sesión, no una respuesta lenta. */
const MAX_RESPONSE_GAP_MS = 6 * 60 * 60 * 1000;
/** Mensaje del agente más largo que esto = muro de texto para WhatsApp/DM. */
const LONG_MESSAGE_CHARS = 600;

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    days: DEFAULT_DAYS,
    sample: DEFAULT_SAMPLE,
    tenant: null,
    user: null,
    agent: null,
    vertical: 'reservas',
    channel: null,
    limit: 0,
    out: path.join(__dirname, '../../docs/reporte-conversaciones.md'),
    transcripts: null,
    llm: false,
    demo: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--days') args.days = Number(next());
    else if (a === '--sample') args.sample = Number(next());
    else if (a === '--tenant') args.tenant = next();
    else if (a === '--user') args.user = next();
    else if (a === '--agent') args.agent = next();
    else if (a === '--vertical') args.vertical = next();
    else if (a === '--channel') args.channel = next();
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--out') args.out = path.resolve(next());
    else if (a === '--transcripts') args.transcripts = path.resolve(next());
    else if (a === '--llm') args.llm = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Heurísticas de etapa del embudo (español peruano, rubro discotecas/reservas)
// ---------------------------------------------------------------------------

const RE = {
  phone: /(?:\+?51)?\s?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/,
  price: /S\/\s?\d|soles\b/i,
  offer: /\b(box|mesa|lista|promo|promoci[oó]n|entrada|cover)\b/i,
  intent:
    /\b(reserv\w*|separ\w*|apart\w*|agend\w*|lo quiero|quiero (el|la|un|una)\s?(box|mesa)|c[oó]mo hago para)\b/i,
  confirmed:
    /\b(reserva (est[aá] )?confirmada|qued[oó] (confirmada|separada)|te esperamos|listo,? .*(reserva|box|mesa))\b/i,
  objection:
    /\b(caro|muy caro|no tengo|est[aá] fuera de|mucho|barato|descuento|rebaj\w*|m[aá]s econ[oó]mico)\b/i,
  birthday: /\bcumple\w*\b/i,
  date: /\b(hoy|ma[ñn]ana|s[aá]bado|viernes|domingo|lunes|martes|mi[eé]rcoles|jueves|\d{1,2}[\/-]\d{1,2})\b/i,
  question: /\?|\¿/,
  greetingOnly: /^\s*(hola|buenas|hey|hi|holi|buenos d[ií]as|buenas noches)[\s!.¡]*$/i,
};

const INTENT_KEYWORDS = [
  ['precio', /\b(precios?|cu[aá]nto|cuesta|costo|tarifa)/i],
  ['box', /\bbox(es)?\b/i],
  ['mesa', /\bmesas?\b/i],
  ['lista', /\blista\b/i],
  ['cumpleaños', RE.birthday],
  ['ubicación', /\b(d[oó]nde|direcci[oó]n|ubicaci[oó]n|queda|mapa)\b/i],
  ['horario', /\b(horarios?|abren|cierran|hasta qu[eé] hora)/i],
  ['disponibilidad', /\b(disponib\w*|hay (box|mesa|sitio|espacio)|cupo)\b/i],
  ['dress code', /\b(dress ?code|vestimenta|c[oó]mo (voy|ir)|zapatillas|short)\b/i],
  ['edad', /\b(edad|menor|18|21 a[ñn]os)\b/i],
  ['reserva', RE.intent],
];

/**
 * Etapas del embudo por vertical. `reservas` es el negocio de discotecas
 * (locales, box/mesa/lista); `generico` sirve para cualquier agente de venta
 * consultiva (consulta → propuesta → intención → datos → cierre/agenda).
 */
const VERTICALS = {
  reservas: {
    stages: [
      'contacto',
      'local_identificado',
      'info_entregada',
      'intencion_reserva',
      'datos_capturados',
      'confirmada',
    ],
  },
  generico: {
    stages: [
      'contacto',
      'necesidad_expuesta',
      'propuesta_entregada',
      'intencion',
      'datos_capturados',
      'cierre',
    ],
  },
};

const RE_GEN = {
  need: /\b(necesito|quiero|busco|estoy buscando|me interesa|cotiza\w*|presupuesto|proyecto|desarroll\w*|sistema|p[aá]gina|landing|app|tienda|software)\b/i,
  proposal:
    /\b(propuesta|cotizaci[oó]n|presupuesto|alcance|plazo|entrega|desde\s*(S\/|\$)|\$\s?\d|S\/\s?\d|inversi[oó]n)\b/i,
  intent:
    /\b(me interesa|avancemos|c[oó]mo seguimos|cu[aá]ndo podemos|reuni[oó]n|llamada|agendar|cita|demo|empecemos|lo tomo)\b/i,
  email: /[\w.+-]+@[\w-]+\.[\w.]+/,
  closed:
    /\b(agendad[ao]|reuni[oó]n confirmada|qued[oó] agendad|te env[ií]o (el|la) (link|calendario|invitaci[oó]n)|nos vemos el|confirmad[ao] para)\b/i,
};

/** Etapa máxima alcanzada por la conversación, según lo que se dijeron. */
function funnelStage(msgs, ctx) {
  return ctx.vertical === 'generico'
    ? genericStage(msgs)
    : reservasStage(msgs, ctx.localNames);
}

function reservasStage(msgs, localNames) {
  let stage = 0;
  const reLocal = localNames.length
    ? new RegExp(`\\b(${localNames.map(escapeRe).join('|')})\\b`, 'i')
    : null;
  let hasName = false;
  let hasPhone = false;
  let hasDate = false;

  for (const m of msgs) {
    const t = m.text || '';
    if (m.author === 'customer') {
      if (reLocal && reLocal.test(t)) stage = Math.max(stage, 1);
      if (RE.intent.test(t)) stage = Math.max(stage, 3);
      if (RE.phone.test(t)) hasPhone = true;
      if (RE.date.test(t)) hasDate = true;
      // un mensaje con varias líneas o con "nombre:" suele ser la ficha de datos
      if (/nombre\s*:/i.test(t) || (t.split(/\n|,/).length >= 3 && RE.phone.test(t)))
        hasName = true;
    } else if (m.author === 'agent' || m.author === 'human') {
      if (RE.price.test(t) && RE.offer.test(t)) stage = Math.max(stage, 2);
      if (RE.confirmed.test(t)) stage = Math.max(stage, 5);
    }
  }
  if (hasPhone && hasDate && hasName) stage = Math.max(stage, 4);
  return stage;
}

function genericStage(msgs) {
  let stage = 0;
  for (const m of msgs) {
    const t = m.text || '';
    if (m.author === 'customer') {
      if (RE_GEN.need.test(t) || t.split(/\s+/).length > 15) stage = Math.max(stage, 1);
      if (RE_GEN.intent.test(t)) stage = Math.max(stage, 3);
      if (RE_GEN.email.test(t) || RE.phone.test(t)) stage = Math.max(stage, 4);
    } else if (m.author === 'agent' || m.author === 'human') {
      if (RE_GEN.proposal.test(t)) stage = Math.max(stage, 2);
      if (RE_GEN.closed.test(t)) stage = Math.max(stage, 5);
    }
  }
  return stage;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countEmojis(text) {
  const m = text.match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Análisis por conversación
// ---------------------------------------------------------------------------

function analyzeConversation(conv, msgs, ctx) {
  const ordered = [...msgs].sort((a, b) => new Date(a.at) - new Date(b.at));
  const customerMsgs = ordered.filter((m) => m.author === 'customer');
  const agentMsgs = ordered.filter((m) => m.author === 'agent');
  const humanMsgs = ordered.filter((m) => m.author === 'human');

  const responseTimes = [];
  let firstResponse = null;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (a.author !== 'customer' || b.author === 'customer') continue;
    const delta = new Date(b.at) - new Date(a.at);
    if (delta < 0 || delta > MAX_RESPONSE_GAP_MS) continue;
    responseTimes.push(Math.round(delta / 1000));
    if (firstResponse === null) firstResponse = Math.round(delta / 1000);
  }

  const texts = agentMsgs.map((m) => m.text || '').filter(Boolean);
  const dupes = texts.length - new Set(texts.map((t) => t.trim())).size;
  const fallbackHits = ctx.fallbacks.length
    ? texts.filter((t) => ctx.fallbacks.some((f) => t.includes(f))).length
    : 0;

  const last = ordered[ordered.length - 1];
  const stage = funnelStage(ordered, ctx);

  return {
    id: String(conv._id),
    channel: conv.channel,
    contactName: conv.contactName || conv.contact,
    startedAt: ordered[0] ? new Date(ordered[0].at) : new Date(conv.lastMessageAt),
    lastAt: new Date(conv.lastMessageAt),
    totalMsgs: ordered.length,
    customerMsgs: customerMsgs.length,
    agentMsgs: agentMsgs.length,
    humanMsgs: humanMsgs.length,
    firstResponse,
    medianResponse: median(responseTimes),
    escalated: !!conv.escalated,
    escalationReason: conv.escalationReason || null,
    takenOver: !!conv.takenOverBy,
    savedAsCustomer: !!conv.customerId,
    stage,
    stageName: ctx.stages[stage],
    unanswered: !!last && last.author === 'customer',
    ghosted: !!last && last.author !== 'customer' && stage >= 2 && stage < 5,
    agentQuestions: texts.filter((t) => RE.question.test(t)).length,
    longMessages: texts.filter((t) => t.length > LONG_MESSAGE_CHARS).length,
    avgAgentChars: texts.length
      ? Math.round(texts.reduce((s, t) => s + t.length, 0) / texts.length)
      : 0,
    avgEmojis: texts.length
      ? +(texts.reduce((s, t) => s + countEmojis(t), 0) / texts.length).toFixed(1)
      : 0,
    duplicateReplies: dupes,
    fallbackHits,
    objection: ordered.some((m) => m.author === 'customer' && RE.objection.test(m.text || '')),
    birthday: ordered.some((m) => RE.birthday.test(m.text || '')),
    firstCustomerText: customerMsgs[0]?.text || '',
    intents: INTENT_KEYWORDS.filter(([, re]) =>
      customerMsgs.some((m) => re.test(m.text || '')),
    ).map(([name]) => name),
    transcript: ordered.map((m) => ({
      author: m.author,
      at: m.at,
      text: (m.text || `[${m.type}]`).slice(0, 1500),
    })),
  };
}

// ---------------------------------------------------------------------------
// Agregación
// ---------------------------------------------------------------------------

function aggregate(convs, stages) {
  const n = convs.length || 1;
  const byChannel = {};
  const byStage = Object.fromEntries(stages.map((s) => [s, 0]));
  const intents = {};
  const escalationReasons = {};
  const hours = new Array(24).fill(0);

  for (const c of convs) {
    byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    byStage[c.stageName]++;
    for (const i of c.intents) intents[i] = (intents[i] || 0) + 1;
    if (c.escalationReason) {
      const key = c.escalationReason.slice(0, 60);
      escalationReasons[key] = (escalationReasons[key] || 0) + 1;
    }
    hours[c.startedAt.getHours()]++;
  }

  // el embudo es acumulado: quien llegó a "confirmada" pasó por todas las previas
  const funnel = stages.map((name, idx) => ({
    name,
    count: convs.filter((c) => c.stage >= idx).length,
  }));

  return {
    total: convs.length,
    byChannel,
    byStage,
    funnel,
    intents: Object.entries(intents).sort((a, b) => b[1] - a[1]),
    escalationReasons: Object.entries(escalationReasons).sort((a, b) => b[1] - a[1]),
    hours,
    escalated: convs.filter((c) => c.escalated).length,
    takenOver: convs.filter((c) => c.takenOver).length,
    savedAsCustomer: convs.filter((c) => c.savedAsCustomer).length,
    unanswered: convs.filter((c) => c.unanswered).length,
    ghosted: convs.filter((c) => c.ghosted).length,
    oneShot: convs.filter((c) => c.customerMsgs <= 1).length,
    withObjection: convs.filter((c) => c.objection).length,
    birthday: convs.filter((c) => c.birthday).length,
    medianFirstResponse: median(
      convs.map((c) => c.firstResponse).filter((v) => v !== null),
    ),
    medianMsgs: median(convs.map((c) => c.totalMsgs)),
    avgAgentChars: Math.round(convs.reduce((s, c) => s + c.avgAgentChars, 0) / n),
    avgEmojis: +(convs.reduce((s, c) => s + c.avgEmojis, 0) / n).toFixed(1),
    longMessages: convs.reduce((s, c) => s + c.longMessages, 0),
    duplicateReplies: convs.reduce((s, c) => s + c.duplicateReplies, 0),
    fallbackHits: convs.reduce((s, c) => s + c.fallbackHits, 0),
    agentMsgsTotal: convs.reduce((s, c) => s + c.agentMsgs, 0),
    agentQuestions: convs.reduce((s, c) => s + c.agentQuestions, 0),
  };
}

// ---------------------------------------------------------------------------
// Scoring cualitativo con LLM (rúbrica de venta consultiva)
// ---------------------------------------------------------------------------

const RUBRIC = `Eres un director comercial auditando chats de venta de un grupo de discotecas en Lima.
Evalúa la actuación DEL AGENTE (no del cliente) en esta conversación y responde SOLO con JSON:

{
  "apertura": 1-5,           // saluda, identifica necesidad rápido, sin muro de texto
  "calificacion": 1-5,       // averigua local, fecha, número de personas, ocasión y presupuesto
  "propuesta": 1-5,          // recomienda la opción correcta y explica el valor, no solo el precio
  "objeciones": 1-5,         // maneja precio/dudas sin bajar el precio ni abandonar
  "cierre": 1-5,             // pide el compromiso y los datos, cierra o agenda siguiente paso
  "datos": 1-5,              // captura nombre, teléfono, fecha, hora y número de personas
  "tono": 1-5,               // cercano, peruano, mensajes cortos, sin sonar robótico
  "exactitud": 1-5,          // no inventa precios/direcciones/promos ni promete disponibilidad
  "resultado": "reserva" | "interesado" | "perdido" | "solo_consulta",
  "momento_de_caida": "descripción breve de en qué mensaje se enfrió la conversación (o null)",
  "errores": ["error concreto del agente", "..."],
  "mejora_prompt": "una instrucción concreta que habría evitado el error"
}`;

async function callLlm(prompt) {
  const deepseek = process.env.DEEPSEEK_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const claude = process.env.CLAUDE_API_KEY;

  if (deepseek || openai) {
    const url = deepseek
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseek || openai}`,
      },
      body: JSON.stringify({
        model: deepseek ? 'deepseek-chat' : 'gpt-4o-mini',
        max_tokens: 900,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
  if (claude) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claude,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }
  throw new Error(
    'Falta DEEPSEEK_API_KEY, OPENAI_API_KEY o CLAUDE_API_KEY para usar --llm',
  );
}

function renderTranscript(conv) {
  return conv.transcript
    .map((m) => {
      const who =
        m.author === 'customer' ? 'CLIENTE' : m.author === 'agent' ? 'AGENTE' : m.author.toUpperCase();
      return `${who}: ${m.text}`;
    })
    .join('\n');
}

async function scoreSample(convs, sampleSize) {
  // muestra las más largas: son las que de verdad tuvieron conversación de venta
  const sample = [...convs]
    .filter((c) => c.customerMsgs >= 2)
    .sort((a, b) => b.totalMsgs - a.totalMsgs)
    .slice(0, sampleSize);

  const scores = [];
  for (const c of sample) {
    try {
      const raw = await callLlm(`${RUBRIC}\n\n--- CONVERSACIÓN ---\n${renderTranscript(c)}`);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      scores.push({ id: c.id, ...JSON.parse(match[0]) });
      process.stdout.write('.');
    } catch (err) {
      console.error(`\n[llm] ${c.id}: ${err.message}`);
    }
  }
  process.stdout.write('\n');
  return scores;
}

function summarizeScores(scores) {
  const dims = ['apertura', 'calificacion', 'propuesta', 'objeciones', 'cierre', 'datos', 'tono', 'exactitud'];
  const avg = {};
  for (const d of dims) {
    const vals = scores.map((s) => Number(s[d])).filter((v) => !Number.isNaN(v));
    avg[d] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  }
  const outcomes = {};
  const errors = {};
  const fixes = [];
  for (const s of scores) {
    outcomes[s.resultado] = (outcomes[s.resultado] || 0) + 1;
    for (const e of s.errores || []) {
      const key = e.toLowerCase().slice(0, 80);
      errors[key] = (errors[key] || 0) + 1;
    }
    if (s.mejora_prompt) fixes.push(s.mejora_prompt);
  }
  return {
    avg,
    outcomes,
    errors: Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, 15),
    fixes: fixes.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------

function bar(count, total, width = 28) {
  const filled = total ? Math.round((count / total) * width) : 0;
  return '█'.repeat(filled).padEnd(width, '·');
}

function renderReport(agg, convs, args, llm, agents) {
  const L = [];
  let section = 0;
  const h = (title) => `## ${++section}. ${title}`;
  const since = new Date(Date.now() - args.days * 86400000);
  L.push('# Reporte de conversaciones del agente de IA');
  L.push('');
  L.push(`Generado: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · Ventana: últimos ${args.days} días (desde ${since.toISOString().slice(0, 10)})`);
  if (args.user) L.push(`Cuenta: ${args.user}`);
  if (args.tenant) L.push(`Tenant: \`${args.tenant}\``);
  if (args.channel) L.push(`Canal: ${args.channel}`);
  L.push(`Embudo: vertical \`${args.vertical}\``);
  L.push('');

  if (agents && agents.length === 1) {
    const a = agents[0];
    L.push(h('Ficha del agente'));
    L.push('');
    L.push('| Campo | Valor |');
    L.push('| --- | --- |');
    L.push(`| Nombre | ${a.name || '—'} |`);
    L.push(`| Publicado | ${a.published ? 'sí' : 'no'} |`);
    L.push(`| Proveedor / modelo | ${a.provider || 'auto'} · ${a.aiModel || '(por defecto)'} |`);
    L.push(`| Temperatura / maxTokens | ${a.temperature ?? '—'} / ${a.maxTokens ?? '—'} |`);
    L.push(`| RAG | ${a.ragEnabled ? `sí (topK ${a.topK ?? 5})` : 'no'} |`);
    L.push(`| Derivación a humano | ${a.handoffEnabled ? 'sí' : 'no'} |`);
    L.push(`| Fallback | ${a.fallbackMessage || '—'} |`);
    L.push('');
    L.push('<details><summary>Prompt del sistema actual</summary>');
    L.push('');
    L.push('```');
    L.push(a.systemPrompt || '(vacío)');
    L.push('```');
    L.push('');
    L.push('</details>');
    L.push('');
  }

  L.push(h('Resumen'));
  L.push('');
  L.push('| Métrica | Valor |');
  L.push('| --- | --- |');
  L.push(`| Conversaciones con el agente | ${agg.total} |`);
  L.push(`| Por canal | ${Object.entries(agg.byChannel).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'} |`);
  L.push(`| Mensajes por conversación (mediana) | ${agg.medianMsgs} |`);
  L.push(`| Primera respuesta (mediana) | ${agg.medianFirstResponse}s |`);
  const closedStage = agg.funnel[agg.funnel.length - 1];
  L.push(`| Llegaron a la última etapa (${closedStage.name}) | ${closedStage.count} (${pct(closedStage.count, agg.total)}) |`);
  L.push(`| Escaladas a humano | ${agg.escalated} (${pct(agg.escalated, agg.total)}) |`);
  L.push(`| Tomadas manualmente por un operador | ${agg.takenOver} (${pct(agg.takenOver, agg.total)}) |`);
  L.push(`| Guardadas como contacto en el CRM | ${agg.savedAsCustomer} (${pct(agg.savedAsCustomer, agg.total)}) |`);
  L.push(`| Solo un mensaje del cliente (rebote) | ${agg.oneShot} (${pct(agg.oneShot, agg.total)}) |`);
  L.push(`| Terminaron sin respuesta al cliente | ${agg.unanswered} (${pct(agg.unanswered, agg.total)}) |`);
  L.push(`| Chats que el agente nunca contestó | ${agg.noAgentReply} |`);
  L.push(`| El cliente dejó de responder tras la info | ${agg.ghosted} (${pct(agg.ghosted, agg.total)}) |`);
  L.push('');

  L.push(h('Embudo de venta'));
  L.push('');
  L.push('```');
  for (const step of agg.funnel) {
    L.push(`${step.name.padEnd(20)} ${bar(step.count, agg.total)} ${String(step.count).padStart(5)}  ${pct(step.count, agg.total)}`);
  }
  L.push('```');
  L.push('');
  L.push('Caída entre etapas:');
  L.push('');
  L.push('| De | A | Se pierden |');
  L.push('| --- | --- | --- |');
  for (let i = 0; i < agg.funnel.length - 1; i++) {
    const a = agg.funnel[i];
    const b = agg.funnel[i + 1];
    L.push(`| ${a.name} | ${b.name} | ${a.count - b.count} (${pct(a.count - b.count, a.count || 1)}) |`);
  }
  L.push('');

  L.push(h('Calidad de los mensajes del agente'));
  L.push('');
  L.push('| Métrica | Valor | Referencia sana |');
  L.push('| --- | --- | --- |');
  L.push(`| Largo medio del mensaje | ${agg.avgAgentChars} caracteres | < 350 |`);
  L.push(`| Mensajes > ${LONG_MESSAGE_CHARS} caracteres | ${agg.longMessages} | ~0 |`);
  L.push(`| Emojis por mensaje | ${agg.avgEmojis} | 1–3 |`);
  L.push(`| Mensajes que terminan preguntando | ${pct(agg.agentQuestions, agg.agentMsgsTotal)} | > 70% |`);
  L.push(`| Respuestas repetidas textualmente | ${agg.duplicateReplies} | 0 |`);
  L.push(`| Veces que cayó al mensaje de fallback | ${agg.fallbackHits} | < 5% de los mensajes |`);
  L.push('');

  L.push(h('Qué pregunta la gente'));
  L.push('');
  L.push('| Tema | Conversaciones | % |');
  L.push('| --- | --- | --- |');
  for (const [name, count] of agg.intents) {
    L.push(`| ${name} | ${count} | ${pct(count, agg.total)} |`);
  }
  L.push('');
  L.push(`Conversaciones con objeción de precio: ${agg.withObjection} (${pct(agg.withObjection, agg.total)}) · con cumpleaños: ${agg.birthday} (${pct(agg.birthday, agg.total)})`);
  L.push('');

  if (agg.escalationReasons.length) {
    L.push(h('Motivos de derivación a un humano'));
    L.push('');
    L.push('| Motivo | Veces |');
    L.push('| --- | --- |');
    for (const [reason, count] of agg.escalationReasons.slice(0, 15)) {
      L.push(`| ${reason} | ${count} |`);
    }
    L.push('');
  }

  L.push(h('Horarios de entrada'));
  L.push('');
  L.push('```');
  const maxHour = Math.max(...agg.hours, 1);
  agg.hours.forEach((count, h) => {
    if (count) L.push(`${String(h).padStart(2, '0')}h ${bar(count, maxHour, 20)} ${count}`);
  });
  L.push('```');
  L.push('');

  if (llm) {
    L.push(h('Rúbrica de venta (scoring con IA)'));
    L.push('');
    L.push(`Muestra evaluada: ${llm.scores.length} conversaciones.`);
    L.push('');
    L.push('| Dimensión | Promedio (1–5) |');
    L.push('| --- | --- |');
    for (const [dim, value] of Object.entries(llm.summary.avg)) {
      L.push(`| ${dim} | ${value ?? '—'} |`);
    }
    L.push('');
    L.push(`Resultados: ${Object.entries(llm.summary.outcomes).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
    L.push('');
    L.push('### Errores más repetidos');
    L.push('');
    for (const [err, count] of llm.summary.errors) L.push(`- (${count}×) ${err}`);
    L.push('');
    L.push('### Instrucciones sugeridas para el prompt');
    L.push('');
    for (const fix of llm.summary.fixes) L.push(`- ${fix}`);
    L.push('');
  }

  L.push(h('Conversaciones para revisar a mano'));
  L.push('');
  const worst = convs
    .filter((c) => c.stage >= 2 && c.stage < 4)
    .sort((a, b) => b.totalMsgs - a.totalMsgs)
    .slice(0, 5);
  const best = convs.filter((c) => c.stage === 5).slice(0, 3);
  L.push('**Se enfriaron después de dar la información** (mayor oportunidad perdida):');
  L.push('');
  for (const c of worst) {
    L.push(`- \`${c.id}\` · ${c.channel} · ${c.totalMsgs} mensajes · última etapa: ${c.stageName} · "${(c.firstCustomerText || '').slice(0, 80)}"`);
  }
  L.push('');
  if (best.length) {
    L.push('**Cerraron reserva** (usar como few-shot del prompt):');
    L.push('');
    for (const c of best) {
      L.push(`- \`${c.id}\` · ${c.channel} · ${c.totalMsgs} mensajes`);
    }
    L.push('');
  }
  L.push('> Para leer los chats completos: `--transcripts chats.jsonl` y buscar el `id`.');
  L.push('');

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

async function loadFromMongo(args) {
  const { MongoClient, ObjectId } = require('mongodb');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta MONGODB_URI en el entorno (.env)');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    // --- tenant: por id o resuelto desde el email de un usuario ---
    let tenantId = args.tenant ? new ObjectId(args.tenant) : null;
    if (args.user) {
      const user = await db.collection('users').findOne({ email: args.user });
      if (!user) throw new Error(`No existe ningún usuario con email ${args.user}`);
      if (!user.tenantId)
        throw new Error(`El usuario ${args.user} no tiene tenant asignado`);
      tenantId = user.tenantId;
      console.log(`Usuario ${args.user} → tenant ${String(tenantId)}`);
    }

    // --- agentes del tenant (para el fallback y la ficha del reporte) ---
    const agents = await db
      .collection('aiagents')
      .find(tenantId ? { tenantId } : {})
      .toArray();

    let agent = null;
    if (args.agent) {
      agent =
        agents.find((a) => String(a._id) === args.agent) ||
        agents.find((a) => (a.name || '').toLowerCase() === args.agent.toLowerCase());
      if (!agent)
        throw new Error(
          `No encontré el agente "${args.agent}". Disponibles: ${agents.map((a) => a.name).join(', ') || '(ninguno)'}`,
        );
    }

    const since = new Date(Date.now() - args.days * 86400000);
    const query = { lastMessageAt: { $gte: since } };
    if (tenantId) query.tenantId = tenantId;
    if (args.channel) query.channel = args.channel;
    if (agent) {
      // el agente responde por sus cuentas; `agentId` marca quién contestó
      const accounts = [
        ...(agent.accountIds || []),
        ...(agent.instagramAccountIds || []),
        ...(agent.messengerAccountIds || []),
      ];
      query.$or = [{ agentId: agent._id }, { accountId: { $in: accounts } }];
    }

    let cursor = db.collection('conversations').find(query).sort({ lastMessageAt: -1 });
    if (args.limit) cursor = cursor.limit(args.limit);
    const conversations = await cursor.toArray();

    const ids = conversations.map((c) => c._id);
    const messages = await db
      .collection('messages')
      .find({ conversationId: { $in: ids } })
      .sort({ at: 1 })
      .toArray();

    const locals = await db
      .collection('locals')
      .find(tenantId ? { tenantId } : {})
      .project({ name: 1 })
      .toArray();

    return { conversations, messages, agents: agent ? [agent] : agents, locals };
  } finally {
    await client.close();
  }
}

function demoData() {
  const t0 = new Date('2026-09-05T22:00:00Z').getTime();
  const at = (min) => new Date(t0 + min * 60000);
  const conv = (id, extra) => ({
    _id: id,
    channel: 'whatsapp',
    contact: `5199900000${id}`,
    lastMessageAt: at(30),
    ...extra,
  });
  const msg = (conversationId, author, text, min) => ({
    conversationId,
    author,
    type: 'text',
    text,
    at: at(min),
  });
  return {
    conversations: [conv('1', {}), conv('2', { escalated: true, escalationReason: 'pide disponibilidad' }), conv('3', {})],
    messages: [
      msg('1', 'customer', 'hola tienen box? precios', 0),
      msg('1', 'agent', 'Hola! 🙌 ¿Para cuál de nuestros locales lo buscas? Tenemos Elephant y La Patria', 1),
      msg('1', 'customer', 'para Elephant', 2),
      msg('1', 'agent', 'Box Elephant incluye 2 botellas de S/450. Capacidad 10 personas. Total S/900 😉 ¿Te animo a separar tu box?', 3),
      msg('1', 'customer', 'quiero reservar', 4),
      msg('1', 'agent', 'Concreta tu reserva enviando: Nombre: Teléfono: Fecha: Hora: Cantidad de asistentes:', 5),
      msg('1', 'customer', 'Marco, 999111222, sábado, 11pm, 4 personas', 6),
      msg('1', 'agent', 'Listo Marco! Tu reserva está confirmada, gracias por tu preferencia 🥂', 7),

      msg('2', 'customer', 'hay mesa para el sábado?', 0),
      msg('2', 'agent', 'Claro, la mesa en La Patria incluye 1 botella de S/450 soles', 1),
      msg('2', 'customer', 'uf muy caro', 2),
      msg('2', 'agent', 'Lo siento, no tengo esa información en este momento.', 3),

      msg('3', 'customer', 'hola', 0),
    ],
    agents: [{ fallbackMessage: 'Lo siento, no tengo esa información en este momento.' }],
    locals: [{ name: 'Elephant' }, { name: 'La Patria' }],
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }

  const { conversations, messages, agents, locals } = args.demo
    ? demoData()
    : await loadFromMongo(args);

  const byConv = new Map();
  for (const m of messages) {
    const key = String(m.conversationId);
    if (!byConv.has(key)) byConv.set(key, []);
    byConv.get(key).push(m);
  }

  const vertical = VERTICALS[args.vertical];
  if (!vertical)
    throw new Error(`--vertical debe ser ${Object.keys(VERTICALS).join(' o ')}`);

  const ctx = {
    vertical: args.vertical,
    stages: vertical.stages,
    fallbacks: [...new Set(agents.map((a) => a.fallbackMessage).filter(Boolean))],
    localNames: [...new Set(locals.map((l) => l.name).filter(Boolean))],
  };

  const withMessages = conversations.map((c) =>
    analyzeConversation(c, byConv.get(String(c._id)) || [], ctx),
  );
  // el reporte mide al agente: solo las conversaciones que de verdad atendió
  const analyzed = withMessages.filter((c) => c.agentMsgs > 0);

  if (!analyzed.length) {
    console.log('No hay conversaciones atendidas por el agente en la ventana pedida.');
    return;
  }

  const agg = aggregate(analyzed, ctx.stages);
  agg.noAgentReply = withMessages.filter(
    (c) => c.agentMsgs === 0 && c.humanMsgs === 0 && c.customerMsgs > 0,
  ).length;

  let llm = null;
  if (args.llm) {
    console.log(`Puntuando ${Math.min(args.sample, analyzed.length)} conversaciones con IA...`);
    const scores = await scoreSample(analyzed, args.sample);
    if (scores.length) llm = { scores, summary: summarizeScores(scores) };
  }

  const report = renderReport(agg, analyzed, args, llm, agents);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, report);
  console.log(`Reporte escrito en ${args.out} (${analyzed.length} conversaciones).`);

  if (args.transcripts) {
    const lines = analyzed.map((c) =>
      JSON.stringify({ id: c.id, channel: c.channel, stage: c.stageName, transcript: c.transcript }),
    );
    fs.writeFileSync(args.transcripts, lines.join('\n'));
    console.log(`Transcripciones en ${args.transcripts}`);
  }
  if (llm) {
    const jsonPath = args.out.replace(/\.md$/, '.scores.json');
    fs.writeFileSync(jsonPath, JSON.stringify(llm, null, 2));
    console.log(`Scoring detallado en ${jsonPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
