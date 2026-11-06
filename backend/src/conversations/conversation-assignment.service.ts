import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { ConversationsGateway } from './conversations.gateway';
import { User } from '../users/user.schema';
import { RolesService } from '../roles/roles.service';

/** Quién hace la acción. */
export interface Actor {
  userId: string;
  role: string;
}

/** Miembro del equipo al que se le puede asignar un chat. */
export interface TeamMember {
  _id: string;
  name: string;
  role: string;
}

/** Roles que supervisan la bandeja: pueden reasignar y quitar chats ajenos. */
export const SUPERVISOR_ROLES = ['SUPERADMIN', 'TENANT_ADMIN', 'MANAGER'];

export const isSupervisor = (role: string) => SUPERVISOR_ROLES.includes(role);

/**
 * Asignación de conversaciones a vendedores.
 *
 * Todo el equipo ve todos los chats, pero cada chat tiene como mucho un dueño
 * (`takenOverBy`) y solo él escribe. Tomar es atómico: si dos personas pulsan
 * "Tomar" a la vez, una gana y la otra recibe un 409 con el nombre de quien lo
 * tiene.
 */
@Injectable()
export class ConversationAssignmentService {
  constructor(
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(User.name) private userModel: Model<User>,
    private roles: RolesService,
    private gateway: ConversationsGateway,
  ) {}

