import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import { ConversationsGateway } from './conversations.gateway';
import { ScheduledMessage } from './scheduled-message.schema';
import { Customer } from '../customers/customer.schema';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { LeadsService } from '../leads/leads.service';
import type {
  ConversationTaskDto,
  ScheduleMessageDto,
} from './dto/conversation.dto';

/** Un mensaje programado no puede quedar más lejos que esto. */
const MAX_SCHEDULE_MS = 180 * 24 * 60 * 60 * 1000;
/** Tope de mensajes que el cron entrega por pasada. */
const BATCH = 50;
/**
 * Un envío atascado en `sending` (el proceso murió a mitad) se da por fallido
 * pasado este margen, para que no quede colgado para siempre.
 */
const STUCK_MS = 10 * 60_000;

export interface ConversationTask {
  _id: string;
  leadId: string;
  leadTitle: string;
  title: string;
  body?: string;
  dueAt?: Date;
  done: boolean;
}

/**
 * Herramientas de productividad de la bandeja: mensajes programados, tareas de
 * seguimiento creadas desde el chat y los datos que necesitan los filtros.
 *
 * Vive aparte de ConversationsService para no engordarlo más: todo lo de aquí
 * se apoya en sus operaciones públicas (enviar, crear la oportunidad).
 */
@Injectable()
export class InboxToolsService {
  private readonly logger = new Logger(InboxToolsService.name);

  constructor(
    @InjectModel(ScheduledMessage.name)
    private scheduledModel: Model<ScheduledMessage>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    private conversations: ConversationsService,
    private gateway: ConversationsGateway,
    private agents: AiAgentsService,
    private leads: LeadsService,
  ) {}

  // ------------------------------------------------------------------
  // Filtros
  // ------------------------------------------------------------------

  /** Agentes del tenant, para el filtro "Agente IA" de la bandeja. */
  async listAgents(tenantId: string) {
    const agents = await this.agents.findAll(tenantId);
    return agents.map((a) => ({
      _id: String(a._id),
      name: a.name,
      published: a.published,
    }));
  }

  /**
   * Qué conversaciones atiende un agente: las que ya respondió (`agentId`) y
   * las de las cuentas por las que responde aunque aún no haya contestado.
   */
  async agentScope(
    tenantId: string,
    agentId: string,
  ): Promise<{ agentId: Types.ObjectId; accountIds: Types.ObjectId[] }> {
    const agent = await this.agents.findOne(agentId, tenantId);
    return {
      agentId: agent._id,
      accountIds: [
        ...(agent.accountIds ?? []),
        ...(agent.instagramAccountIds ?? []),
        ...(agent.messengerAccountIds ?? []),
        ...(agent.emailAccountIds ?? []),
      ],
    };
  }

  /** Contactos del tenant que tienen alguna de estas etiquetas. */
  async customerIdsByTags(
    tenantId: string,
    tags: string[],
  ): Promise<Types.ObjectId[]> {
    if (tags.length === 0) return [];
    const rows = await this.customerModel
      .find(
        { tenantId: new Types.ObjectId(tenantId), tags: { $in: tags } },
        { _id: 1 },
      )
      .lean()
      .exec();
    return rows.map((r) => r._id);
  }

  // ------------------------------------------------------------------
  // Mensajes programados
  // ------------------------------------------------------------------

