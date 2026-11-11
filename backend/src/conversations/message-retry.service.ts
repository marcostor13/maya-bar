import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { ConversationsService } from './conversations.service';
import { ConversationsGateway } from './conversations.gateway';
import {
  FIRST_RETRY_MS,
  isTransientSendError,
  metaErrorCode,
  retryDelayMs,
} from './message-retry.policy';

const HOUR_MS = 60 * 60_000;
/** WhatsApp solo deja escribir texto libre 24 h después del último mensaje del cliente. */
const WINDOW_MS = 24 * HOUR_MS;
/** Margen para no intentar justo cuando se cierra la ventana. */
const WINDOW_MARGIN_MS = 5 * 60_000;
/** Mientras se envía, el mensaje queda reservado este tiempo. */
const LOCK_MS = 10 * 60_000;
/** Tope de mensajes por pasada. */
const BATCH = 50;

type Outcome = 'sent' | 'failed' | 'deferred' | 'stopped';

/**
 * Reintento automático de respuestas de WhatsApp que Meta rechazó por un
 * problema temporal de la cuenta o de Meta (HU7).
 *
 * Por conversación solo se reintenta el último saliente: si se reenviaran
 * todos, el cliente recibiría una ráfaga de saludos repetidos.
 */
@Injectable()
export class MessageRetryService {
  private readonly logger = new Logger(MessageRetryService.name);

  constructor(
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    private conversations: ConversationsService,
    private gateway: ConversationsGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(now: Date = new Date()): Promise<void> {
    if (process.env.WA_AUTO_RETRY === 'false') return;
    const t = now.getTime();
    const candidates = await this.msgModel
      .find({
        status: 'failed',
        direction: 'out',
        author: { $in: ['agent', 'human'] },
        inTrash: { $ne: true },
        retryStopped: { $ne: true },
        at: { $gt: new Date(t - WINDOW_MS) },
        $or: [
          // `null` también encuentra los que nunca tuvieron el campo.
          { retryAt: null, at: { $lte: new Date(t - FIRST_RETRY_MS) } },
          { retryAt: { $lte: now } },
        ],
      })
      .sort({ at: 1 })
      .limit(BATCH)
      .exec();
    if (!candidates.length) return;

    // Cuenta que ya falló en esta pasada → fecha a la que se aplaza el resto.
    const brokenAccounts = new Map<string, Date>();
    const stats: Record<Outcome, number> = {
      sent: 0,
      failed: 0,
      deferred: 0,
      stopped: 0,
    };
    for (const msg of candidates) {
      try {
        stats[await this.retryOne(msg, now, brokenAccounts)]++;
      } catch (err) {
        this.logger.error(
          `Reintento del mensaje ${String(msg._id)} interrumpido: ${String(err)}`,
        );
      }
    }
    this.logger.log(
      `Reintento de envíos: ${stats.sent} enviados, ${stats.failed} fallaron otra vez, ${stats.deferred} aplazados, ${stats.stopped} descartados.`,
    );
  }

  private async retryOne(
    msg: Message,
    now: Date,
    brokenAccounts: Map<string, Date>,
  ): Promise<Outcome> {
    if (!isTransientSendError(msg.error)) return this.stop(msg);

    // La papelera la oculta el propio esquema: en papelera → null.
    const conv = await this.convModel.findById(msg.conversationId).exec();
    if (!conv || conv.channel !== 'whatsapp' || conv.blocked)
      return this.stop(msg);

    // Si después salió otro mensaje al cliente, la conversación ya siguió: este
    // sobra. Y si el posterior también falló, el candidato es ese, no este.
    // Las notas internas (`system`) no llegan al cliente: no cuentan.
    const later = await this.msgModel
      .exists({
        conversationId: msg.conversationId,
        direction: 'out',
        author: { $in: ['agent', 'human'] },
        inTrash: { $ne: true },
        at: { $gt: msg.at },
      })
      .exec();
    if (later) return this.stop(msg);

    const lastIn = await this.msgModel
      .findOne({ conversationId: msg.conversationId, direction: 'in' })
      .sort({ at: -1 })
      .select('at')
      .lean<{ at: Date }>()
      .exec();
    if (
      !lastIn ||
      now.getTime() - new Date(lastIn.at).getTime() >
        WINDOW_MS - WINDOW_MARGIN_MS
    )
      return this.stop(msg);

    const account = String(conv.accountId);
    const deferTo = brokenAccounts.get(account);
    if (deferTo) {
      await this.msgModel
        .updateOne(
          { _id: msg._id, status: 'failed', retryAt: msg.retryAt ?? null },
          { $set: { retryAt: deferTo } },
        )
        .exec();
      return 'deferred';
    }

    // Reclamo atómico: si otra instancia ya lo tomó, `retryAt` cambió.
    const claimed = await this.msgModel
      .findOneAndUpdate(
        { _id: msg._id, status: 'failed', retryAt: msg.retryAt ?? null },
        { $set: { retryAt: new Date(now.getTime() + LOCK_MS) } },
        { new: true },
      )
      .exec();
    if (!claimed) return 'deferred';

    const count = (claimed.retryCount ?? 0) + 1;
    claimed.retryCount = count;
    // Se deja fecha también al acertar: Meta puede aceptar el envío y
    // rechazarlo después por el webhook, y no debe reintentarse al minuto.
    const next = new Date(now.getTime() + retryDelayMs(count));
    try {
      const externalId = await this.conversations.redeliver(conv, claimed);
      claimed.status = 'sent';
      if (externalId) claimed.externalId = externalId;
      claimed.error = undefined;
      claimed.retryAt = next;
      await claimed.save();
      this.gateway.emitMessageUpdated(String(claimed.tenantId), claimed);
      this.logger.log(
        `Mensaje ${String(claimed._id)} reenviado (intento ${count}).`,
      );
      return 'sent';
    } catch (err) {
      const error = String(err);
      claimed.error = error;
      if (isTransientSendError(error)) {
        claimed.retryAt = next;
        brokenAccounts.set(account, next);
      } else {
        claimed.retryStopped = true;
      }
      await claimed.save();
      this.gateway.emitMessageUpdated(String(claimed.tenantId), claimed);
      this.logger.warn(
        `Reintento ${count} del mensaje ${String(claimed._id)} falló (código ${metaErrorCode(error) ?? 'sin código'}).`,
      );
      return 'failed';
    }
  }

  private async stop(msg: Message): Promise<Outcome> {
    await this.msgModel
      // Solo si nadie lo reclamó entretanto (mismo `retryAt` que se leyó).
      .updateOne(
        { _id: msg._id, status: 'failed', retryAt: msg.retryAt ?? null },
        { $set: { retryStopped: true } },
      )
      .exec();
    return 'stopped';
  }
}
