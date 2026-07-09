import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiAgent } from './ai-agent.schema';
import { KnowledgeDoc } from './knowledge-doc.schema';
import { AgentConversation } from './agent-conversation.schema';
import { AgentFile } from './agent-file.schema';
import { CreateAiAgentDto, UpdateAiAgentDto, AddDocDto, AgentFileDto } from './dto/ai-agent.dto';
import { RagService } from './rag.service';
import { AiService, ChatMessage, AiApiKeys } from '../ai/ai.service';
import { TenantConfig } from '../settings/tenant-config.schema';
import { WaMediaType } from '../whatsapp/whatsapp.service';

const HISTORY_LIMIT = 10;
const SEND_FILE_TOKEN = /\{\{SEND_FILE:([a-zA-Z0-9_-]+)\}\}/g;

export interface AgentFileSend {
  url: string;
  contentType?: string;
  name: string;
}

export interface AgentReply {
  text: string;
  filesToSend: AgentFileSend[];
}

@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);

  constructor(
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    @InjectModel(KnowledgeDoc.name) private docModel: Model<KnowledgeDoc>,
    @InjectModel(AgentConversation.name) private convModel: Model<AgentConversation>,
    @InjectModel(AgentFile.name) private fileModel: Model<AgentFile>,
    @InjectModel(TenantConfig.name) private configModel: Model<TenantConfig>,
    private rag: RagService,
    private ai: AiService,
  ) {}

  /** Lee las API keys de IA configuradas por el tenant. */
  private async getTenantApiKeys(tenantId: string | Types.ObjectId): Promise<AiApiKeys> {
    const cfg = await this.configModel.findOne({ tenantId: new Types.ObjectId(String(tenantId)) }).exec();
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
    if (Types.ObjectId.isValid(tenantId)) values.push(new Types.ObjectId(tenantId));
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
      .findOne({ _id: new Types.ObjectId(id), tenantId: this.tenantMatch(tenantId) })
      .exec();
    if (!doc) throw new NotFoundException('Agente no encontrado');
    return doc;
  }

  create(tenantId: string, userId: string, dto: CreateAiAgentDto) {
    return this.agentModel.create({
      ...dto,
      accountIds: (dto.accountIds ?? []).map((a) => new Types.ObjectId(a)),
      instagramAccountIds: (dto.instagramAccountIds ?? []).map((a) => new Types.ObjectId(a)),
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(id: string, tenantId: string, dto: UpdateAiAgentDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.accountIds) patch.accountIds = dto.accountIds.map((a) => new Types.ObjectId(a));
    if (dto.instagramAccountIds) patch.instagramAccountIds = dto.instagramAccountIds.map((a) => new Types.ObjectId(a));
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
    await this.convModel.deleteMany({ agentId: new Types.ObjectId(id) }).exec();
    await this.fileModel.deleteMany({ agentId: new Types.ObjectId(id) }).exec();
    await this.agentModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
    return { deleted: true };
  }

  // ---- Base de conocimiento (RAG) ----

  listDocs(agentId: string, tenantId: string) {
    return this.docModel
      .find({ agentId: new Types.ObjectId(agentId), tenantId: this.tenantMatch(tenantId) })
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
    void this.processDoc(doc.id as string, tenantId, agentId, dto);
    return doc;
  }

  private async processDoc(docId: string, tenantId: string, agentId: string, dto: AddDocDto) {
    try {
      const res = await fetch(dto.url);
      if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const { chunkCount, charCount } = await this.rag.ingest(
        tenantId, agentId, docId, buffer, dto.contentType,
      );
      await this.docModel.updateOne(
        { _id: new Types.ObjectId(docId) },
        { $set: { status: 'ready', chunkCount, charCount } },
      ).exec();
    } catch (err) {
      this.logger.error(`Error procesando doc ${docId}: ${String(err)}`);
      await this.docModel.updateOne(
        { _id: new Types.ObjectId(docId) },
        { $set: { status: 'error', error: String(err) } },
      ).exec();
    }
  }

  async deleteDoc(agentId: string, docId: string, tenantId: string) {
    const doc = await this.docModel
      .findOne({ _id: new Types.ObjectId(docId), agentId: new Types.ObjectId(agentId), tenantId: this.tenantMatch(tenantId) })
      .exec();
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.rag.deleteByDoc(docId);
    await this.docModel.deleteOne({ _id: doc._id }).exec();
    return { deleted: true };
  }

  // ---- Archivos enviables ----

  listFiles(agentId: string, tenantId: string) {
    return this.fileModel
      .find({ agentId: new Types.ObjectId(agentId), tenantId: this.tenantMatch(tenantId) })
      .sort({ alias: 1 })
      .exec();
  }

  async addFile(agentId: string, tenantId: string, dto: AgentFileDto) {
    await this.findOne(agentId, tenantId);
    if (!dto.alias || !dto.url) throw new BadRequestException('Faltan alias o URL');
    const alias = dto.alias.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!alias) throw new BadRequestException('El alias solo puede contener letras, números, guiones y guiones bajos');
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
      if (e.code === 11000) throw new BadRequestException(`Ya existe un archivo con el alias "${alias}" en este agente`);
      throw err;
    }
  }

  async deleteFile(agentId: string, fileId: string, tenantId: string) {
    const file = await this.fileModel
      .findOne({ _id: new Types.ObjectId(fileId), agentId: new Types.ObjectId(agentId), tenantId: this.tenantMatch(tenantId) })
      .exec();
    if (!file) throw new NotFoundException('Archivo no encontrado');
    await this.fileModel.deleteOne({ _id: file._id }).exec();
    return { deleted: true };
  }

  // ---- Generación de respuesta ----

  /** Construye la sección de archivos para inyectar en el system prompt. */
  private buildFilesPromptSection(files: AgentFile[]): string {
    if (!files.length) return '';
    const list = files.map((f) => `{{SEND_FILE:${f.alias}}} → ${f.name} (${f.filename})`).join('\n');
    return `\n\n--- ARCHIVOS QUE PUEDES ENVIAR ---\nCuando el cliente lo pida o sea muy relevante, incluye el token exacto en tu respuesta para enviar el archivo (puede ir antes o después de tu texto):\n\n${list}\n\nIMPORTANTE: Usa estos tokens solo cuando realmente debas enviar el archivo. El texto de tu respuesta (sin los tokens) se enviará como mensaje de texto normal.\n--- FIN ARCHIVOS ---`;
  }

  /** Extrae tokens {{SEND_FILE:alias}} de la respuesta y devuelve texto limpio + archivos. */
  private parseFileTokens(reply: string, files: AgentFile[]): { text: string; filesToSend: AgentFileSend[] } {
    const aliasMap = new Map(files.map((f) => [f.alias, f]));
    const filesToSend: AgentFileSend[] = [];
    const seen = new Set<string>();

    const text = reply.replace(SEND_FILE_TOKEN, (_, alias: string) => {
      if (!seen.has(alias) && aliasMap.has(alias)) {
        seen.add(alias);
        const f = aliasMap.get(alias)!;
        filesToSend.push({ url: f.url, contentType: f.contentType, name: f.name });
      }
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();

    return { text, filesToSend };
  }

  async generateAnswer(
    agent: AiAgent,
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<{ reply: string; sources: number; filesToSend: AgentFileSend[] }> {
    const [ragChunks, agentFiles] = await Promise.all([
      agent.ragEnabled
        ? this.rag.retrieve(String(agent.tenantId), String(agent._id), userMessage, agent.topK ?? 5)
        : Promise.resolve([]),
      this.fileModel.find({ agentId: agent._id }).exec(),
    ]);

    const sources = ragChunks.length;
    const context = ragChunks.length > 0
      ? ragChunks.map((c, i) => `[Fragmento ${i + 1}]\n${c.text}`).join('\n\n')
      : '';

    const system = [
      agent.systemPrompt,
      context
        ? `\n\nUsa EXCLUSIVAMENTE la siguiente información de la base de conocimiento para responder. Si la respuesta no está aquí, dilo claramente y no inventes.\n\n--- BASE DE CONOCIMIENTO ---\n${context}\n--- FIN ---`
        : agent.ragEnabled
          ? '\n\nNo hay información relevante en la base de conocimiento para esta consulta. Si no sabes la respuesta, indícalo amablemente.'
          : '',
      this.buildFilesPromptSection(agentFiles),
    ].join('');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: userMessage },
    ];

    const apiKeys = await this.getTenantApiKeys(agent.tenantId);
    const raw = await this.ai.chatMessages(messages, {
      provider: agent.provider as 'auto' | 'openai' | 'claude' | 'deepseek' | 'gemini',
      model: agent.aiModel,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      apiKeys,
    });

    const rawReply = raw.trim() || agent.fallbackMessage;
    const { text, filesToSend } = this.parseFileTokens(rawReply, agentFiles);
    return { reply: text || agent.fallbackMessage, sources, filesToSend };
  }

  /** Test desde el playground (sin persistir conversación). Muestra archivos como notas. */
  async testChat(agentId: string, tenantId: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
    const agent = await this.findOne(agentId, tenantId);
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (!last) throw new BadRequestException('No hay mensaje del usuario');
    const history = messages.slice(0, messages.lastIndexOf(last));
    const { reply, sources, filesToSend } = await this.generateAnswer(agent, last.content, history);
    let displayReply = reply;
    if (filesToSend.length > 0) {
      displayReply += '\n\n' + filesToSend.map((f) => `📎 [Se enviaría archivo: ${f.name}]`).join('\n');
    }
    return { reply: displayReply, sources };
  }

  async replyForContact(
    agent: AiAgent,
    accountId: string | undefined,
    contact: string,
    userMessage: string,
  ): Promise<AgentReply> {
    let conv = await this.convModel
      .findOne({ agentId: agent._id, contact })
      .exec();
    if (!conv) {
      conv = await this.convModel.create({
        tenantId: agent.tenantId,
        agentId: agent._id,
        accountId: accountId ? new Types.ObjectId(accountId) : undefined,
        contact,
        messages: [],
      });
    }
    const history = conv.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const { reply, filesToSend } = await this.generateAnswer(agent, userMessage, history);

    conv.messages.push({ role: 'user', content: userMessage, at: new Date() });
    conv.messages.push({ role: 'assistant', content: reply, at: new Date() });
    if (conv.messages.length > 40) conv.messages = conv.messages.slice(-40);
    await conv.save();
    return { text: reply, filesToSend };
  }

  async findPublishedByAccount(accountId: string): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({ published: true, accountIds: new Types.ObjectId(accountId) })
      .exec();
  }

  async findPublishedByInstagramAccount(accountId: string): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({ published: true, instagramAccountIds: new Types.ObjectId(accountId) })
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
