import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { phoneDigits } from '../shared/phone';
import { BlockedContact, type BlockSource } from './blocked-contact.schema';
import { Conversation, type ConversationChannel } from './conversation.schema';

export const BLOCK_CHANNELS: ConversationChannel[] = [
  'whatsapp',
  'instagram',
  'messenger',
  'email',
];

/**
 * Identificador con el que se guarda y se busca un bloqueo.
 *
 * - WhatsApp: solo dígitos con prefijo de país (`51999888777`). Un BSUID
 *   (`PE.1502…`, usuarios con username) se guarda tal cual.
 * - Correo: en minúsculas.
 * - Instagram / Messenger: el id del proveedor tal cual.
 */
export function blockKey(
  channel: ConversationChannel,
  contact: string | undefined | null,
): string | undefined {
  const raw = (contact ?? '').trim();
  if (!raw) return undefined;
  if (channel === 'email') return raw.toLowerCase();
  if (channel === 'whatsapp') {
    if (/[a-z.]/i.test(raw)) return raw;
    return phoneDigits(raw);
  }
  return raw;
}

export interface BlockTarget {
  channel: ConversationChannel;
  contact: string;
}

export interface BlockMeta {
  reason?: string;
  source: BlockSource;
  userId?: string;
  userName?: string;
  name?: string;
  customerId?: Types.ObjectId | string;
  conversationId?: Types.ObjectId | string;
}

const oid = (v: Types.ObjectId | string | undefined) =>
  v && Types.ObjectId.isValid(String(v))
    ? new Types.ObjectId(String(v))
    : undefined;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lista de contactos bloqueados por empresa. Es la fuente de verdad del
 * bloqueo; `conversation.blocked` se mantiene como copia para la bandeja.
 */
@Injectable()
export class BlockedContactsService implements OnModuleInit {
  private readonly logger = new Logger(BlockedContactsService.name);

