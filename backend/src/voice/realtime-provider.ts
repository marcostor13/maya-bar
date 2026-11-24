import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiTool } from '../ai/providers/ai-provider.interface';

/** Token de inyección: las pruebas lo reemplazan por uno falso. */
export const VOICE_REALTIME_PROVIDER = Symbol('VOICE_REALTIME_PROVIDER');

export interface VoiceSessionConfig {
  instructions: string;
  tools: AiTool[];
  voice?: string;
}

export interface VoiceHandlers {
  /** El modelo pide una herramienta; lo que devuelva vuelve al modelo. */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onTranscript: (who: 'cliente' | 'agente', text: string) => void;
  onClosed: () => void;
}

export interface VoiceRealtimeProvider {
  readonly configured: boolean;
  /** Recibe la oferta SDP de Meta y devuelve la respuesta del modelo de voz. */
  start(
    offerSdp: string,
    cfg: VoiceSessionConfig,
  ): Promise<{ answerSdp: string; sessionId: string }>;
  /** Canal de control: herramientas y transcripción mientras dura la llamada. */
  attach(sessionId: string, handlers: VoiceHandlers): void;
  hangup(sessionId: string): Promise<void>;
}

/**
 * OpenAI Realtime por WebRTC (HU73). El audio va directo Meta ↔ OpenAI: se le
 * pasa la oferta SDP de la llamada de WhatsApp y su respuesta vuelve a Meta.
 * El servidor solo escucha el canal de control (WebSocket "sideband") para
 * ejecutar herramientas y guardar la transcripción.
 */
@Injectable()
export class OpenAiRealtimeProvider implements VoiceRealtimeProvider {
  private readonly logger = new Logger(OpenAiRealtimeProvider.name);
  private readonly key: string;
  private readonly model: string;
  private readonly sockets = new Map<string, WebSocket>();

  constructor(config: ConfigService) {
    this.key = config.get<string>('OPENAI_API_KEY') ?? '';
    this.model = config.get<string>('VOICE_REALTIME_MODEL') || 'gpt-realtime';
  }

  get configured() {
    return !!this.key;
  }

  async start(offerSdp: string, cfg: VoiceSessionConfig) {
    const form = new FormData();
    form.set('sdp', offerSdp);
    form.set(
      'session',
      JSON.stringify({
        type: 'realtime',
        model: this.model,
        instructions: cfg.instructions,
        audio: {
          input: { transcription: { model: 'gpt-4o-mini-transcribe' } },
          output: { voice: cfg.voice || 'marin' },
        },
        tools: cfg.tools.map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }),
    );
    const res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}` },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new Error(
        `Realtime ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    const answerSdp = await res.text();
    const sessionId = (res.headers.get('location') ?? '').split('/').pop();
    if (!sessionId) throw new Error('Realtime no devolvió el id de la llamada');
    return { answerSdp, sessionId };
  }

  attach(sessionId: string, h: VoiceHandlers) {
    // WebSocket nativo de Node (undici): acepta cabeceras como extensión.
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${this.key}` },
      } as unknown as string[],
    );
    this.sockets.set(sessionId, ws);
    const send = (o: unknown) =>
      ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
    ws.addEventListener('open', () => send({ type: 'response.create' })); // saluda primero
    ws.addEventListener('message', (msg: MessageEvent) => {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(String(msg.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = ev.type as string;
      if (type === 'conversation.item.input_audio_transcription.completed')
        h.onTranscript(
          'cliente',
          typeof ev.transcript === 'string' ? ev.transcript : '',
        );
      else if (type === 'response.output_audio_transcript.done')
        h.onTranscript(
          'agente',
          typeof ev.transcript === 'string' ? ev.transcript : '',
        );
      else if (type === 'response.function_call_arguments.done') {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(
            typeof ev.arguments === 'string' ? ev.arguments : '{}',
          ) as Record<string, unknown>;
        } catch {
          /* argumentos inválidos: la herramienta lo dirá */
        }
        void h
          .onToolCall(String(ev.name), args)
          .catch((err: unknown) => ({ error: String(err) }))
          .then((out) => {
            send({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: ev.call_id,
                output: JSON.stringify(out ?? {}),
              },
            });
            send({ type: 'response.create' });
          });
      } else if (type === 'error')
        this.logger.warn(`Realtime: ${JSON.stringify(ev.error).slice(0, 300)}`);
    });
    ws.addEventListener('close', () => {
      this.sockets.delete(sessionId);
      h.onClosed();
    });
    ws.addEventListener('error', () =>
      this.logger.warn('Sideband: error de conexión'),
    );
  }

  async hangup(sessionId: string) {
    this.sockets.get(sessionId)?.close();
    await fetch(
      `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(sessionId)}/hangup`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}` },
        signal: AbortSignal.timeout(5_000),
      },
    ).catch(() => undefined);
  }
}
