import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiAgent, HandoffTarget } from './ai-agent.schema';
import { KnowledgeDoc } from './knowledge-doc.schema';
import { AgentFile } from './agent-file.schema';
import {
  CreateAiAgentDto,
  UpdateAiAgentDto,
  AddDocDto,
  AgentFileDto,
} from './dto/ai-agent.dto';
import { RagService } from './rag.service';
import { AiService, ChatMessage, AiApiKeys } from '../ai/ai.service';
import {
  AI_MODEL_CATALOG,
  AiModelOption,
  isChatModel,
  mergeWithCatalog,
} from '../ai/ai-models.catalog';
import type { AiProviderId } from '../ai/providers/ai-provider.interface';
import { TenantConfig } from '../settings/tenant-config.schema';
import { WaMediaType } from '../whatsapp/whatsapp.service';
import { normalizeStoreUrl, WooStoreService } from './store/woo-store.service';
import { StoreToolSession } from './store/store-tools';
import { formatForChat, storeUrlsIn } from './chat-links';
import { LinksService } from '../links/links.service';
import type { LinkChannel } from '../links/link.schemas';
import { CalendarService } from '../calendar/calendar.service';
import { formatLocal } from '../calendar/availability';
import { AgentBooking } from './calendar/agent-booking.schema';
import {
  agentCalendar,
  assertAgentCalendar,
  type AgentCalendarConfig,
} from './calendar/agent-calendar';
import {
  CalendarToolSession,
  type BookedCita,
  type BookingStore,
} from './calendar/calendar-tools';
import type { AiToolCall } from '../ai/ai.service';

// Igual que AI_HISTORY_LIMIT de la bandeja: si el chat pasó por manual, el
// agente tiene que ver lo que escribió la persona antes de retomar.
const HISTORY_LIMIT = 20;
const SEND_FILE_TOKEN = /\{\{SEND_FILE:([a-zA-Z0-9_-]+)\}\}/g;
/** {{HANDOFF}} o {{HANDOFF:motivo breve}} — deriva el chat a una persona. */
const HANDOFF_TOKEN = /\{\{HANDOFF(?::([^}]*))?\}\}/g;

export interface AgentFileSend {
  url: string;
  contentType?: string;
  name: string;
  /**
   * Solo en fotos de producto de la tienda (van antes del texto). Con texto, es
   * el mensaje del agente; vacío, el pie es el nombre del producto.
   */
  caption?: string;
}

/** WhatsApp admite pies de foto de hasta 1024 caracteres. */
const MAX_CAPTION = 1024;

/** '' quita la tienda; cualquier otra cosa tiene que ser una URL https pública. */
function storePatch(dto: CreateAiAgentDto | UpdateAiAgentDto) {
  if (dto.storeUrl === undefined) return {};
  const url = dto.storeUrl.trim();
  return { storeUrl: url ? normalizeStoreUrl(url) : undefined };
}

/** El agente pidió que una persona tome la conversación. */
export interface AgentHandoff {
  reason?: string;
}

/** Contexto de la conversación que necesita el agente para agendar. */
export interface AgentAnswerOptions {
  channelHint?: string;
  channel?: string;
  conversationId?: string;
  contactName?: string;
  contactEmail?: string;
  /** Playground: las herramientas que escriben (agendar) solo simulan. */
  simulate?: boolean;
}

/** Deja los números en E.164 sin '+' y descarta los vacíos o duplicados. */
function normalizePhones(numbers?: string[]): string[] {
  const clean = (numbers ?? [])
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 8);
  return [...new Set(clean)];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Limpia los destinatarios del aviso: teléfonos en E.164 sin '+', correos en
 * minúsculas; descarta los inválidos y los repetidos en el mismo canal.
 */
