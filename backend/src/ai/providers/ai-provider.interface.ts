export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AiProviderId = 'deepseek' | 'claude' | 'openai' | 'gemini';

export interface AiChatRequest {
  provider: AiProviderId;
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Si es undefined se omite del body (compat con las llamadas legacy). */
  temperature?: number;
  /** undefined => modelo por defecto del proveedor. */
  model?: string;
  /** Etiqueta usada en el mensaje de error `<label> API error: ...`. */
  errorLabel?: string;
  /** Aborta la llamada pasado este tiempo. Sin él, espera indefinidamente. */
  timeoutMs?: number;
}

/** Herramienta que el modelo puede llamar (function calling). */
export interface AiTool {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AiToolChatRequest extends AiChatRequest {
  tools: AiTool[];
  /** Ejecuta la herramienta; lo que devuelve se le pasa al modelo como JSON. */
  runTool: (call: AiToolCall) => Promise<unknown>;
  /** Vueltas máximas modelo → herramientas antes de forzar la respuesta final. */
  maxRounds?: number;
}

/** Transporte HTTP hacia un proveedor de chat de IA (DIP). */
export interface AiChatProvider {
  chat(req: AiChatRequest): Promise<string>;
  /** Igual que chat, pero el modelo puede llamar herramientas antes de responder. */
  chatWithTools(req: AiToolChatRequest): Promise<string>;
  /** Ids de modelos que la API key puede usar hoy, tal como los lista el proveedor. */
  listModels(provider: AiProviderId, apiKey: string): Promise<string[]>;
}

/** Transporte HTTP hacia un proveedor de embeddings (DIP). */
export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export const AI_CHAT_PROVIDER = 'AI_CHAT_PROVIDER';
export const EMBEDDINGS_PROVIDER = 'EMBEDDINGS_PROVIDER';
