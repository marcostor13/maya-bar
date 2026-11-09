import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { ScheduledMessage } from './scheduled-message.schema';
import { Lead } from '../leads/lead.schema';
import { ContactActivity } from '../customers/contact-activity.schema';
import { AgentBooking } from '../ai-agents/calendar/agent-booking.schema';
import { UploadService } from '../upload/upload.service';
import { RolesService } from '../roles/roles.service';
import { ConversationsGateway } from './conversations.gateway';
import { BlockedContactsService } from './blocked-contacts.service';

/** Días que una conversación pasa en la papelera antes de borrarse. */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_BATCH = 100;

/** Solo la cabecera del chat: la papelera no necesita los mensajes. */
const TRASH_FIELDS =
  'channel accountId contact contactName contactAvatar lastMessageAt lastMessagePreview emailSubject customerId trashedAt trashedBy trashedByName';

export interface TrashActor {
  userId: string;
  name?: string;
}

const toIds = (ids: string[]) =>
  [...new Set(ids)]
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

/**
 * Papelera de conversaciones. Eliminar mueve el chat aquí (oculto en toda la
 * plataforma por el filtro del esquema); a los 30 días, o al borrarlo a mano,
 * se borra con sus mensajes, programados y adjuntos recibidos.
 */
@Injectable()
export class ConversationTrashService implements OnModuleInit {
  private readonly logger = new Logger(ConversationTrashService.name);

  constructor(
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(ScheduledMessage.name)
    private scheduledModel: Model<ScheduledMessage>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(ContactActivity.name)
    private activityModel: Model<ContactActivity>,
    @InjectModel(AgentBooking.name) private bookingModel: Model<AgentBooking>,
    private uploads: UploadService,
    private roles: RolesService,
    private gateway: ConversationsGateway,
    private blocks: BlockedContactsService,
  ) {}

  /**
   * El índice único de contacto pasa a ser parcial (`inTrash: false`). Antes de
   * crearlo, todas las conversaciones necesitan el campo explícito: el filtro
   * parcial no cubre documentos sin él. Idempotente.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.convModel
        .updateMany(
          { inTrash: { $exists: false } },
          { $set: { inTrash: false } },
        )
        .exec();
      const indexes = await this.convModel.collection.indexes();
      for (const index of indexes) {
        const isContactKey =
          JSON.stringify(index.key) ===
          JSON.stringify({ channel: 1, accountId: 1, contact: 1 });
        if (isContactKey && !index.partialFilterExpression && index.name) {
          await this.convModel.collection.dropIndex(index.name);
          this.logger.log(`Índice ${index.name} reemplazado por uno parcial`);
        }
      }
      await this.convModel.createIndexes();
    } catch (err) {
      this.logger.error(
        `No se pudo preparar el índice de la papelera: ${String(err)}`,
      );
    }
  }

  /**
   * Eliminar exige ser administrador o tener "Eliminar" marcado a propósito en
   * Bandeja. A diferencia del resto de la plataforma, la ausencia de entrada
   * en la matriz no concede borrar chats.
   */
  async canDelete(tenantId: string, role: string): Promise<boolean> {
    if (role === 'SUPERADMIN' || role === 'TENANT_ADMIN') return true;
    if (!role || !Types.ObjectId.isValid(tenantId)) return false;
    const { modules, actions } = await this.roles.accessFor(tenantId, role);
    return (
      modules.includes('inbox') && actions?.inbox?.includes('delete') === true
    );
  }

  async assertCanDelete(tenantId: string, role: string): Promise<void> {
    if (!(await this.canDelete(tenantId, role)))
      throw new ForbiddenException(
        'Tu rol no puede eliminar conversaciones. Pídeselo a un administrador.',
      );
  }

