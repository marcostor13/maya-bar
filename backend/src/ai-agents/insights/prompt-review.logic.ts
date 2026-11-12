/**
 * Lógica pura de la mejora de prompts: preparar las conversaciones para la IA
 * y validar lo que la IA devuelve antes de guardarlo o aplicarlo.
 */

export const SUGGESTION_ACTIONS = ['add', 'replace', 'remove'] as const;
export type SuggestionAction = (typeof SUGGESTION_ACTIONS)[number];
export type SuggestionStatus = 'pending' | 'applied' | 'discarded';

export interface SuggestionEvidence {
  conversationId: string;
  excerpt: string;
}

export interface PromptSuggestion {
  title: string;
  problem: string;
  evidence: SuggestionEvidence[];
  action: SuggestionAction;
  /** Texto exacto del prompt actual que se reemplaza o se quita. */
  find?: string;
  /** Texto nuevo (add / replace). */
  text?: string;
  status: SuggestionStatus;
}

export const MAX_SUGGESTIONS = 10;
export const MAX_TRANSCRIPT_CHARS = 60_000;
const MAX_MESSAGE_CHARS = 600;
const MAX_FIELD = 4000;
const MAX_TITLE = 160;
const MAX_EXCERPT = 400;
const MAX_EVIDENCE = 3;

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// 7 o más dígitos con separadores habituales: teléfonos, no horas ni precios.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

/** Oculta correos y teléfonos: la IA no los necesita para juzgar el prompt. */
export function redact(text: string): string {
  return text
    .replace(EMAIL_RE, '[correo]')
    .replace(PHONE_RE, (m) =>
      m.replace(/\D/g, '').length >= 7 ? '[teléfono]' : m,
    );
}

export interface TranscriptMessage {
  author: string;
  text?: string;
  transcript?: string;
  type?: string;
}

export interface TranscriptConversation {
  id: string;
  escalated?: boolean;
  unanswered?: boolean;
  messages: TranscriptMessage[];
}

const AUTHOR_LABEL: Record<string, string> = {
  customer: 'Cliente',
  agent: 'Agente IA',
  human: 'Persona del equipo',
  system: 'Nota interna',
};

function messageLine(m: TranscriptMessage): string {
  const body = (m.text || m.transcript || (m.type ? `[${m.type}]` : ''))
    .replace(/\s+/g, ' ')
    .trim();
  const clipped =
    body.length > MAX_MESSAGE_CHARS
      ? `${body.slice(0, MAX_MESSAGE_CHARS)}…`
      : body;
  return `${AUTHOR_LABEL[m.author] ?? m.author}: ${redact(clipped)}`;
}

/**
 * Texto de las conversaciones para la IA, con tope total de caracteres. Las
 * conversaciones que no caben se omiten enteras (una a medias confunde).
 */
export function buildTranscripts(
  conversations: TranscriptConversation[],
  maxChars = MAX_TRANSCRIPT_CHARS,
): { text: string; ids: string[] } {
  const blocks: string[] = [];
  const ids: string[] = [];
  let total = 0;
  for (const c of conversations) {
    const tags = [
      c.escalated ? 'derivada a humano' : '',
      c.unanswered ? 'termina con el cliente sin respuesta' : '',
    ].filter(Boolean);
    const block = [
      `### Conversación ${c.id}${tags.length ? ` (${tags.join(', ')})` : ''}`,
      ...c.messages.map(messageLine),
    ].join('\n');
    if (total + block.length > maxChars) continue;
    blocks.push(block);
    ids.push(c.id);
    total += block.length + 2;
  }
  return { text: blocks.join('\n\n'), ids };
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/**
 * Valida la salida de la IA. Se descarta lo que no se puede aplicar tal cual:
 * acción desconocida, cambio vacío, o texto a reemplazar que no está en el
 * prompt. La evidencia solo puede citar conversaciones que se enviaron.
 */
export function sanitizeSuggestions(
  raw: unknown,
  prompt: string,
  conversationIds: string[],
): PromptSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(conversationIds);
  const out: PromptSuggestion[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const action = s.action as SuggestionAction;
    if (!SUGGESTION_ACTIONS.includes(action)) continue;
    const title = str(s.title, MAX_TITLE);
    const problem = str(s.problem, MAX_FIELD);
    const find = str(s.find, MAX_FIELD);
    const text = str(s.text, MAX_FIELD);
    if (!title) continue;
    if (action !== 'remove' && !text) continue;
    if (action !== 'add' && (!find || !prompt.includes(find))) continue;
    const evidence = (Array.isArray(s.evidence) ? s.evidence : [])
      .map((e: unknown) => {
        const ev = (e ?? {}) as Record<string, unknown>;
        return {
          conversationId: str(ev.conversationId, 40),
          excerpt: redact(str(ev.excerpt, MAX_EXCERPT)),
        };
      })
      .filter((e) => allowed.has(e.conversationId))
      .slice(0, MAX_EVIDENCE);
    // Sin una conversación real que la respalde, no es una sugerencia.
    if (!evidence.length) continue;
    out.push({
      title,
      problem,
      evidence,
      action,
      ...(action !== 'add' ? { find } : {}),
      ...(action !== 'remove' ? { text } : {}),
      status: 'pending',
    });
  }
  return out;
}

/** Nuevo prompt con el cambio aplicado, o `null` si el texto ya no está. */
export function applyChange(
  prompt: string,
  change: Pick<PromptSuggestion, 'action' | 'find' | 'text'>,
): string | null {
  if (change.action === 'add')
    return `${prompt.trimEnd()}\n\n${(change.text ?? '').trim()}\n`;
  if (!change.find) return null;
  const at = prompt.indexOf(change.find);
  if (at < 0) return null;
  const before = prompt.slice(0, at);
  const after = prompt.slice(at + change.find.length);
  if (change.action === 'replace') return before + (change.text ?? '') + after;
  // Al quitar, solo se juntan las líneas en blanco de la unión: el resto del
  // prompt queda tal cual.
  const head = before.replace(/\n+$/, '');
  const tail = after.replace(/^\n+/, '');
  const gap = Math.min(
    2,
    before.length - head.length + after.length - tail.length,
  );
  return head + (head && tail ? '\n'.repeat(gap) : '') + tail;
}
