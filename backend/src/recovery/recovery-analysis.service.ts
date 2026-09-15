import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService, type AiApiKeys, type ChatMessage } from '../ai/ai.service';
import { SettingsService } from '../settings/settings.service';
import { SuppressionService } from '../suppression/suppression.service';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { Customer } from '../customers/customer.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import {
  RecoveryPlan,
  RecoveryRecipient,
  RecoverySegment,
} from './recovery-plan.schema';
import {
  DEFAULT_BATCHING,
  EXCLUSION_REASONS,
  RECOVERABLE_STAGES,
  SEGMENT_DEFS,
  bestHour,
  hourHistogram,
  normalizeStage,
  recommendSchedule,
  validateTemplateBody,
} from './recovery.helpers';

/** Tope de conversaciones por análisis: más allá la espera deja de ser razonable. */
const MAX_CONVERSATIONS = 400;
/** Mensajes por conversación que ve la IA: los últimos, que es donde se cayó. */
const MESSAGES_PER_CONVERSATION = 14;
const CHUNK_SIZE = 15;
const CONCURRENCY = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface AiOptions {
  provider: 'auto' | 'openai' | 'claude' | 'deepseek' | 'gemini';
  model?: string;
  apiKeys: AiApiKeys;
}

interface Classified {
  id: string;
  stage: string;
  note: string;
  name?: string;
}

interface PlanDraft {
  headline?: string;
  summary?: string;
  insights?: string[];
  segments?: Record<
    string,
    { name?: string; description?: string; strategy?: string; message?: string }
  >;
}

const STAGE_GUIDE = `- interesado: mostró interés claro (pidió demo, precio final, cómo pagar, agendar) y dejó de responder.
- objecion: dejó una duda u objeción concreta sin resolver (precio, dominio, tiempos, encaje con su caso…).
- vio_precio: recibió la información o el precio y no volvió a escribir, sin objeción explícita.
- sin_conversacion: solo mandó el mensaje prellenado del anuncio o un saludo, nunca conversó de verdad.
- cliente: ya compró, pagó o contrató.
- no_encaja: no es público objetivo, buscaba otra cosa o dijo claramente que no le interesa.
- no_contactar: pidió que no le escriban, se quejó o se mostró molesto.
- en_curso: la conversación sigue viva y lo que toca es responderle, no una campaña.`;

@Injectable()
export class RecoveryAnalysisService {
  private readonly logger = new Logger(RecoveryAnalysisService.name);

  constructor(
    @InjectModel(RecoveryPlan.name) private planModel: Model<RecoveryPlan>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    private ai: AiService,
    private settings: SettingsService,
    private suppression: SuppressionService,
  ) {}

