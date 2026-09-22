import { Injectable, Logger } from '@nestjs/common';
import type { AiApiKeys } from './ai.service';

/** Tipos de adjunto que se pueden convertir a texto. */
export type MediaKind = 'image' | 'video' | 'audio' | 'voice' | 'document';

export interface MediaToInterpret {
  kind: MediaKind;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface MediaInterpretation {
  /** Texto para el agente IA y para la bandeja. */
  text: string;
  /** Quién lo produjo (para depurar y para el pie que ve el operador). */
  source: 'openai' | 'gemini' | 'claude' | 'local';
}

/** Ninguna lectura de adjunto puede colgar la respuesta del agente. */
const TIMEOUT_MS = 60_000;

/** Tope de lo que se guarda: un PDF largo no cabe en el prompt de cada turno. */
const MAX_TEXT_CHARS = 4000;

// Topes de tamaño: por encima, el proveedor rechaza el archivo o el request.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // límite de OpenAI
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // límite de Claude
const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // inline_data de Gemini (va en base64)
const MAX_DOC_BYTES = 20 * 1024 * 1024;

const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
const OPENAI_VISION_MODEL = 'gpt-4o-mini';
const CLAUDE_VISION_MODEL = 'claude-haiku-4-5';
const GEMINI_MODEL = 'gemini-2.5-flash';

const PROMPT_AUDIO =
  'Transcribe literalmente este audio. Devuelve solo la transcripción, sin comentarios ni introducción. Si no se entiende nada, responde exactamente: (audio inaudible).';
const PROMPT_IMAGE =
  'Eres los ojos de un agente de atención al cliente. Describe en español y en pocas frases qué muestra esta imagen y transcribe literalmente todo el texto visible (precios, nombres, fechas, números de operación, códigos). Sin comentarios ni suposiciones.';
const PROMPT_VIDEO =
  'Describe en español y en pocas frases qué ocurre en este video y transcribe lo que se diga en él. Sin comentarios ni suposiciones.';
const PROMPT_DOC =
  'Transcribe en español el contenido de este documento respetando cifras, fechas y nombres propios. Si es un comprobante o una factura, empieza por importe, fecha y emisor.';

/** Extensión que hay que darle al archivo para que OpenAI acepte el audio. */
const AUDIO_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
};

/** Documentos que se leen en local, sin gastar una llamada a la IA. */
const PLAIN_TEXT = /^(text\/|application\/(json|xml|x-yaml))/;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}
interface ClaudeResponse {
  content?: { text?: string }[];
}
interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Convierte los adjuntos que entran por WhatsApp, Instagram y Messenger en
 * texto: transcribe las notas de voz y los audios, describe imágenes y videos,
 * y extrae el contenido de los documentos.
 *
 * Existe porque el chat de los agentes es de texto plano de punta a punta
 * (historial en Mongo, cuatro proveedores, RAG). En vez de volver multimodal
 * toda la cadena —y perder a DeepSeek, que no ve— el adjunto se lee UNA vez al
 * recibirlo y lo que viaja después es su texto.
 *
 * Cada modalidad usa el proveedor que sabe hacerla, con la key que el tenant ya
 * tenga cargada; si no hay ninguna que sirva devuelve null y el chat sigue
 * funcionando con el aviso de siempre ("[El cliente envió una nota de voz]").
 */
@Injectable()
export class MediaUnderstandingService {
  private readonly logger = new Logger(MediaUnderstandingService.name);