  /** Mueve conversaciones a la papelera. Devuelve las que se movieron. */
  async trash(
    tenantId: string,
    ids: string[],
    actor: TrashActor,
  ): Promise<{ trashed: number; ids: string[] }> {
    const tenant = new Types.ObjectId(tenantId);
    const found = await this.convModel
      .find({ _id: { $in: toIds(ids) }, tenantId: tenant })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (!found.length) return { trashed: 0, ids: [] };
    const oids = found.map((c) => c._id);

    await this.convModel
      .updateMany(
        { _id: { $in: oids }, tenantId: tenant },
        {
          $set: {
            inTrash: true,
            trashedAt: new Date(),
            trashedBy: Types.ObjectId.isValid(actor.userId)
              ? new Types.ObjectId(actor.userId)
              : undefined,
            trashedByName: actor.name,
          },
        },
      )
      .exec();
    // Sus mensajes dejan de contar en los paneles.
    await this.msgModel
      .updateMany(
        { conversationId: { $in: oids } },
        { $set: { inTrash: true } },
      )
      .exec();
    // Lo programado no debe salir hacia un chat eliminado.
    await this.scheduledModel
      .updateMany(
        { conversationId: { $in: oids }, status: 'pending' },
        { $set: { status: 'cancelled' } },
      )
      .exec();

    const out = oids.map(String);
    this.gateway.emitRemoved(tenantId, out);
    this.logger.log(
      `Papelera: tenant=${tenantId} usuario=${actor.userId} conversaciones=${out.join(',')}`,
    );
    return { trashed: out.length, ids: out };
  }

  /** Lo que hay en la papelera, con la fecha en que se borrará. */
  async list(tenantId: string) {
    const rows = await this.convModel
      .find({ tenantId: new Types.ObjectId(tenantId), inTrash: true })
      .select(TRASH_FIELDS)
      .sort({ trashedAt: -1 })
      .limit(500)
      .lean<Array<Record<string, unknown> & { trashedAt?: Date }>>();
    return rows.map((r) => ({
      ...r,
      purgeAt: r.trashedAt
        ? new Date(new Date(r.trashedAt).getTime() + TRASH_DAYS * DAY_MS)
        : undefined,
    }));
  }

  /**
   * Devuelve un chat a la bandeja. Si mientras estaba en la papelera el
   * contacto abrió un chat nuevo por la misma cuenta, el historial se une a
   * ese chat (no puede haber dos chats activos con el mismo contacto).
   */
  async restore(
    tenantId: string,
    id: string,
    actor: TrashActor,
  ): Promise<{ conversation: Conversation; merged: boolean }> {
    const trashed = await this.findTrashed(tenantId, id);
    const active = await this.convModel
      .findOne({
        tenantId: trashed.tenantId,
        channel: trashed.channel,
        accountId: trashed.accountId,
        contact: trashed.contact,
      })
      .exec();

    if (active) {
      const ref = { conversationId: trashed._id };
      const to = { $set: { conversationId: active._id } };
      await this.msgModel
        .updateMany(ref, { ...to, $unset: { inTrash: 1 } })
        .exec();
      await this.scheduledModel.updateMany(ref, to).exec();
      await this.relinkReferences(trashed.tenantId, trashed._id, active._id);
      if (!active.customerId && trashed.customerId) {
        active.customerId = trashed.customerId;
        await active.save();
      }
      await this.convModel.deleteOne({ _id: trashed._id }).exec();
      this.gateway.emitConversation(tenantId, active);
      this.logger.log(
        `Restaurada (unida): tenant=${tenantId} usuario=${actor.userId} conversacion=${id} en=${String(active._id)}`,
      );
      return { conversation: active, merged: true };
    }

    await this.msgModel
      .updateMany({ conversationId: trashed._id }, { $unset: { inTrash: 1 } })
      .exec();
    // El bloqueo pudo cambiar mientras estaba en la papelera.
    const block = await this.blocks.findFor(
      trashed.tenantId,
      trashed.channel,
      trashed.contact,
    );
    await this.convModel
      .updateOne(
        { _id: trashed._id, inTrash: true },
        {
          $set: {
            inTrash: false,
            blocked: !!block,
            ...(block
              ? {
                  blockedReason: block.reason,
                  blockedOnChannel: !!block.onChannel,
                }
              : {}),
          },
          $unset: {
            trashedAt: 1,
            trashedBy: 1,
            trashedByName: 1,
            ...(block ? {} : { blockedReason: 1, blockedOnChannel: 1 }),
          },
        },
      )
      .exec();
    const conversation = await this.convModel
      .findOne({ _id: trashed._id, tenantId: trashed.tenantId })
      .exec();
    if (!conversation)
      throw new NotFoundException('Conversación no encontrada');
    this.gateway.emitConversation(tenantId, conversation);
    this.logger.log(
      `Restaurada: tenant=${tenantId} usuario=${actor.userId} conversacion=${id}`,
    );
    return { conversation, merged: false };
  }

