import type { AiProviderId } from './providers/ai-provider.interface';

export interface AiModelOption {
  id: string;
  label: string;
  /** Para qué sirve en un agente de chat: coste, velocidad, cuándo usarlo. */
  note?: string;
  /** Marca la opción que conviene por defecto en un agente de WhatsApp/DM. */
  recommended?: boolean;
}

/**
 * Modelos sugeridos por proveedor. Es solo el respaldo: el endpoint
 * `GET /ai-agents/models` consulta el listado real del proveedor con la API key
 * del tenant y usa estas etiquetas para los que reconoce. Un modelo que el
 * proveedor ya no sirva desaparece del selector aunque siga aquí.
 *
 * Criterio para un agente que contesta chats: gana el modelo rápido y barato;
 * los de razonamiento caro solo valen cuando el agente tiene que decidir algo
 * complejo, y encarecen cada mensaje.
 */
export const AI_MODEL_CATALOG: Record<AiProviderId, AiModelOption[]> = {
  claude: [
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      note: 'El más rápido y barato de Anthropic (~$1/$5 por millón de tokens, 200K de contexto). Es el que conviene para responder chats.',
      recommended: true,
    },
    {
      id: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      note: 'Equilibrio calidad/precio (~$2/$10, 1M de contexto). Úsalo si el agente tiene que seguir instrucciones largas o mucha base de conocimiento.',
    },
    {
      id: 'claude-opus-5',
      label: 'Claude Opus 5',
      note: 'El más capaz de la familia Opus (~$5/$25, 1M). Caro para chat masivo; sirve para agentes que resuelven casos difíciles.',
    },
    {
      id: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      note: 'Generación anterior de Opus, mismo precio que Opus 5. Solo si ya tenías prompts afinados con él.',
    },
  ],
  openai: [
    {
      id: 'gpt-5-mini',
      label: 'GPT-5 mini',
      note: 'Rápido y barato dentro de la familia GPT-5. Buen punto de partida para chat.',
      recommended: true,
    },
    {
      id: 'gpt-5',
      label: 'GPT-5',
      note: 'Mejor razonamiento, bastante más caro y lento por mensaje.',
    },
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini',
      note: 'Generación anterior, sigue siendo barata y suficiente para respuestas guionadas.',
    },
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      note: 'El más antiguo de la lista. Es el modelo por defecto histórico de la plataforma.',
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek Chat',
      note: 'El modelo de conversación de DeepSeek: muy barato, buen español.',
      recommended: true,
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      note: 'Razona antes de responder: más lento y más caro por mensaje, innecesario para atender chats.',
    },
  ],
  gemini: [
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      note: 'Rápido y barato, con contexto muy grande. La opción sensata en Google.',
      recommended: true,
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      note: 'Aún más barato; responde más plano, útil para FAQs simples.',
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      note: 'El de mayor calidad de Google, bastante más caro por mensaje.',
    },
    {
      id: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      note: 'Generación anterior. Es el modelo por defecto histórico de la plataforma.',
    },
  ],
};

/** Modelos que usa la plataforma cuando el agente no elige ninguno. */
export const AI_DEFAULT_MODEL: Record<AiProviderId, string> = {
  claude: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-v4-flash',
  gemini: 'gemini-2.0-flash',
};

/** Descarta de un listado en vivo lo que no sirve para conversar. */
const NON_CHAT = [
  'embed',
  'embedding',
  'tts',
  'whisper',
  'audio',
  'realtime',
  'moderation',
  'image',
  'dall-e',
  'transcribe',
  'search',
  'rerank',
  'aqa',
  'imagen',
  'veo',
  'learnlm',
  'codestral',
];

export function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT.some((word) => lower.includes(word));
}

/**
 * Mezcla el listado vivo del proveedor con el catálogo: primero los sugeridos
 * que el proveedor confirma, después el resto de modelos disponibles.
 */
export function mergeWithCatalog(
  provider: AiProviderId,
  liveIds: string[],
): AiModelOption[] {
  const catalog = AI_MODEL_CATALOG[provider] ?? [];
  if (!liveIds.length) return catalog;

  const live = new Set(liveIds);
  const known = catalog.filter((m) => live.has(m.id));
  const rest = liveIds
    .filter((id) => !catalog.some((m) => m.id === id))
    .sort()
    .map((id): AiModelOption => ({ id, label: id }));

  return [...known, ...rest];
}