  /** Corre en segundo plano: el progreso y el resultado quedan en el plan. */
  async run(planId: string): Promise<void> {
    const plan = await this.planModel.findById(planId).exec();
    if (!plan) return;
    try {
      await this.analyze(plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Análisis del plan ${planId} falló: ${message}`);
      await this.planModel
        .updateOne(
          { _id: plan._id },
          { $set: { status: 'failed', 'analysis.error': message } },
        )
        .exec();
    }
  }

  private async analyze(plan: RecoveryPlan): Promise<void> {
    const tenantId = String(plan.tenantId);
    const tid = new Types.ObjectId(tenantId);
    const since = new Date(Date.now() - plan.lookbackDays * 86_400_000);

    const conversations = await this.conversationModel
      .find({
        tenantId: tid,
        channel: 'whatsapp',
        lastMessageAt: { $gte: since },
      })
      .sort({ lastMessageAt: -1 })
      .limit(MAX_CONVERSATIONS)
      .lean<Conversation[]>()
      .exec();

    const ids = conversations.map((c) => c._id);
    const inbound = await this.messageModel
      .find(
        { conversationId: { $in: ids }, direction: 'in', at: { $gte: since } },
        { conversationId: 1, at: 1 },
      )
      .lean<{ conversationId: Types.ObjectId; at: Date }[]>()
      .exec();

    const lastInbound = new Map<string, Date>();
    for (const m of inbound) {
      const key = String(m.conversationId);
      const prev = lastInbound.get(key);
      if (!prev || m.at > prev) lastInbound.set(key, m.at);
    }
    // Sin un solo mensaje del cliente no hay nada que recuperar.
    const candidates = conversations.filter((c) =>
      lastInbound.has(String(c._id)),
    );
    if (!candidates.length)
      throw new Error(
        `No hay conversaciones de WhatsApp con mensajes de clientes en los últimos ${plan.lookbackDays} días`,
      );

    await this.planModel
      .updateOne(
        { _id: plan._id },
        {
          $set: {
            'analysis.total': candidates.length,
            'analysis.processed': 0,
          },
        },
      )
      .exec();

    const customerIds = candidates
      .map((c) => c.customerId)
      .filter((id): id is Types.ObjectId => !!id);
    const customers = await this.customerModel
      .find({ _id: { $in: customerIds } }, { name: 1 })
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec();
    const customerName = new Map(customers.map((c) => [String(c._id), c.name]));

    const suppressed = await this.suppression.setFor(tenantId);
    const businessContext = await this.businessContext(tid, plan.context);
    const ai = await this.aiOptions(tenantId);

    // ── 1. Clasificar por tandas ──
    const classified = new Map<string, Classified>();
    const toClassify = candidates.filter(
      (c) => !this.suppression.matches(suppressed, { phone: c.contact }),
    );
    const chunks: Conversation[][] = [];
    for (let i = 0; i < toClassify.length; i += CHUNK_SIZE)
      chunks.push(toClassify.slice(i, i + CHUNK_SIZE));

    let processed = candidates.length - toClassify.length;
    let failedChunks = 0;
    let lastError = '';
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      await Promise.all(
        chunks.slice(i, i + CONCURRENCY).map(async (chunk) => {
          const result = await this.classifyChunk(chunk, businessContext, ai);
          if ('error' in result) {
            failedChunks++;
            lastError = result.error;
          } else {
            for (const item of result.items) classified.set(item.id, item);
          }
          processed += chunk.length;
        }),
      );
      await this.planModel
        .updateOne(
          { _id: plan._id },
          { $set: { 'analysis.processed': processed } },
        )
        .exec();
    }
    if (chunks.length && failedChunks === chunks.length)
      throw new Error(
        `La IA no pudo analizar las conversaciones (${ai.provider}${ai.model ? ' · ' + ai.model : ''}): ${lastError}`,
      );

    // ── 2. Armar destinatarios ──
    const now = Date.now();
    const byStage = new Map<string, RecoveryRecipient[]>();
    const excluded: RecoveryRecipient[] = [];
    for (const conv of candidates) {
      const id = String(conv._id);
      const item = classified.get(id);
      const isSuppressed = this.suppression.matches(suppressed, {
        phone: conv.contact,
      });
      const stage = normalizeStage(item?.stage);
      const last = lastInbound.get(id)!;
      const recipient: RecoveryRecipient = {
        conversationId: id,
        customerId: conv.customerId ? String(conv.customerId) : undefined,
        name:
          (conv.customerId && customerName.get(String(conv.customerId))) ||
          conv.contactName ||
          item?.name ||
          '',
        phone: conv.contact,
        lastMessageAt: conv.lastMessageAt,
        stage,
        note:
          item?.note?.slice(0, 240) ?? (isSuppressed ? '' : 'Sin clasificar'),
        insideWindow: now - last.getTime() < WINDOW_MS,
        sendStatus: 'pending',
      };
      if (isSuppressed) {
        excluded.push({ ...recipient, reason: EXCLUSION_REASONS.suppressed });
      } else if (!RECOVERABLE_STAGES.includes(stage)) {
        excluded.push({ ...recipient, reason: EXCLUSION_REASONS[stage] });
      } else {
        byStage.set(stage, [...(byStage.get(stage) ?? []), recipient]);
      }
    }

    const hist = hourHistogram(
      inbound.map((m) => m.at),
      plan.timezone,
    );
    const stages = RECOVERABLE_STAGES.filter((s) => byStage.get(s)?.length);

    // ── 3. Plan y mensajes ──
    const draft = await this.draftPlan(
      stages.map((s) => ({ key: s, recipients: byStage.get(s)! })),
      excluded,
      candidates.length,
      businessContext,
      ai,
    );

    const schedule = recommendSchedule(stages.length, hist, plan.timezone);
    const segments: RecoverySegment[] = stages.map((key, i) => {
      const def = SEGMENT_DEFS[key];
      const text = draft.segments?.[key] ?? {};
      const message = text.message?.trim() ?? '';
      return {
        key,
        name: text.name?.trim() || def.name,
        description: text.description?.trim() || def.description,
        strategy: text.strategy?.trim() || '',
        color: def.color,
        enabled: true,
        recipients: byStage.get(key)!,
        message: validateTemplateBody(message) ? fallbackMessage(key) : message,
        recommendedAt: schedule[i]?.sendAt,
        recommendationReason: schedule[i]?.reason,
        sendAt: schedule[i]?.sendAt,
        ...DEFAULT_BATCHING,
        sendStatus: 'idle',
      };
    });

    await this.planModel
      .updateOne(
        { _id: plan._id },
        {
          $set: {
            status: 'review',
            segments,
            excluded,
            analysis: {
              total: candidates.length,
              processed: candidates.length,
              analyzedAt: new Date(),
              headline: draft.headline ?? '',
              summary: draft.summary ?? '',
              insights: (draft.insights ?? []).slice(0, 6),
              hourHistogram: hist,
              bestHour: bestHour(hist),
              insideWindow: [
                ...segments.flatMap((s) => s.recipients),
                ...excluded,
              ].filter((r) => r.insideWindow).length,
            },
          },
        },
      )
      .exec();
  }

  /** Reescribe el mensaje de un segmento siguiendo la indicación del usuario. */
  async rewriteMessage(
    plan: RecoveryPlan,
    segment: RecoverySegment,
    instruction: string,
  ): Promise<string> {
    const tenantId = String(plan.tenantId);
    const context = await this.businessContext(plan.tenantId, plan.context);
    const notes = segment.recipients
      .slice(0, 10)
      .map((r) => `- ${r.note}`)
      .join('\n');
    const prompt = `${MESSAGE_RULES}

CONTEXTO DEL NEGOCIO:
${context}

SEGMENTO: ${segment.name} (${segment.recipients.length} personas)
${segment.description}
Qué pasó en algunas conversaciones:
${notes}

MENSAJE ACTUAL:
${segment.message}

INDICACIÓN DEL USUARIO:
${instruction?.trim() || 'Escribe una alternativa distinta, igual de breve.'}

Responde SOLO con JSON: {"message":"..."}`;

    const raw = await this.ai.chatMessages(
      [{ role: 'user', content: prompt }],
      {
        maxTokens: 4000,
        temperature: 0.7,
        ...(await this.aiOptions(tenantId)),
      },
    );
    const { message } = this.ai.parseJson<{ message?: string }>(raw);
    return (message ?? '').trim();
  }

  // ──────────────────────────────────────────────────────────────────────

  private async classifyChunk(
    chunk: Conversation[],
    context: string,
    ai: AiOptions,
  ): Promise<{ items: Classified[] } | { error: string }> {
    const transcripts = await Promise.all(
      chunk.map(async (conv) => {
        const msgs = await this.messageModel
          .find(
            { conversationId: conv._id },
            { direction: 1, type: 1, text: 1, at: 1 },
          )
          .sort({ at: -1 })
          .limit(MESSAGES_PER_CONVERSATION)
          .lean<Message[]>()
          .exec();
        const hours = Math.round(
          (Date.now() - new Date(conv.lastMessageAt).getTime()) / 3_600_000,
        );
        const lines = msgs
          .reverse()
          .map((m) => {
            const who = m.direction === 'in' ? 'Cliente' : 'Negocio';
            const text = m.text?.trim()
              ? m.text.trim().replace(/\s+/g, ' ').slice(0, 280)
              : `[${m.type}]`;
            return `${who}: ${text}`;
          })
          .join('\n');
        return `### id=${String(conv._id)} · nombre de perfil: ${conv.contactName || '—'} · último mensaje hace ${hours} h\n${lines}`;
      }),
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Eres analista comercial. Clasificas conversaciones de WhatsApp entre un negocio y sus clientes potenciales para decidir a quién escribir en una campaña de recuperación.

CONTEXTO DEL NEGOCIO:
${context}

ETAPAS (usa exactamente una de estas claves):
${STAGE_GUIDE}

Para cada conversación devuelve:
- id: el id tal cual.
- stage: la clave de la etapa.
- note: una frase en español (máx. 140 caracteres) con lo que buscaba y dónde se quedó. Concreta, sin adornos.
- name: el nombre de pila si el cliente lo dijo en la conversación; si no, "".

Responde SOLO con JSON: {"items":[{"id":"","stage":"","note":"","name":""}]}`,
      },
      { role: 'user', content: transcripts.join('\n\n') },
    ];

    let error = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Tope amplio: los modelos de razonamiento gastan tokens pensando antes
        // de escribir, y con un tope corto devuelven la respuesta vacía.
        const raw = await this.ai.chatMessages(messages, {
          maxTokens: 12000,
          temperature: 0.1,
          ...ai,
        });
        const parsed = this.ai.parseJson<
          { items?: Classified[] } | Classified[]
        >(raw);
        const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
        return { items: items.filter((i) => i?.id) };
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Clasificación de ${chunk.length} conversaciones falló (intento ${attempt + 1}): ${error}`,
        );
      }
    }
    return { error: error.slice(0, 300) };
  }

  private async draftPlan(
    segments: { key: string; recipients: RecoveryRecipient[] }[],
    excluded: RecoveryRecipient[],
    total: number,
    context: string,
    ai: AiOptions,
  ): Promise<PlanDraft> {
    if (!segments.length)
      return {
        headline: 'No hay a quién recuperar',
        summary:
          'Todas las conversaciones analizadas son clientes, están activas o no conviene escribirles.',
        insights: [],
      };

    const describe = segments
      .map((s) => {
        const notes = s.recipients
          .slice(0, 15)
          .map((r) => `  - ${r.note}`)
          .join('\n');
        return `[${s.key}] ${SEGMENT_DEFS[s.key].name} — ${s.recipients.length} personas\n${notes}`;
      })
      .join('\n\n');
    const exclusions = Object.entries(
      excluded.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason ?? ''] = (acc[r.reason ?? ''] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([reason, n]) => `- ${reason}: ${n}`)
      .join('\n');

    const prompt = `Eres estratega de ventas por WhatsApp. Con el análisis de ${total} conversaciones, arma un plan de recuperación claro para el dueño del negocio.

CONTEXTO DEL NEGOCIO:
${context}

SEGMENTOS RECUPERABLES:
${describe}

EXCLUIDOS:
${exclusions || '- ninguno'}

${MESSAGE_RULES}

Devuelve:
- headline: una frase (máx. 90 caracteres) con la conclusión principal.
- summary: 2–3 frases, en tú, explicando por qué se cayeron y qué se va a hacer.
- insights: 3 a 5 hallazgos concretos y accionables (con números cuando los haya).
- segments: para cada clave de segmento, { name (máx. 40 caracteres), description (1 frase), strategy (1 frase: por qué este mensaje), message (la plantilla) }.

Responde SOLO con JSON:
{"headline":"","summary":"","insights":[""],"segments":{"clave":{"name":"","description":"","strategy":"","message":""}}}`;

    try {
      const raw = await this.ai.chatMessages(
        [{ role: 'user', content: prompt }],
        {
          maxTokens: 12000,
          temperature: 0.5,
          ...ai,
        },
      );
      return this.ai.parseJson<PlanDraft>(raw);
    } catch (err) {
      this.logger.warn(`No se pudo redactar el plan: ${String(err)}`);
      return {
        headline: `${segments.reduce((n, s) => n + s.recipients.length, 0)} personas se pueden recuperar`,
        summary: '',
        insights: [],
      };
    }
  }

  private async businessContext(
    tenantId: Types.ObjectId | string,
    userContext: string,
  ): Promise<string> {
    const agent = await this.agentModel
      .findOne(
        { tenantId: new Types.ObjectId(String(tenantId)) },
        { systemPrompt: 1 },
      )
      .sort({ updatedAt: -1 })
      .lean<{ systemPrompt?: string }>()
      .exec();
    const parts = [
      userContext?.trim()
        ? `Lo que el dueño quiere comunicar en esta campaña (oferta, fecha límite, quién firma):\n${userContext.trim()}`
        : '',
      agent?.systemPrompt
        ? `Instrucciones del asistente de ventas del negocio (producto, precios, enlaces):\n${agent.systemPrompt.slice(0, 5000)}`
        : '',
    ].filter(Boolean);
    return parts.join('\n\n') || 'Sin información adicional del negocio.';
  }

  /**
   * Proveedor, modelo y keys para hablar con la IA: los mismos del agente del
   * tenant, que es la configuración que ya funciona. Con `auto` se elegía la
   * primera key de entorno (DeepSeek) aunque el tenant tuviera la suya propia
   * de otro proveedor.
   */
  private async aiOptions(tenantId: string): Promise<AiOptions> {
    const cfg = await this.settings.get(tenantId);
    const apiKeys: AiApiKeys = {
      openai: cfg?.openaiApiKey,
      deepseek: cfg?.deepseekApiKey,
      gemini: cfg?.geminiApiKey,
      claude: cfg?.claudeApiKey,
    };
    const agent = await this.agentModel
      .findOne(
        { tenantId: { $in: [tenantId, new Types.ObjectId(tenantId)] } },
        { provider: 1, aiModel: 1 },
      )
      .sort({ updatedAt: -1 })
      .lean<{ provider?: string; aiModel?: string }>()
      .exec();
    const provider = agent?.provider as AiOptions['provider'] | undefined;
    if (provider && provider !== 'auto')
      return { provider, model: agent?.aiModel, apiKeys };

    const own = (['openai', 'claude', 'gemini', 'deepseek'] as const).find(
      (p) => apiKeys[p]?.trim(),
    );
    return { provider: own ?? 'auto', apiKeys };
  }
}