  async interpret(
    media: MediaToInterpret,
    keys: AiApiKeys,
  ): Promise<MediaInterpretation | null> {
    const mime = this.baseMime(media.mimeType);

    switch (media.kind) {
      case 'voice':
      case 'audio':
        return this.transcribeAudio(media, mime, keys);
      case 'image':
        return this.describeImage(media, mime, keys);
      case 'video':
        return this.describeVideo(media, mime, keys);
      case 'document':
        return this.readDocument(media, mime, keys);
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------
  // Modalidades
  // ------------------------------------------------------------------

  /** Notas de voz y audios: OpenAI transcribe; Gemini es el suplente. */
  private transcribeAudio(
    media: MediaToInterpret,
    mime: string,
    keys: AiApiKeys,
  ) {
    if (this.tooBig(media, MAX_AUDIO_BYTES, 'audio')) return null;
    return this.firstThatAnswers([
      keys.openai
        ? {
            source: 'openai' as const,
            run: () => this.openaiTranscribe(media.buffer, mime, keys.openai!),
          }
        : null,
      keys.gemini
        ? {
            source: 'gemini' as const,
            run: () =>
              this.geminiInline(PROMPT_AUDIO, media.buffer, mime, keys.gemini!),
          }
        : null,
    ]);
  }

  /** Imágenes: las ven los tres proveedores con visión. */
  private describeImage(
    media: MediaToInterpret,
    mime: string,
    keys: AiApiKeys,
  ) {
    if (this.tooBig(media, MAX_IMAGE_BYTES, 'imagen')) return null;
    return this.firstThatAnswers([
      keys.openai
        ? {
            source: 'openai' as const,
            run: () =>
              this.openaiVision(PROMPT_IMAGE, media.buffer, mime, keys.openai!),
          }
        : null,
      keys.claude
        ? {
            source: 'claude' as const,
            run: () =>
              this.claudeVision(PROMPT_IMAGE, media.buffer, mime, keys.claude!),
          }
        : null,
      keys.gemini
        ? {
            source: 'gemini' as const,
            run: () =>
              this.geminiInline(PROMPT_IMAGE, media.buffer, mime, keys.gemini!),
          }
        : null,
    ]);
  }

  /**
   * Video: solo Gemini lo procesa nativamente. Sin su key no hay forma de
   * leerlo aquí — separar la pista de audio necesitaría ffmpeg en el servidor.
   */
  private describeVideo(
    media: MediaToInterpret,
    mime: string,
    keys: AiApiKeys,
  ) {
    if (!keys.gemini) {
      this.logger.log(
        'Video recibido sin key de Gemini: no se interpreta (es el único proveedor que lee video).',
      );
      return null;
    }
    if (this.tooBig(media, MAX_VIDEO_BYTES, 'video')) return null;
    return this.firstThatAnswers([
      {
        source: 'gemini' as const,
        run: () =>
          this.geminiInline(PROMPT_VIDEO, media.buffer, mime, keys.gemini!),
      },
    ]);
  }

  /**
   * Documentos: primero se intenta leerlos en local (texto plano y PDFs con
   * capa de texto), que es gratis e instantáneo. Solo si el PDF viene escaneado
   * —una foto dentro de un PDF, típico de los comprobantes— se manda al modelo.
   */
  private async readDocument(
    media: MediaToInterpret,
    mime: string,
    keys: AiApiKeys,
  ): Promise<MediaInterpretation | null> {
    if (this.tooBig(media, MAX_DOC_BYTES, 'documento')) return null;

    const local = await this.extractLocally(media.buffer, mime).catch(
      (err: unknown) => {
        this.logger.warn(`No se pudo leer el documento: ${String(err)}`);
        return '';
      },
    );
    if (local.trim().length >= 20)
      return { text: this.trim(local), source: 'local' };

    if (mime !== 'application/pdf') return null;
    return this.firstThatAnswers([
      keys.claude
        ? {
            source: 'claude' as const,
            run: () => this.claudePdf(PROMPT_DOC, media.buffer, keys.claude!),
          }
        : null,
      keys.gemini
        ? {
            source: 'gemini' as const,
            run: () =>
              this.geminiInline(PROMPT_DOC, media.buffer, mime, keys.gemini!),
          }
        : null,
    ]);
  }

  private async extractLocally(buffer: Buffer, mime: string): Promise<string> {
    if (PLAIN_TEXT.test(mime)) return buffer.toString('utf-8');
    if (mime !== 'application/pdf') return '';
    // Mismo import dinámico que la ingesta de la base de conocimiento:
    // pdf-parse v2 es ESM y expone la clase, no un default.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const { text } = await parser.getText({ pageJoiner: '' });
      return text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  // ------------------------------------------------------------------
  // Proveedores
  // ------------------------------------------------------------------

  private async openaiTranscribe(
    buffer: Buffer,
    mime: string,
    apiKey: string,
  ): Promise<string> {
    const form = new FormData();
    // El nombre importa: OpenAI decide el formato por la extensión.
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mime }),
      `audio.${AUDIO_EXT[mime] ?? 'ogg'}`,
    );
    form.append('model', OPENAI_TRANSCRIBE_MODEL);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await this.json<{ text?: string }>(res, 'OpenAI');
    return data.text ?? '';
  }