  /** Usuarios activos de la empresa con acceso a la bandeja. */
  async team(tenantId: string): Promise<TeamMember[]> {
    const users = await this.userModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        isActive: { $ne: false },
      })
      .select('name email role')
      .lean<
        { _id: Types.ObjectId; name?: string; email: string; role: string }[]
      >()
      .exec();
    const access = new Map<string, boolean>();
    for (const role of new Set(users.map((u) => u.role))) {
      const { modules } = await this.roles.accessFor(tenantId, role);
      access.set(role, modules.includes('inbox'));
    }
    return users
      .filter((u) => access.get(u.role))
      .map((u) => ({
        _id: String(u._id),
        name: u.name?.trim() || u.email,
        role: u.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Nombre visible del usuario (o su correo). */
  async nameOf(userId: string): Promise<string> {
    const u = await this.userModel
      .findById(userId)
      .select('name email')
      .lean<{ name?: string; email?: string }>()
      .exec();
    return u?.name?.trim() || u?.email || 'Un miembro del equipo';
  }

  private async load(id: string, tenantId: string): Promise<Conversation> {
    const conv = await this.convModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return conv;
  }

  private ownedByOther(conv: Conversation, userId: string): boolean {
    return !!conv.takenOverBy && String(conv.takenOverBy) !== userId;
  }

  private busy(conv: Conversation): ConflictException {
    return new ConflictException(
      `${conv.takenOverByName || 'Otro miembro del equipo'} está atendiendo esta conversación.`,
    );
  }

  /**
   * Comprueba que el usuario puede escribir en el chat. Si nadie lo atiende, se
   * lo asigna (escribir es tomarlo). Devuelve la conversación actualizada.
   */
  async ensureWriter(conv: Conversation, actor: Actor): Promise<Conversation> {
    if (String(conv.takenOverBy ?? '') === actor.userId) return conv;
    if (this.ownedByOther(conv, actor.userId)) throw this.busy(conv);
    return this.claim(conv, actor, { note: true });
  }

  /**
   * Asigna el chat a `actor` solo si sigue libre (o ya es suyo). Atómico.
   * `force` (supervisores) se lo quita a quien lo tenga.
   */
  private async claim(
    conv: Conversation,
    actor: Actor,
    opts: { force?: boolean; note?: boolean } = {},
  ): Promise<Conversation> {
    const me = new Types.ObjectId(actor.userId);
    const name = await this.nameOf(actor.userId);
    const previous = conv.takenOverBy ? conv.takenOverByName : undefined;
    const filter: Record<string, unknown> = { _id: conv._id };
    if (!opts.force) filter.$or = [{ takenOverBy: null }, { takenOverBy: me }];

    const updated = await this.convModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            takenOverBy: me,
            takenOverByName: name,
            takenOverAt: new Date(),
            autoReply: false,
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      // Otro lo tomó entre la lectura y la escritura.
      const fresh = await this.convModel.findById(conv._id).exec();
      throw this.busy(fresh ?? conv);
    }
    if (opts.note !== false) {
      const text =
        opts.force && previous && previous !== name
          ? `${name} tomó la conversación (la atendía ${previous}).`
          : `${name} tomó la conversación.`;
      await this.note(updated, text);
    }
    this.gateway.emitConversation(String(updated.tenantId), updated);
    return updated;
  }

  /** "Tomar conversación". */
  async take(
    id: string,
    tenantId: string,
    actor: Actor,
    force = false,
  ): Promise<Conversation> {
    const conv = await this.load(id, tenantId);
    if (String(conv.takenOverBy ?? '') === actor.userId) return conv;
    if (this.ownedByOther(conv, actor.userId)) {
      if (!force) throw this.busy(conv);
      if (!isSupervisor(actor.role))
        throw new ForbiddenException(
          'Solo un administrador o gerente puede quitarle un chat a otro vendedor.',
        );
    }
    return this.claim(conv, actor, { force });
  }

  /** Transfiere el chat a otra persona del equipo (dueño actual o supervisor). */
  async assign(
    id: string,
    tenantId: string,
    actor: Actor,
    userId: string,
  ): Promise<Conversation> {
    const conv = await this.load(id, tenantId);
    if (this.ownedByOther(conv, actor.userId) && !isSupervisor(actor.role))
      throw this.busy(conv);
    const member = (await this.team(tenantId)).find((m) => m._id === userId);
    if (!member)
      throw new ForbiddenException(
        'Esa persona no tiene acceso a la bandeja de entrada.',
      );
    if (String(conv.takenOverBy ?? '') === userId) return conv;

    const by = await this.nameOf(actor.userId);
    const updated = await this.convModel
      .findOneAndUpdate(
        { _id: conv._id },
        {
          $set: {
            takenOverBy: new Types.ObjectId(userId),
            takenOverByName: member.name,
            takenOverAt: new Date(),
            autoReply: false,
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Conversación no encontrada');
    await this.note(
      updated,
      userId === actor.userId
        ? `${by} tomó la conversación.`
        : `${by} asignó la conversación a ${member.name}.`,
    );
    this.gateway.emitConversation(tenantId, updated);
    return updated;
  }

  /** Devuelve el chat a la cola sin asignar (el agente IA sigue apagado). */
  async release(
    id: string,
    tenantId: string,
    actor: Actor,
  ): Promise<Conversation> {
    const conv = await this.load(id, tenantId);
    if (!conv.takenOverBy) return conv;
    if (this.ownedByOther(conv, actor.userId) && !isSupervisor(actor.role))
      throw this.busy(conv);
    const by = await this.nameOf(actor.userId);
    const updated = await this.convModel
      .findOneAndUpdate(
        { _id: conv._id },
        {
          $set: { autoReply: false, takenOverAt: new Date() },
          $unset: { takenOverBy: 1, takenOverByName: 1 },
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Conversación no encontrada');
    await this.note(
      updated,
      `${by} liberó la conversación: queda sin asignar para que la tome otra persona.`,
    );
    this.gateway.emitConversation(tenantId, updated);
    return updated;
  }

  /**
   * Puede cambiar el modo del agente IA: si nadie lo atiende, es suyo o es
   * supervisor. Lanza 409 si no.
   */
  assertCanControl(conv: Conversation, actor: Actor): void {
    if (this.ownedByOther(conv, actor.userId) && !isSupervisor(actor.role))
      throw this.busy(conv);
  }

  /** Nota interna en el hilo (no se envía al cliente). */
  async note(conv: Conversation, text: string): Promise<void> {
    const msg = await this.msgModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'out',
      author: 'system',
      type: 'text',
      text,
      status: 'sent',
      at: new Date(),
    });
    this.gateway.emitMessage(String(conv.tenantId), msg);
  }
}