export function normalizeHandoffTargets(
  targets?: HandoffTarget[],
): HandoffTarget[] {
  const seen = new Set<string>();
  const out: HandoffTarget[] = [];
  for (const t of targets ?? []) {
    const to =
      t.channel === 'email'
        ? t.to.trim().toLowerCase()
        : t.to.replace(/\D/g, '');
    const valid = t.channel === 'email' ? EMAIL_RE.test(to) : to.length >= 8;
    const key = `${t.channel}:${to}`;
    if (!valid || seen.has(key)) continue;
    seen.add(key);
    // SMS sale siempre por el proveedor de la empresa: no hay cuenta que elegir.
    const accountId =
      t.channel !== 'sms' && t.accountId && Types.ObjectId.isValid(t.accountId)
        ? t.accountId
        : undefined;
    out.push({ channel: t.channel, to, ...(accountId ? { accountId } : {}) });
  }
  return out;
}

@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);

  constructor(
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    @InjectModel(KnowledgeDoc.name) private docModel: Model<KnowledgeDoc>,
    @InjectModel(AgentFile.name) private fileModel: Model<AgentFile>,
    @InjectModel(TenantConfig.name) private configModel: Model<TenantConfig>,
    @InjectModel(AgentBooking.name) private bookingModel: Model<AgentBooking>,
    private rag: RagService,
    private ai: AiService,
    private store: WooStoreService,
    private links: LinksService,
    private calendar: CalendarService,
  ) {}

  /** Lee las API keys de IA configuradas por el tenant. */
  async getTenantApiKeys(
    tenantId: string | Types.ObjectId,
  ): Promise<AiApiKeys> {
    const cfg = await this.configModel
      .findOne({ tenantId: new Types.ObjectId(String(tenantId)) })
      .exec();
    return {
      openai: cfg?.openaiApiKey,
      deepseek: cfg?.deepseekApiKey,
      gemini: cfg?.geminiApiKey,
      claude: cfg?.claudeApiKey,
    };
  }

  // ---- CRUD agentes ----

  private tenantMatch(tenantId: string): { $in: (string | Types.ObjectId)[] } {
    const values: (string | Types.ObjectId)[] = [tenantId];
    if (Types.ObjectId.isValid(tenantId))
      values.push(new Types.ObjectId(tenantId));
    return { $in: values };
  }

  findAll(tenantId: string) {
    return this.agentModel
      .find({ tenantId: this.tenantMatch(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<AiAgent> {
    const doc = await this.agentModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: this.tenantMatch(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Agente no encontrado');
    return doc;
  }

  create(tenantId: string, userId: string, dto: CreateAiAgentDto) {
    if (dto.calendar) assertAgentCalendar(dto.calendar);
    return this.agentModel.create({
      ...dto,
      accountIds: (dto.accountIds ?? []).map((a) => new Types.ObjectId(a)),
      instagramAccountIds: (dto.instagramAccountIds ?? []).map(
        (a) => new Types.ObjectId(a),
      ),
      messengerAccountIds: (dto.messengerAccountIds ?? []).map(
        (a) => new Types.ObjectId(a),
      ),
      emailAccountIds: (dto.emailAccountIds ?? []).map(
        (a) => new Types.ObjectId(a),
      ),
      handoffTargets: normalizeHandoffTargets(dto.handoffTargets),
      handoffNumbers: normalizePhones(dto.handoffNumbers),
      handoffAccountId: dto.handoffAccountId
        ? new Types.ObjectId(dto.handoffAccountId)
        : undefined,
      ...storePatch(dto),
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(id: string, tenantId: string, dto: UpdateAiAgentDto) {
    if (dto.calendar) assertAgentCalendar(dto.calendar);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.accountIds)
      patch.accountIds = dto.accountIds.map((a) => new Types.ObjectId(a));
    if (dto.instagramAccountIds)
      patch.instagramAccountIds = dto.instagramAccountIds.map(
        (a) => new Types.ObjectId(a),
      );
    if (dto.messengerAccountIds)
      patch.messengerAccountIds = dto.messengerAccountIds.map(
        (a) => new Types.ObjectId(a),
      );
    if (dto.emailAccountIds)
      patch.emailAccountIds = dto.emailAccountIds.map(
        (a) => new Types.ObjectId(a),
      );
    if (dto.handoffTargets)
      patch.handoffTargets = normalizeHandoffTargets(dto.handoffTargets);
    if (dto.handoffNumbers)
      patch.handoffNumbers = normalizePhones(dto.handoffNumbers);
    if (dto.handoffAccountId !== undefined)
      patch.handoffAccountId = dto.handoffAccountId
        ? new Types.ObjectId(dto.handoffAccountId)
        : null;
    if (dto.storeUrl !== undefined)
      patch.storeUrl = storePatch(dto).storeUrl ?? null;
    const doc = await this.agentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId: this.tenantMatch(tenantId) },
        { $set: patch },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Agente no encontrado');
    return doc;
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.rag.deleteByAgent(id);
    await this.docModel.deleteMany({ agentId: new Types.ObjectId(id) }).exec();
    await this.fileModel.deleteMany({ agentId: new Types.ObjectId(id) }).exec();
    await this.agentModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
    return { deleted: true };
  }

  // ---- Base de conocimiento (RAG) ----

  listDocs(agentId: string, tenantId: string) {
    return this.docModel
      .find({
        agentId: new Types.ObjectId(agentId),
        tenantId: this.tenantMatch(tenantId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async addDoc(agentId: string, tenantId: string, dto: AddDocDto) {
    await this.findOne(agentId, tenantId);
    if (!dto.url) throw new BadRequestException('Falta la URL del archivo');
    const doc = await this.docModel.create({
      tenantId: new Types.ObjectId(tenantId),
      agentId: new Types.ObjectId(agentId),
      filename: dto.filename,
      url: dto.url,
      key: dto.key,
      contentType: dto.contentType,
      status: 'processing',
    });
    void this.processDoc(doc.id, tenantId, agentId, dto);
    return doc;
  }

  private async processDoc(
    docId: string,
    tenantId: string,
    agentId: string,
    dto: AddDocDto,
  ) {
    try {
      const res = await fetch(dto.url);
      if (!res.ok)
        throw new Error(`No se pudo descargar el archivo (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const { chunkCount, charCount } = await this.rag.ingest(
        tenantId,
        agentId,
        docId,
        buffer,
        dto.contentType,
      );
      await this.docModel
        .updateOne(
          { _id: new Types.ObjectId(docId) },
          { $set: { status: 'ready', chunkCount, charCount } },
        )
        .exec();
    } catch (err) {
      this.logger.error(`Error procesando doc ${docId}: ${String(err)}`);
      await this.docModel
        .updateOne(
          { _id: new Types.ObjectId(docId) },
          { $set: { status: 'error', error: String(err) } },
        )
        .exec();
    }
  }

  async deleteDoc(agentId: string, docId: string, tenantId: string) {
    const doc = await this.docModel
      .findOne({
        _id: new Types.ObjectId(docId),
        agentId: new Types.ObjectId(agentId),
        tenantId: this.tenantMatch(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.rag.deleteByDoc(docId);
    await this.docModel.deleteOne({ _id: doc._id }).exec();
    return { deleted: true };
  }

  // ---- Archivos enviables ----

  listFiles(agentId: string, tenantId: string) {
    return this.fileModel
      .find({
        agentId: new Types.ObjectId(agentId),
        tenantId: this.tenantMatch(tenantId),
      })
      .sort({ alias: 1 })
      .exec();
  }

  async addFile(agentId: string, tenantId: string, dto: AgentFileDto) {
    await this.findOne(agentId, tenantId);
    if (!dto.alias || !dto.url)
      throw new BadRequestException('Faltan alias o URL');
    const alias = dto.alias.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!alias)
      throw new BadRequestException(
        'El alias solo puede contener letras, números, guiones y guiones bajos',
      );
    try {
      return await this.fileModel.create({
        tenantId: new Types.ObjectId(tenantId),
        agentId: new Types.ObjectId(agentId),
        alias,
        name: dto.name,
        filename: dto.filename,
        url: dto.url,
        key: dto.key,
        contentType: dto.contentType,
      });
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 11000)
        throw new BadRequestException(
          `Ya existe un archivo con el alias "${alias}" en este agente`,
        );
      throw err;
    }
  }

  async deleteFile(agentId: string, fileId: string, tenantId: string) {
    const file = await this.fileModel
      .findOne({
        _id: new Types.ObjectId(fileId),
        agentId: new Types.ObjectId(agentId),
        tenantId: this.tenantMatch(tenantId),
      })
      .exec();
    if (!file) throw new NotFoundException('Archivo no encontrado');
    await this.fileModel.deleteOne({ _id: file._id }).exec();
    return { deleted: true };
  }

  // ---- Generación de respuesta ----

  /** Construye la sección de archivos para inyectar en el system prompt. */
  private buildFilesPromptSection(files: AgentFile[]): string {
    if (!files.length) return '';
    const list = files
      .map((f) => `{{SEND_FILE:${f.alias}}} → ${f.name} (${f.filename})`)
      .join('\n');
    return `\n\n--- ARCHIVOS QUE PUEDES ENVIAR ---\nCuando el cliente lo pida o sea muy relevante, incluye el token exacto en tu respuesta para enviar el archivo (puede ir antes o después de tu texto):\n\n${list}\n\nIMPORTANTE: Usa estos tokens solo cuando realmente debas enviar el archivo. El texto de tu respuesta (sin los tokens) se enviará como mensaje de texto normal.\n--- FIN ARCHIVOS ---`;
  }

  /** Sección del prompt que le enseña al agente a derivar el chat a una persona. */
  private buildHandoffPromptSection(agent: AiAgent): string {
    if (!agent.handoffEnabled) return '';
    const criteria = agent.handoffInstructions?.trim()
      ? `\n\nDeriva especialmente cuando: ${agent.handoffInstructions.trim()}`
      : '';
    return `\n\n--- DERIVAR A UNA PERSONA ---\nSi el cliente pide hablar con una persona, se molesta, reclama, o la consulta excede lo que puedes resolver, incluye el token exacto {{HANDOFF:motivo breve}} en tu respuesta${agent.storeUrl ? ' (o usa la herramienta derivar_a_humano, que además deja un resumen)' : ''}.\nAl usarlo se avisa a un agente humano para que entre a la plataforma y continúe el chat, y tú dejas de responder esta conversación.\nEscribe antes del token una frase avisando al cliente que lo estás derivando; el token se elimina y nunca se le muestra.${criteria}\nUsa el token una sola vez y solo cuando de verdad haga falta: una vez derivado no podrás volver a contestar.\n--- FIN DERIVAR ---`;
  }

  /** Le dice al agente que tiene la tienda en vivo y cómo usar sus herramientas. */
  private buildStorePromptSection(agent: AiAgent): string {
    if (!agent.storeUrl) return '';
    const cart =
      agent.storeCartMode === 'multi'
        ? 'El link de pago admite varios productos a la vez.'
        : 'El link de pago carga un producto por link; si son varios, la herramienta devuelve un link por producto.';
    return `\n\n--- TIENDA ONLINE EN VIVO (${agent.storeUrl}) ---\nTienes herramientas que consultan la tienda en tiempo real: buscar_producto (precio, stock, link e id), enviar_foto_producto (foto con pie de foto), generar_link_pago (checkout con el pedido cargado)${agent.handoffEnabled ? ' y derivar_a_humano' : ''}.\nLlámalas directamente, sin avisar antes al cliente que vas a revisar. Precios, stock, links e ids salen SOLO de lo que devuelven en esta respuesta: nunca los inventes ni los recuerdes de mensajes anteriores. Si el cliente pregunta por varios productos, búscalos todos a la vez.\n${cart}\nSi buscar_producto devuelve error web_no_responde, no adivines: comparte link_busqueda y ofrece un asesor.\nLinks: pega la URL completa tal como la devuelve la herramienta, sola en su línea y sin formato (nada de [texto](url), asteriscos ni signos pegados): el sistema la acorta y el cliente solo toca para abrirla.\n--- FIN TIENDA ---`;
  }

  /** Le enseña al agente a ofrecer horarios reales y agendar. */
  private buildCalendarPromptSection(
    cal: AgentCalendarConfig,
    now: Date,
  ): string {
    const extra = cal.instructions?.trim()
      ? `\nIndicaciones de la empresa para agendar: ${cal.instructions.trim()}`
      : '';
    return `\n\n--- AGENDA (calendario de la empresa) ---\nAhora es ${formatLocal(now, cal.timeZone)} (zona ${cal.timeZone}). Las citas duran ${cal.durationMinutes} minutos${cal.video ? ' e incluyen videollamada' : ''}.\nCuando el cliente quiera una cita, reunión, llamada o demo:\n1. Llama a consultar_disponibilidad (con las fechas que pida, si las dice) y ofrece 2 o 3 horarios con el campo "texto". Nunca propongas horarios que no salieron de la herramienta.\n2. Pide su nombre y, si quiere la invitación, su correo.\n3. Cuando elija, llama a agendar_cita con el campo "inicio" exacto del horario elegido.\n4. Confirma día, hora y zona horaria${cal.video ? ', y comparte el enlace de la videollamada si lo devolvió' : ''}.\nSi una herramienta devuelve error o no tienes herramientas de agenda, no inventes horarios: di que un asesor le confirmará la cita. Si el horario ya no está libre, ofrece las alternativas que devuelve.\nNo puedes reprogramar ni cancelar citas: para eso, deriva a una persona.${extra}\n--- FIN AGENDA ---`;
  }

  /** Registro de citas del agente (idempotencia por conversación e inicio). */
  private bookingStore(tenantId: string, agentId: string): BookingStore {
    const toCita = (d: AgentBooking): BookedCita => ({
      start: d.start,
      end: d.end,
      title: d.title,
      contactName: d.contactName ?? '',
      attendeeEmail: d.attendeeEmail,
      joinUrl: d.joinUrl,
      htmlLink: d.htmlLink,
      provider: d.provider,
      eventId: d.eventId ?? '',
      connectionId: d.connectionId ? String(d.connectionId) : undefined,
    });
    const oid = (id: string) => new Types.ObjectId(id);
    return {
      findExisting: async (conversationId, start) => {
        const d = await this.bookingModel
          .findOne({
            tenantId: oid(tenantId),
            conversationId: oid(conversationId),
            start,
            status: 'confirmed',
          })
          .exec();
        return d ? toCita(d) : null;
      },
      countUpcoming: (conversationId, now) =>
        this.bookingModel
          .countDocuments({
            tenantId: oid(tenantId),
            conversationId: oid(conversationId),
            status: { $in: ['pending', 'confirmed'] },
            start: { $gt: now },
          })
          .exec(),
      claim: async (b) => {
        try {
          await this.bookingModel.create({
            tenantId: oid(tenantId),
            agentId: oid(agentId),
            conversationId: oid(b.conversationId),
            connectionId:
              b.connectionId && Types.ObjectId.isValid(b.connectionId)
                ? oid(b.connectionId)
                : undefined,
            provider: b.provider,
            start: b.start,
            end: b.end,
            title: b.title,
            contactName: b.contactName,
            attendeeEmail: b.attendeeEmail,
            status: 'pending',
          });
          return true;
        } catch (err) {
          // Duplicado por índice único: otra respuesta ya la está agendando.
          if ((err as { code?: number }).code === 11000) return false;
          throw err;
        }
      },
      confirm: async (conversationId, start, c) => {
        await this.bookingModel
          .updateOne(
            { conversationId: oid(conversationId), start },
            {
              $set: {
                status: 'confirmed',
                eventId: c.eventId,
                provider: c.provider,
                joinUrl: c.joinUrl,
                htmlLink: c.htmlLink,
              },
            },
          )
          .exec();
      },
      release: async (conversationId, start) => {
        await this.bookingModel
          .deleteOne({
            conversationId: oid(conversationId),
            start,
            status: 'pending',
          })
          .exec();
      },
    };
  }

  /** Extrae el token {{HANDOFF}} de la respuesta y devuelve texto limpio + motivo. */
  private parseHandoffToken(
    reply: string,
    agent: AiAgent,
  ): { text: string; handoff: AgentHandoff | null } {
    let handoff: AgentHandoff | null = null;
    // El token se limpia SIEMPRE, también con la derivación apagada: es sintaxis
    // interna y un modelo puede emitirla por su cuenta. Antes se devolvía el
    // texto intacto y el `{{HANDOFF:…}}` viajaba tal cual hasta el cliente.
    const text = reply
      .replace(HANDOFF_TOKEN, (_, reason?: string) => {
        if (agent.handoffEnabled) {
          handoff ??= { reason: reason?.trim() || undefined };
        }
        return '';
      })
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { text, handoff };
  }

  /** Extrae tokens {{SEND_FILE:alias}} de la respuesta y devuelve texto limpio + archivos. */
  private parseFileTokens(
    reply: string,
    files: AgentFile[],
  ): { text: string; filesToSend: AgentFileSend[] } {
    const aliasMap = new Map(files.map((f) => [f.alias, f]));
    const filesToSend: AgentFileSend[] = [];
    const seen = new Set<string>();

    const text = reply
      .replace(SEND_FILE_TOKEN, (_, alias: string) => {
        if (!seen.has(alias) && aliasMap.has(alias)) {
          seen.add(alias);
          const f = aliasMap.get(alias)!;
          filesToSend.push({
            url: f.url,
            contentType: f.contentType,
            name: f.name,
          });
        }
        return '';
      })
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, filesToSend };
  }

  /**
   * Cambia los links de la tienda por links cortos de la plataforma: el de
   * WooCommerce con UTM es larguísimo y en el chat se ve como ruido. Además
   * así se cuentan los clics. Si algo falla, el link original sigue sirviendo.
   */
  private async shortenStoreLinks(
    agent: AiAgent,
    text: string,
    channel?: string,
  ): Promise<string> {
    const urls = storeUrlsIn(text, normalizeStoreUrl(agent.storeUrl!));
    if (!urls.length) return text;
    const linkChannel: LinkChannel =
      channel === 'whatsapp' || channel === 'email' || channel === 'sms'
        ? channel
        : 'other';
    const short = await Promise.all(
      urls.map((destination) =>
        this.links
          .createPersonalLinks(
            String(agent.tenantId),
            {
              destination,
              channel: linkChannel,
              title: `Agente IA · ${agent.name}`,
            },
            [{}],
          )
          .then(([l]) => (/^https:\/\//.test(l.shortUrl) ? l.shortUrl : null))
          .catch((err: unknown) => {
            this.logger.warn(
              `No se pudo acortar ${destination}: ${String(err)}`,
            );
            return null;
          }),
      ),
    );
    // Primero las URLs más largas: una puede ser prefijo de otra.
    const pairs = urls
      .map((u, i) => [u, short[i]] as const)
      .filter((p): p is readonly [string, string] => !!p[1])
      .sort((a, b) => b[0].length - a[0].length);
    let out = text;
    for (const [long, s] of pairs) out = out.split(long).join(s);
    return out;
  }

  async generateAnswer(
    agent: AiAgent,
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    options: AgentAnswerOptions = {},
  ): Promise<{
    reply: string;
    sources: number;
    filesToSend: AgentFileSend[];
    handoff: AgentHandoff | null;
    bookings: BookedCita[];
  }> {
    const [ragChunks, agentFiles] = await Promise.all([
      agent.ragEnabled
        ? this.rag.retrieve(
            String(agent.tenantId),
            String(agent._id),
            userMessage,
            agent.topK ?? 5,
          )
        : Promise.resolve([]),
      this.fileModel.find({ agentId: agent._id }).exec(),
    ]);

    const sources = ragChunks.length;
    // Gemini no ejecuta herramientas en esta plataforma: sin ellas no se agenda.
    const cal = agentCalendar(agent.calendar);
    const calendarOn = cal.enabled && agent.provider !== 'gemini';
    const context =
      ragChunks.length > 0
        ? ragChunks
            .map((c, i) => `[Fragmento ${i + 1}]\n${c.text}`)
            .join('\n\n')
        : '';

    const system = [
      agent.systemPrompt,
      context
        ? `\n\nUsa EXCLUSIVAMENTE la siguiente información de la base de conocimiento para responder. Si la respuesta no está aquí, dilo claramente y no inventes.\n\n--- BASE DE CONOCIMIENTO ---\n${context}\n--- FIN ---`
        : agent.ragEnabled
          ? '\n\nNo hay información relevante en la base de conocimiento para esta consulta. Si no sabes la respuesta, indícalo amablemente.'
          : '',
      this.buildFilesPromptSection(agentFiles),
      this.buildHandoffPromptSection(agent),
      this.buildStorePromptSection(agent),
      calendarOn ? this.buildCalendarPromptSection(cal, new Date()) : '',
      options.channelHint ? `\n\n${options.channelHint}` : '',
    ].join('');

    const storeTools = agent.storeUrl
      ? new StoreToolSession(this.store, {
          storeUrl: agent.storeUrl,
          cartMode: agent.storeCartMode ?? 'native',
          channel: options.channel ?? 'chat',
          handoffEnabled: agent.handoffEnabled,
        })
      : null;
    const calendarTools = calendarOn
      ? new CalendarToolSession(
          this.calendar,
          this.bookingStore(String(agent.tenantId), String(agent._id)),
          cal,
          {
            tenantId: String(agent.tenantId),
            agentId: String(agent._id),
            agentName: agent.name,
            conversationId: options.conversationId,
            contactName: options.contactName,
            contactEmail: options.contactEmail,
            channel: options.channel ?? 'chat',
            simulate: options.simulate,
          },
        )
      : null;
    const tools = [
      ...(storeTools?.tools ?? []),
      ...(calendarTools?.tools ?? []),
    ];
    const runTool = (call: AiToolCall): Promise<unknown> => {
      if (calendarTools?.handles(call.name)) return calendarTools.run(call);
      if (storeTools) return storeTools.run(call);
      return Promise.resolve({
        error: `Herramienta desconocida: ${call.name}`,
      });
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const apiKeys = await this.getTenantApiKeys(agent.tenantId);
    const raw = await this.ai.chatMessages(messages, {
      provider: agent.provider as
        | 'auto'
        | 'openai'
        | 'claude'
        | 'deepseek'
        | 'gemini',
      model: agent.aiModel,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      apiKeys,
      ...(tools.length ? { tools, runTool } : {}),
    });

    const rawReply = raw.trim() || agent.fallbackMessage;
    const { text: withoutHandoff, handoff: tokenHandoff } =
      this.parseHandoffToken(rawReply, agent);
    const handoff = tokenHandoff ?? storeTools?.handoff ?? null;
    const { text, filesToSend } = this.parseFileTokens(
      withoutHandoff,
      agentFiles,
    );
    // Al derivar, el texto puede quedar vacío: ahí habla el mensaje de derivación.
    let reply = text || (handoff ? '' : agent.fallbackMessage);
    if (options.channel !== 'email') reply = formatForChat(reply);
    if (agent.storeUrl)
      reply = await this.shortenStoreLinks(agent, reply, options.channel);

    // Fotos de producto: con una sola, la respuesta viaja como su pie de foto
    // (un solo mensaje, como pide el agente). Con varias, cada foto lleva el
    // nombre del producto y la respuesta va después en su propio mensaje.
    const single =
      storeTools?.photos.length === 1 && reply.length <= MAX_CAPTION;
    const photos: AgentFileSend[] = (storeTools?.photos ?? []).map((p) => ({
      url: p.url,
      name: p.name,
      contentType: /\.png(\?|$)/i.test(p.url) ? 'image/png' : 'image/jpeg',
      caption: single ? reply : '',
    }));
    if (single) reply = '';

    return {
      reply,
      sources,
      filesToSend: [...photos, ...filesToSend],
      handoff,
      bookings: calendarTools?.bookings ?? [],
    };
  }

  /**
   * Modelos elegibles para un proveedor. Se pregunta al proveedor con la key
   * del tenant, se descarta lo que no sirve para conversar (embeddings, audio,
   * imagen) y se ordenan primero los recomendados del catálogo. Si la consulta
   * falla —sin key, key inválida, proveedor caído— se devuelve el catálogo.
   */
  async listModels(
    tenantId: string,
    provider: AiProviderId,
  ): Promise<{
    provider: AiProviderId;
    source: 'live' | 'catalog';
    models: AiModelOption[];
  }> {
    if (!AI_MODEL_CATALOG[provider])
      throw new BadRequestException(`Proveedor desconocido: ${provider}`);

    try {
      const apiKeys = await this.getTenantApiKeys(tenantId);
      const live = (await this.ai.listModels(provider, apiKeys)).filter(
        isChatModel,
      );
      if (live.length)
        return {
          provider,
          source: 'live',
          models: mergeWithCatalog(provider, live),
        };
    } catch (err) {
      this.logger.warn(
        `No se pudo listar los modelos de ${provider}: ${String(err)}`,
      );
    }
    return { provider, source: 'catalog', models: AI_MODEL_CATALOG[provider] };
  }

  /** Test desde el playground (sin persistir conversación). Muestra archivos como notas. */
  async testChat(
    agentId: string,
    tenantId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ) {
    const agent = await this.findOne(agentId, tenantId);
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (!last) throw new BadRequestException('No hay mensaje del usuario');
    const history = messages.slice(0, messages.lastIndexOf(last));
    const answer = await this.generateAnswer(agent, last.content, history, {
      channel: 'prueba',
      simulate: true,
    });
    const { sources, filesToSend, handoff, bookings } = answer;
    const tz = agentCalendar(agent.calendar).timeZone;
    // El pie de la foto es parte de lo que lee el cliente: se muestra con el texto.
    const reply = [
      ...filesToSend.map((f) => f.caption).filter(Boolean),
      answer.reply,
    ]
      .filter(Boolean)
      .join('\n\n');
    // Lo que se simula (archivos que se enviarían, derivación) va APARTE del
    // texto: pegarlo al mensaje hacía creer que el agente se lo dice al cliente,
    // y en el playground es justo lo que se está evaluando. La interfaz lo pinta
    // como anotación propia.
    return {
      reply: reply || (handoff ? agent.handoffMessage : reply),
      sources,
      handoff: handoff ? { reason: handoff.reason ?? null } : null,
      files: [
        ...filesToSend.map((f) =>
          f.caption !== undefined ? `Foto: ${f.name}` : f.name,
        ),
        // Cita simulada: en el playground no se crea el evento.
        ...bookings.map(
          (b) =>
            `Cita (simulada, no se creó): ${formatLocal(b.start, tz)} – ${b.contactName}`,
        ),
      ],
    };
  }

  async findPublishedByAccount(accountId: string): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({ published: true, accountIds: new Types.ObjectId(accountId) })
      .exec();
  }

  async findPublishedByInstagramAccount(
    accountId: string,
  ): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({
        published: true,
        instagramAccountIds: new Types.ObjectId(accountId),
      })
      .exec();
  }

  async findPublishedByMessengerAccount(
    accountId: string,
  ): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({
        published: true,
        messengerAccountIds: new Types.ObjectId(accountId),
      })
      .exec();
  }

  async findPublishedByEmailAccount(
    accountId: string,
  ): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({
        published: true,
        emailAccountIds: new Types.ObjectId(accountId),
      })
      .exec();
  }

  static resolveMediaType(contentType?: string): WaMediaType {
    if (!contentType) return 'document';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    return 'document';
  }
}
