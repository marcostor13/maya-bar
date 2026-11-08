import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import { PushSubscription } from './push-subscription.schema';
import { SavePushSubscriptionDto } from './dto/push.dto';
import {
  PushAudienceService,
  type PushCategory,
} from './push-audience.service';
import { describeUserAgent } from './device-label';

/** Contenido de la notificación tal como lo lee `public/sw.js`. */
export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocarla (relativa al frontend). */
  url?: string;
  /** Agrupa/reemplaza notificaciones del mismo hilo. */
  tag?: string;
  conversationId?: string;
  /** Tipo de aviso, para respetar las preferencias del usuario. Sin él: prueba. */
  category?: PushCategory;
  /** Número para el ícono de la app (Badging API). */
  badge?: number;
}

/** A quién va dirigida una notificación dentro del tenant. */
export interface PushAudience {
  /** Solo usuarios cuyo rol tenga acceso a este módulo. */
  moduleKey?: string;
  /** No avisar a quien provocó el evento (p. ej. quien escribió el mensaje). */
  excludeUserId?: string;
}

/**
 * Notificaciones push nativas (Web Push / VAPID) hacia los móviles del equipo.
 *
 * Funciona con la plataforma instalada como acceso directo: Android/Chrome y,
 * desde iOS 16.4, Safari entregan el push al service worker aunque la app esté
 * cerrada. Sin `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` el servicio queda
 * desactivado y no rompe nada: los endpoints responden que no está configurado.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private publicKey = '';
  private configured = false;

  constructor(
    @InjectModel(PushSubscription.name)
    private subs: Model<PushSubscription>,
    private config: ConfigService,
    private audience: PushAudienceService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject =
      this.config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:soporte@mayacrm.site';
    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas — las notificaciones push quedan desactivadas.',
      );
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.configured = true;
    this.logger.log('Notificaciones push activas (VAPID configurado).');
  }

  /** La clave pública que el navegador necesita para suscribirse. */
  vapidPublicKey(): { publicKey: string; enabled: boolean } {
    return { publicKey: this.publicKey, enabled: this.configured };
  }

  isEnabled(): boolean {
    return this.configured;
  }

  /**
   * Alta (o renovación) del dispositivo. El endpoint es único: si el mismo
   * navegador vuelve a suscribirse se actualiza el registro en vez de duplicar.
   */
  async save(
    dto: SavePushSubscriptionDto,
    user: { userId: string; tenantId?: string; role?: string },
  ): Promise<PushSubscription> {
    return this.subs.findOneAndUpdate(
      { endpoint: dto.endpoint },
      {
        $set: {
          endpoint: dto.endpoint,
          p256dh: dto.p256dh,
          auth: dto.auth,
          userId: new Types.ObjectId(user.userId),
          ...(user.tenantId
            ? { tenantId: new Types.ObjectId(user.tenantId) }
            : {}),
          role: user.role,
          userAgent: dto.userAgent,
          installed: dto.installed === true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  }

  /** Baja del dispositivo (el usuario apaga las notificaciones o cierra sesión). */
  async remove(endpoint: string, userId: string): Promise<{ removed: number }> {
    const res = await this.subs.deleteOne({
      endpoint,
      userId: new Types.ObjectId(userId),
    });
    return { removed: res.deletedCount ?? 0 };
  }

  /** Dispositivos registrados por el usuario, para saber si ya está suscrito. */
  async countForUser(userId: string): Promise<number> {
    return this.subs.countDocuments({ userId: new Types.ObjectId(userId) });
  }

  /** Dispositivos del usuario para la lista de Configuración (sin claves). */
  async listForUser(userId: string) {
    const rows = await this.subs
      .find({ userId: new Types.ObjectId(userId) })
      .select('userAgent installed createdAt lastSeenAt')
      .sort({ lastSeenAt: -1 })
      .lean<
        {
          _id: Types.ObjectId;
          userAgent?: string;
          installed?: boolean;
          createdAt?: Date;
          lastSeenAt?: Date;
        }[]
      >();
    return rows.map((r) => ({
      id: String(r._id),
      kind: 'web' as const,
      label: describeUserAgent(r.userAgent),
      installed: r.installed === true,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
    }));
  }

  /** Baja de un dispositivo por id, solo si es del usuario. */
  async removeById(id: string, userId: string): Promise<{ removed: number }> {
    if (!Types.ObjectId.isValid(id)) return { removed: 0 };
    const res = await this.subs.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
    return { removed: res.deletedCount ?? 0 };
  }

  /**
   * Envía a todos los dispositivos de un usuario concreto, si sus preferencias
   * aceptan este tipo de aviso. Nunca lanza.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;
    const ids = await this.audience.forUsers([userId], payload.category);
    return this.sendToUsers(ids, payload);
  }

  /**
   * Envía a todo el equipo del tenant que pueda ver el módulo indicado.
   * Nunca lanza: un fallo de push jamás puede tumbar el flujo de mensajes.
   */
  async sendToTenant(
    tenantId: string,
    payload: PushPayload,
    audience: PushAudience = {},
  ): Promise<number> {
    if (!this.configured || !tenantId) return 0;
    try {
      let ids: string[];
      if (audience.moduleKey) {
        ids = await this.audience.forModule(tenantId, audience.moduleKey, {
          category: payload.category,
          excludeUserId: audience.excludeUserId,
        });
      } else {
        const owners = await this.subs.distinct('userId', {
          tenantId: new Types.ObjectId(tenantId),
        });
        ids = (await this.audience.forUsers(owners, payload.category)).filter(
          (id) => id !== audience.excludeUserId,
        );
      }
      return await this.sendToUsers(ids, payload);
    } catch (err) {
      this.logger.error(`Error enviando push al tenant: ${String(err)}`);
      return 0;
    }
  }

  /** Entrega a los dispositivos de estos usuarios (ya filtrados por la audiencia). */
  private async sendToUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<number> {
    if (!userIds.length) return 0;
    try {
      const targets = await this.subs.find({
        userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
      });
      return await this.deliver(targets, payload);
    } catch (err) {
      this.logger.error(`Error enviando push: ${String(err)}`);
      return 0;
    }
  }

  /** Entrega en paralelo y limpia las suscripciones que el navegador ya descartó. */
  private async deliver(
    targets: PushSubscription[],
    payload: PushPayload,
  ): Promise<number> {
    if (targets.length === 0) return 0;
    // La categoría solo sirve para elegir destinatarios: no viaja al navegador.
    const visible: Partial<PushPayload> = { ...payload };
    delete visible.category;
    const body = JSON.stringify({ ...visible, timestamp: Date.now() });
    const stale: string[] = [];
    let sent = 0;

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: 3600, urgency: 'high' },
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: el navegador desinstaló la PWA o revocó el permiso.
          if (status === 404 || status === 410) stale.push(sub.endpoint);
          else
            this.logger.warn(
              `Push fallido (${status ?? 'sin código'}) para la suscripción ${String(sub._id)}`,
            );
        }
      }),
    );

    if (stale.length) {
      await this.subs.deleteMany({ endpoint: { $in: stale } });
      this.logger.log(
        `${stale.length} suscripción(es) caducada(s) eliminadas.`,
      );
    }
    return sent;
  }
}