  /** Borra ya una conversación de la papelera. */
  async purge(
    tenantId: string,
    id: string,
    actor: TrashActor,
  ): Promise<{ deleted: true }> {
    const conv = await this.findTrashed(tenantId, id);
    await this.destroy(conv);
    this.logger.log(
      `Borrado definitivo: tenant=${tenantId} usuario=${actor.userId} conversacion=${id}`,
    );
    return { deleted: true };
  }

  /** Vacía la papelera de la empresa. */
  async empty(
    tenantId: string,
    actor: TrashActor,
  ): Promise<{ deleted: number }> {
    const convs = await this.convModel
      .find({ tenantId: new Types.ObjectId(tenantId), inTrash: true })
      .exec();
    for (const c of convs) await this.destroy(c);
    this.logger.log(
      `Papelera vaciada: tenant=${tenantId} usuario=${actor.userId} conversaciones=${convs.length}`,
    );
    return { deleted: convs.length };
  }

  /** Borra lo que lleva más de 30 días en la papelera, por lotes. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
    let convs: Conversation[] = [];
    try {
      convs = await this.convModel
        .find({ inTrash: true, trashedAt: { $lt: cutoff } })
        .limit(PURGE_BATCH)
        .exec();
    } catch (err) {
      this.logger.error(`No se pudo leer la papelera: ${String(err)}`);
      return 0;
    }
    let done = 0;
    for (const c of convs) {
      try {
        await this.destroy(c);
        done++;
      } catch (err) {
        this.logger.error(
          `No se pudo purgar la conversación ${String(c._id)}: ${String(err)}`,
        );
      }
    }
    if (done) this.logger.log(`Purga de papelera: ${done} conversación(es)`);
    return done;
  }

  private async findTrashed(
    tenantId: string,
    id: string,
  ): Promise<Conversation> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Conversación no encontrada');
    const conv = await this.convModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        inTrash: true,
      })
      .exec();
    if (!conv)
      throw new NotFoundException('La conversación no está en la papelera');
    return conv;
  }

  /**
   * Borrado definitivo. Solo se borran de S3 los adjuntos que mandó el
   * cliente: los salientes pueden ser archivos compartidos (plantillas,
   * catálogo). Leads, actividades y citas se conservan sin la referencia.
   */
  private async destroy(conv: Conversation): Promise<void> {
    const conversationId = conv._id;
    const media = await this.msgModel
      .find({
        conversationId,
        direction: 'in',
        mediaKey: { $exists: true, $nin: [null, ''] },
      })
      .select('mediaKey')
      .lean<Array<{ mediaKey?: string }>>();
    for (const m of media) {
      if (!m.mediaKey) continue;
      await this.uploads
        .delete(m.mediaKey)
        .catch((err: unknown) =>
          this.logger.warn(
            `No se pudo borrar un adjunto de ${String(conversationId)}: ${String(err)}`,
          ),
        );
    }
    await this.msgModel.deleteMany({ conversationId }).exec();
    await this.scheduledModel.deleteMany({ conversationId }).exec();
    await this.relinkReferences(conv.tenantId, conversationId, null);
    await this.convModel.deleteOne({ _id: conversationId }).exec();
  }

  /** Mueve (o quita, con `to` null) la referencia en leads, actividades y citas. */
  private async relinkReferences(
    tenantId: Types.ObjectId,
    from: Types.ObjectId,
    to: Types.ObjectId | null,
  ): Promise<void> {
    const filter = { tenantId, conversationId: from };
    const update = to
      ? { $set: { conversationId: to } }
      : { $unset: { conversationId: 1 } };
    await Promise.all([
      this.leadModel.updateMany(filter, update).exec(),
      this.activityModel.updateMany(filter, update).exec(),
      this.bookingModel.updateMany(filter, update).exec(),
    ]);
  }
}