  async listScheduled(conversationId: string, tenantId: string) {
    await this.conversations.getConversation(conversationId, tenantId);
    return this.scheduledModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        tenantId: new Types.ObjectId(tenantId),
        status: { $in: ['pending', 'sending', 'failed'] },
      })
      .sort({ sendAt: 1 })
      .limit(50)
      .exec();
  }

  async schedule(
    conversationId: string,
    tenantId: string,
    userId: string,
    dto: ScheduleMessageDto,
  ) {
    const conv = await this.conversations.getConversation(
      conversationId,
      tenantId,
    );
    const sendAt = new Date(dto.sendAt);
    const now = Date.now();
    // Un minuto de margen: el cron pasa cada minuto.
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < now + 60_000)
      throw new BadRequestException(
        'La hora de envío debe ser al menos un minuto en el futuro',
      );
    if (sendAt.getTime() > now + MAX_SCHEDULE_MS)
      throw new BadRequestException(
        'No se puede programar a más de 6 meses vista',
      );
    const type = dto.type ?? (dto.mediaUrl ? 'document' : 'text');
    if (type === 'text' && !dto.text?.trim())
      throw new BadRequestException('El mensaje está vacío');
    if (type !== 'text' && !dto.mediaUrl)
      throw new BadRequestException('Falta la URL del archivo');

    return this.scheduledModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      sendAt,
      status: 'pending',
      type,
      text: dto.text?.trim() ?? '',
      subject:
        conv.channel === 'email' ? dto.subject?.trim() || undefined : undefined,
      mediaUrl: dto.mediaUrl,
      mediaKey: dto.mediaKey,
      mimeType: dto.mimeType,
      filename: dto.filename,
      size: dto.size,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async cancelScheduled(
    conversationId: string,
    scheduledId: string,
    tenantId: string,
  ) {
    if (!Types.ObjectId.isValid(scheduledId))
      throw new NotFoundException('Mensaje programado no encontrado');
    // Solo se cancela lo que aún no ha empezado a salir.
    const doc = await this.scheduledModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(scheduledId),
          conversationId: new Types.ObjectId(conversationId),
          tenantId: new Types.ObjectId(tenantId),
          status: { $in: ['pending', 'failed'] },
        },
        { $set: { status: 'cancelled' } },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('El mensaje ya se envió o no existe');
    return { ok: true };
  }

  /**
   * Cada minuto entrega lo que ya venció. Cada documento se reclama con un
   * `findOneAndUpdate` atómico (pending → sending), así que dos instancias del
   * backend nunca mandan el mismo mensaje dos veces.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async deliverDue(): Promise<void> {
    await this.scheduledModel
      .updateMany(
        {
          status: 'sending',
          updatedAt: { $lt: new Date(Date.now() - STUCK_MS) },
        },
        { $set: { status: 'failed', error: 'El envío se interrumpió' } },
      )
      .exec();

    for (let i = 0; i < BATCH; i++) {
      const job = await this.scheduledModel
        .findOneAndUpdate(
          { status: 'pending', sendAt: { $lte: new Date() } },
          { $set: { status: 'sending' } },
          { sort: { sendAt: 1 }, new: true },
        )
        .exec();
      if (!job) return;
      await this.deliverOne(job);
    }
  }

  private async deliverOne(job: ScheduledMessage) {
    try {
      const msg = await this.conversations.sendManual(
        String(job.conversationId),
        String(job.tenantId),
        String(job.createdBy),
        {
          text: job.text,
          type: job.type,
          subject: job.subject,
          mediaUrl: job.mediaUrl,
          mediaKey: job.mediaKey,
          mimeType: job.mimeType,
          filename: job.filename,
          size: job.size,
          // Un mensaje programado no le quita el chat al agente IA.
          pauseAgent: false,
        },
      );
      job.messageId = msg._id;
      job.status = msg.status === 'failed' ? 'failed' : 'sent';
      if (msg.status === 'failed') job.error = msg.error;
    } catch (err) {
      job.status = 'failed';
      job.error = String(err);
      this.logger.error(
        `No se pudo enviar el mensaje programado ${String(job._id)}: ${String(err)}`,
      );
    }
    await job.save();
    this.gateway.emitScheduledChanged(
      String(job.tenantId),
      String(job.conversationId),
    );
  }

  // ------------------------------------------------------------------
  // Tareas de seguimiento desde el chat
  // ------------------------------------------------------------------

  /**
   * Tareas pendientes de las oportunidades abiertas del contacto del chat.
   * Las que el usuario no puede ver (de otro responsable) se omiten.
   */
  async listTasks(
    conversationId: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ConversationTask[]> {
    const conv = await this.conversations.getConversation(
      conversationId,
      tenantId,
    );
    if (!conv.customerId) return [];
    const leads = (
      await this.leads.findByCustomer(String(conv.customerId), tenantId)
    ).filter((l) => l.status === 'open');

    const out: ConversationTask[] = [];
    for (const lead of leads) {
      let acts: Awaited<ReturnType<LeadsService['listActivities']>>;
      try {
        acts = await this.leads.listActivities(
          String(lead._id),
          tenantId,
          userId,
          role,
        );
      } catch {
        continue;
      }
      for (const a of acts) {
        if (a.type !== 'task' || a.done) continue;
        out.push({
          _id: String(a._id),
          leadId: String(lead._id),
          leadTitle: lead.title,
          title: a.title,
          body: a.body,
          dueAt: a.dueAt,
          done: a.done,
        });
      }
    }
    return out.sort(
      (a, b) =>
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
    );
  }

  /**
   * Crea la tarea en la oportunidad abierta del contacto. Si el chat aún no
   * tiene contacto ni oportunidad, se crean (igual que "Enviar al embudo"):
   * así la tarea aparece en la agenda de Seguimiento y dispara su recordatorio.
   */
  async createTask(
    conversationId: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: ConversationTaskDto,
  ) {
    const { lead, created } = await this.conversations.sendToPipeline(
      conversationId,
      tenantId,
      userId,
      role,
      {},
    );
    const activity = await this.leads.addActivity(
      String(lead._id),
      tenantId,
      userId,
      role,
      {
        // El recordatorio y la agenda solo miran `task`; el tipo del acceso
        // directo ya va en el título ("Volver a llamar…").
        type: 'task',
        title: dto.title,
        body: dto.body,
        dueAt: dto.dueAt,
        remindByWhatsApp: dto.remindByWhatsApp,
      },
    );
    return { task: activity, leadId: String(lead._id), leadCreated: created };
  }

  async completeTask(
    conversationId: string,
    leadId: string,
    taskId: string,
    tenantId: string,
    userId: string,
    role: string,
    done: boolean,
  ) {
    await this.conversations.getConversation(conversationId, tenantId);
    if (!Types.ObjectId.isValid(leadId) || !Types.ObjectId.isValid(taskId))
      throw new NotFoundException('Tarea no encontrada');
    return this.leads.updateActivity(leadId, taskId, tenantId, userId, role, {
      done,
    });
  }
}
