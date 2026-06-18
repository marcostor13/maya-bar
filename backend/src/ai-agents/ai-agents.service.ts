import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiAgent } from './ai-agent.schema';
import { KnowledgeDoc } from './knowledge-doc.schema';
import { AgentConversation } from './agent-conversation.schema';
import { CreateAiAgentDto, UpdateAiAgentDto, AddDocDto } from './dto/ai-agent.dto';
import { RagService } from './rag.service';
import { AiService, ChatMessage } from '../ai/ai.service';

const HISTORY_LIMIT = 10;

@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);

  constructor(
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    @InjectModel(KnowledgeDoc.name) private docModel: Model<KnowledgeDoc>,
    @InjectModel(AgentConversation.name) private convModel: Model<AgentConversation>,
    private rag: RagService,
    private ai: AiService,
  ) {}

  // ---- CRUD agentes ----

  /**
   * Filtro de tenant tolerante a ambos tipos (ObjectId | string). Algunos
   * documentos legacy guardan tenantId como string (migración de tenants),
   * así que matcheamos ambas representaciones.
   */
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
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(id: string, tenantId: string, dto: UpdateAiAgentDto) {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.accountIds) patch.accountIds = dto.accountIds.map((a) => new Types.ObjectId(a));
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
    // Procesa en segundo plano (no bloquea la respuesta)
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

  // ---- Generación de respuesta ----

  /** Construye los mensajes (system + contexto RAG + historial) y consulta al LLM. */
  async generateAnswer(
    agent: AiAgent,
    userMessage: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<{ reply: string; sources: number }> {
    let context = '';
    let sources = 0;
    if (agent.ragEnabled) {
      const chunks = await this.rag.retrieve(
        String(agent.tenantId), String(agent._id), userMessage, agent.topK ?? 5,
      );
      sources = chunks.length;
      if (chunks.length > 0) {
        context = chunks.map((c, i) => `[Fragmento ${i + 1}]\n${c.text}`).join('\n\n');
      }
    }

    const system = [
      agent.systemPrompt,
      context
        ? `\n\nUsa EXCLUSIVAMENTE la siguiente información de la base de conocimiento para responder. Si la respuesta no está aquí, dilo claramente y no inventes.\n\n--- BASE DE CONOCIMIENTO ---\n${context}\n--- FIN ---`
        : agent.ragEnabled
          ? '\n\nNo hay información relevante en la base de conocimiento para esta consulta. Si no sabes la respuesta, indícalo amablemente.'
          : '',
    ].join('');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: userMessage },
    ];

    const reply = await this.ai.chatMessages(messages, {
      provider: agent.provider as 'auto' | 'openai' | 'claude' | 'deepseek',
      model: agent.aiModel,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    });
    return { reply: reply.trim() || agent.fallbackMessage, sources };
  }

  /** Test desde el playground (sin persistir conversación). */
  async testChat(agentId: string, tenantId: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
    const agent = await this.findOne(agentId, tenantId);
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (!last) throw new BadRequestException('No hay mensaje del usuario');
    const history = messages.slice(0, messages.lastIndexOf(last));
    return this.generateAnswer(agent, last.content, history);
  }

  /**
   * Respuesta para un contacto entrante (webhooks). Mantiene memoria de conversación.
   * Devuelve el texto a enviar, o null si no hay agente publicado.
   */
  async replyForContact(
    agent: AiAgent,
    accountId: string | undefined,
    contact: string,
    userMessage: string,
  ): Promise<string> {
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
    const { reply } = await this.generateAnswer(agent, userMessage, history);

    conv.messages.push({ role: 'user', content: userMessage, at: new Date() });
    conv.messages.push({ role: 'assistant', content: reply, at: new Date() });
    if (conv.messages.length > 40) conv.messages = conv.messages.slice(-40);
    await conv.save();
    return reply;
  }

  /** Busca un agente publicado vinculado a la cuenta de WhatsApp dada. */
  async findPublishedByAccount(accountId: string): Promise<AiAgent | null> {
    return this.agentModel
      .findOne({ published: true, accountIds: new Types.ObjectId(accountId) })
      .exec();
  }
}