  private async openaiVision(
    prompt: string,
    buffer: Buffer,
    mime: string,
    apiKey: string,
  ): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_VISION_MODEL,
        max_completion_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: this.dataUri(buffer, mime) },
              },
            ],
          },
        ],
      }),
    });
    const data = await this.json<OpenAiChatResponse>(res, 'OpenAI');
    return data.choices?.[0]?.message?.content ?? '';
  }

  private claudeVision(
    prompt: string,
    buffer: Buffer,
    mime: string,
    apiKey: string,
  ): Promise<string> {
    return this.claude(apiKey, prompt, {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mime,
        data: buffer.toString('base64'),
      },
    });
  }

  private claudePdf(
    prompt: string,
    buffer: Buffer,
    apiKey: string,
  ): Promise<string> {
    return this.claude(apiKey, prompt, {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buffer.toString('base64'),
      },
    });
  }

  private async claude(
    apiKey: string,
    prompt: string,
    block: unknown,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_VISION_MODEL,
        max_tokens: 700,
        messages: [
          { role: 'user', content: [block, { type: 'text', text: prompt }] },
        ],
      }),
    });
    const data = await this.json<ClaudeResponse>(res, 'Claude');
    return (data.content ?? [])
      .map((c) => c.text ?? '')
      .join('')
      .trim();
  }

  /** Gemini acepta audio, imagen, video y PDF por el mismo camino. */
  private async geminiInline(
    prompt: string,
    buffer: Buffer,
    mime: string,
    apiKey: string,
  ): Promise<string> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mime,
                    data: buffer.toString('base64'),
                  },
                },
              ],
            },
          ],
        }),
      },
    );
    const data = await this.json<GeminiResponse>(res, 'Gemini');
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }

  // ------------------------------------------------------------------
  // Apoyo
  // ------------------------------------------------------------------

  /**
   * Prueba los proveedores en orden y se queda con el primero que devuelva
   * algo. Un proveedor caído o sin saldo no puede dejar el adjunto mudo si hay
   * otra key configurada que sí puede leerlo.
   */
  private async firstThatAnswers(
    candidates: ({
      source: MediaInterpretation['source'];
      run: () => Promise<string>;
    } | null)[],
  ): Promise<MediaInterpretation | null> {
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const text = (await candidate.run()).trim();
        if (text) return { text: this.trim(text), source: candidate.source };
      } catch (err) {
        this.logger.warn(
          `No se pudo interpretar el adjunto con ${candidate.source}: ${String(err)}`,
        );
      }
    }
    return null;
  }

  private async json<T>(res: Response, label: string): Promise<T> {
    if (!res.ok) throw new Error(`${label} API error: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private tooBig(media: MediaToInterpret, max: number, label: string): boolean {
    if (media.buffer.length <= max) return false;
    this.logger.log(
      `Adjunto de tipo ${label} de ${Math.round(media.buffer.length / 1024 / 1024)} MB: supera el tope para interpretarlo, se archiva sin leer.`,
    );
    return true;
  }

  /** `audio/ogg; codecs=opus` → `audio/ogg`: los proveedores rechazan el parámetro. */
  private baseMime(mime: string): string {
    return (mime || 'application/octet-stream').split(';')[0].trim();
  }

  private dataUri(buffer: Buffer, mime: string): string {
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private trim(text: string): string {
    const clean = text.replace(/\s+\n/g, '\n').trim();
    return clean.length > MAX_TEXT_CHARS
      ? `${clean.slice(0, MAX_TEXT_CHARS)}…`
      : clean;
  }
}
