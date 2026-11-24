/** Reglas puras del puntaje de leads (HU70). */

export type Heat = 'hot' | 'warm' | 'cold';

/** Cada parte aporta hasta 50 puntos: reglas + lectura con IA = 0–100. */
export const RULES_MAX = 50;
export const AI_MAX = 50;
/** Como mucho un recálculo por contacto en este intervalo. */
export const SCORE_COOLDOWN_MS = 10 * 60_000;

export function heatOf(score: number): Heat {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export interface RuleInput {
  source?: string;
  /** Mensajes del contacto en los últimos 7 días. */
  inboundRecent: number;
  /** Minutos que tardó en contestar nuestro último mensaje (si contestó). */
  replyMinutes?: number;
  emailOpens: number;
  emailClicks: number;
  /** Avance en el embudo de la oportunidad abierta (0–1); null sin oportunidad. */
  stageProgress: number | null;
  won?: boolean;
}

const SOURCE_POINTS: Record<string, number> = {
  form: 10,
  lead_ads: 10,
  web: 10,
  whatsapp: 8,
  instagram: 8,
  messenger: 8,
  event: 7,
  reservation: 7,
  email: 5,
  api: 4,
  prospecting: 3,
  import: 2,
  mongodb: 2,
  manual: 3,
};

/** Puntos por reglas (0–50) y los motivos que los explican. */
export function ruleScore(i: RuleInput): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let pts = SOURCE_POINTS[i.source ?? ''] ?? 3;
  if (pts >= 8) reasons.push('llegó por un canal de alta intención');

  if (i.inboundRecent > 0) {
    pts += Math.min(10, i.inboundRecent * 2);
    if (i.inboundRecent >= 3) reasons.push('escribe seguido');
  }
  if (i.replyMinutes !== undefined) {
    if (i.replyMinutes <= 15) {
      pts += 10;
      reasons.push('respondió rápido');
    } else if (i.replyMinutes <= 120) pts += 5;
  }

  if (i.emailClicks > 0) {
    pts += 8;
    reasons.push('hizo clic en un email');
  } else if (i.emailOpens > 0) {
    pts += 4;
    reasons.push('abre los emails');
  }

  if (i.won) pts += 12;
  else if (i.stageProgress !== null) {
    pts += Math.round(12 * Math.max(0, Math.min(1, i.stageProgress)));
    if (i.stageProgress >= 0.5) reasons.push('avanzó en el embudo');
  }
  return { points: Math.min(RULES_MAX, Math.max(0, pts)), reasons };
}

export interface AiReading {
  points: number;
  intent?: string;
  budget?: string;
  urgency?: string;
  objections?: string;
  reason?: string;
}

const str = (v: unknown, max = 160) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/** Lee el JSON de la IA, tolerante a texto alrededor; null si no se entiende. */
export function parseAiReading(text: string): AiReading | null {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const n = Number(raw.points ?? raw.score);
  if (!Number.isFinite(n)) return null;
  return {
    points: Math.round(Math.min(AI_MAX, Math.max(0, n))),
    intent: str(raw.intent),
    budget: str(raw.budget),
    urgency: str(raw.urgency),
    objections: str(raw.objections),
    reason: str(raw.reason, 200),
  };
}

export function scorePrompt(transcript: string): string {
  return [
    'Eres analista comercial. Lee la conversación entre un cliente y una empresa y estima qué tan probable es que el cliente compre pronto.',
    'Responde SOLO con un JSON, sin texto extra, con esta forma:',
    '{"points": <0 a 50>, "intent": "<qué quiere>", "budget": "<lo que se sabe de su presupuesto o vacío>", "urgency": "<para cuándo lo necesita o vacío>", "objections": "<dudas u objeciones o vacío>", "reason": "<una línea en español que explique el puntaje>"}',
    'Guía: 40–50 pide precio y tiene urgencia; 25–39 interés claro sin urgencia; 10–24 curiosidad; 0–9 sin interés, queja o spam.',
    '',
    'Conversación (más antigua primero):',
    transcript,
  ].join('\n');
}