  constructor(
    @InjectModel(BlockedContact.name) private blocks: Model<BlockedContact>,
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const created = await this.migrateLegacy();
      if (created)
        this.logger.log(`${created} bloqueo(s) migrados desde conversaciones`);
    } catch (err) {
      this.logger.warn(`No se pudieron migrar los bloqueos: ${String(err)}`);
    }
  }

  /** ¿Este contacto está bloqueado en la empresa? Consulta por índice único. */
  async isBlocked(
    tenantId: string | Types.ObjectId,
    channel: ConversationChannel,
    contact: string | undefined,
  ): Promise<boolean> {
    const identifier = blockKey(channel, contact);
    if (!identifier || !Types.ObjectId.isValid(String(tenantId))) return false;
    const hit = await this.blocks.exists({
      tenantId: new Types.ObjectId(String(tenantId)),
      channel,
      identifier,
    });
    return !!hit;
  }

  /**
   * Bloquea uno o varios identificadores (idempotente: volver a bloquear
   * actualiza el motivo) y marca sus conversaciones abiertas como bloqueadas.
   */
  async block(
    tenantId: string,
    targets: BlockTarget[],
    meta: BlockMeta,
    channelInfo?: { accountId?: string; onChannel?: boolean },
  ): Promise<BlockedContact[]> {
    const tenant = new Types.ObjectId(tenantId);
    const out: BlockedContact[] = [];
    const seen = new Set<string>();
    for (const t of targets) {
      const identifier = blockKey(t.channel, t.contact);
      if (!identifier) continue;
      const k = `${t.channel}:${identifier}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const doc = await this.blocks
        .findOneAndUpdate(
          { tenantId: tenant, channel: t.channel, identifier },
          {
            $set: {
              reason: meta.reason?.trim() || undefined,
              source: meta.source,
              blockedBy: oid(meta.userId),
              blockedByName: meta.userName,
              ...(meta.name ? { name: meta.name } : {}),
              ...(oid(meta.customerId)
                ? { customerId: oid(meta.customerId) }
                : {}),
              ...(oid(meta.conversationId)
                ? { conversationId: oid(meta.conversationId) }
                : {}),
              // El bloqueo en el proveedor solo aplica al contacto del chat.
              ...(channelInfo && t === targets[0]
                ? {
                    accountId: oid(channelInfo.accountId),
                    onChannel: channelInfo.onChannel === true,
                  }
                : {}),
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
      out.push(doc);
      await this.syncConversations(tenant, t.channel, t.contact, identifier, {
        blocked: true,
        blockedAt: new Date(),
        blockedBy: oid(meta.userId),
        blockedReason: meta.reason?.trim() || undefined,
        blockedOnChannel: doc.onChannel === true,
        autoReply: false,
        unreadCount: 0,
      });
    }
    this.logger.log(
      `Bloqueo: tenant=${tenantId} entradas=${out.length} origen=${meta.source} usuario=${meta.userId ?? '-'}`,
    );
    return out;
  }

  /** Quita el bloqueo de un identificador. Devuelve la entrada borrada. */
  async unblock(
    tenantId: string,
    channel: ConversationChannel,
    contact: string,
  ): Promise<BlockedContact | null> {
    const identifier = blockKey(channel, contact);
    if (!identifier) return null;
    const tenant = new Types.ObjectId(tenantId);
    const doc = await this.blocks
      .findOneAndDelete({ tenantId: tenant, channel, identifier })
      .exec();
    await this.syncConversations(tenant, channel, contact, identifier, null);
    return doc;
  }

  /** Quita un bloqueo por id (pantalla de bloqueados). null si no es de la empresa. */
  async removeById(
    tenantId: string,
    id: string,
  ): Promise<BlockedContact | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const tenant = new Types.ObjectId(tenantId);
    const doc = await this.blocks
      .findOneAndDelete({ _id: new Types.ObjectId(id), tenantId: tenant })
      .exec();
    if (doc)
      await this.syncConversations(
        tenant,
        doc.channel,
        doc.identifier,
        doc.identifier,
        null,
      );
    return doc;
  }

  async list(tenantId: string, q?: string): Promise<BlockedContact[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    const term = q?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term.slice(0, 100)), 'i');
      filter.$or = [{ identifier: rx }, { name: rx }, { reason: rx }];
    }
    return this.blocks.find(filter).sort({ createdAt: -1 }).limit(500).exec();
  }

  /** ¿Está bloqueado? Para recalcular la copia en una conversación restaurada. */
  async findFor(
    tenantId: string | Types.ObjectId,
    channel: ConversationChannel,
    contact: string,
  ): Promise<BlockedContact | null> {
    const identifier = blockKey(channel, contact);
    if (!identifier) return null;
    return this.blocks
      .findOne({
        tenantId: new Types.ObjectId(String(tenantId)),
        channel,
        identifier,
      })
      .exec();
  }

  /**
   * Pasa a la colección los bloqueos guardados solo en la conversación (antes
   * de esta colección). Idempotente: no pisa bloqueos existentes.
   */
  async migrateLegacy(): Promise<number> {
    const legacy = await this.convModel
      // null cubre los chats que aún no tienen el campo (la migración de la
      // papelera puede arrancar después).
      .find({ blocked: true, inTrash: { $in: [true, false, null] } })
      .select(
        'tenantId channel contact contactName customerId blockedAt blockedBy blockedReason blockedOnChannel accountId',
      )
      .lean<
        Array<{
          _id: Types.ObjectId;
          tenantId: Types.ObjectId;
          channel: ConversationChannel;
          contact: string;
          contactName?: string;
          customerId?: Types.ObjectId;
          blockedBy?: Types.ObjectId;
          blockedReason?: string;
          blockedOnChannel?: boolean;
          accountId?: Types.ObjectId;
        }>
      >();
    let created = 0;
    for (const c of legacy) {
      const identifier = blockKey(c.channel, c.contact);
      if (!identifier) continue;
      const res = await this.blocks.updateOne(
        { tenantId: c.tenantId, channel: c.channel, identifier },
        {
          $setOnInsert: {
            source: 'migration',
            name: c.contactName,
            reason: c.blockedReason,
            blockedBy: c.blockedBy,
            customerId: c.customerId,
            conversationId: c._id,
            accountId: c.blockedOnChannel ? c.accountId : undefined,
            onChannel: c.blockedOnChannel === true,
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount) created++;
    }
    return created;
  }

  /** Mantiene la copia `blocked*` de las conversaciones (fuera de la papelera). */
  private async syncConversations(
    tenant: Types.ObjectId,
    channel: ConversationChannel,
    contact: string,
    identifier: string,
    set: Record<string, unknown> | null,
  ): Promise<void> {
    const filter = {
      tenantId: tenant,
      channel,
      contact: { $in: [...new Set([contact, identifier])] },
    };
    if (set) {
      await this.convModel.updateMany(filter, { $set: set }).exec();
      return;
    }
    await this.convModel
      .updateMany(filter, {
        $set: { blocked: false },
        $unset: {
          blockedAt: 1,
          blockedBy: 1,
          blockedReason: 1,
          blockedOnChannel: 1,
        },
      })
      .exec();
  }
}