const MESSAGE_RULES = `REGLAS PARA CADA MENSAJE (es una plantilla de WhatsApp de marketing que revisa Meta):
1. Empieza exactamente con "Hola {{1}}," — {{1}} es el nombre del cliente. No uses ninguna otra variable.
2. Reconoce sin culpar: nada de "no me respondiste" ni "hace tiempo que no hablamos".
3. Da antes de pedir: responde la duda que quedó colgando o regala algo útil.
4. Pide una sola cosa que cueste poco (responder una palabra, abrir un enlace).
5. Corto de verdad: máximo 450 caracteres y 3 párrafos breves. Termina en pregunta.
6. Solo usa ofertas, precios, fechas y enlaces que aparezcan en el contexto. No inventes escasez ni "precio de por vida".
7. A quien nunca conversó ("sin_conversacion") no le pongas la oferta: primero hay que generar conversación.
8. Tono cercano, en tú, como escribiría una persona. Máximo un emoji.`;

function fallbackMessage(key: string): string {
  const byKey: Record<string, string> = {
    interesado:
      'Hola {{1}}, te escribo porque me quedé con tu consulta a medias y no quería dejarla así.\n\nSi te sigue interesando, te preparo lo que necesitas para decidir, sin compromiso.\n\n¿Lo vemos?',
    objecion:
      'Hola {{1}}, me quedé pensando en la duda que me dejaste y quería respondértela bien.\n\nSi me cuentas un poco más de tu caso, te digo con honestidad si te encaja o no.\n\n¿Te parece?',
    vio_precio:
      'Hola {{1}}, el otro día te mandé mucha información de golpe y así cuesta entender lo importante.\n\nTe lo resumo en un minuto según lo que necesites.\n\n¿Qué es lo que más te interesa resolver?',
    sin_conversacion:
      'Hola {{1}}, vi que te interesó nuestro anuncio y no llegamos a conversar.\n\nNo te voy a mandar un catálogo: solo quiero saber qué buscas para decirte si te podemos ayudar.\n\n¿Me cuentas?',
  };
  return byKey[key] ?? byKey.vio_precio;
}
