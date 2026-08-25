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
}

/** Transporte HTTP hacia un proveedor de chat de IA (DIP). */
export interface AiChatProvider {
  chat(req: AiChatRequest): Promise<string>;
}

/** Transporte HTTP hacia un proveedor de embeddings (DIP). */
export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export const AI_CHAT_PROVIDER = 'AI_CHAT_PROVIDER';
export const EMBEDDINGS_PROVIDER = 'EMBEDDINGS_PROVIDER';
