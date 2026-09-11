import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import { PushSubscription } from './push-subscription.schema';
import { SavePushSubscriptionDto } from './dto/push.dto';
import { RolesService } from '../roles/roles.service';

/** Contenido de la notificación tal como lo lee `public/sw.js`. */
export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocarla (relativa al frontend). */
  url?: string;
  /** Agrupa/reemplaza notificaciones del mismo hilo. */
  tag?: string;
  conversationId?: string;
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
    private roles: RolesService,
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

  /** Envía a todos los dispositivos de un usuario concreto (prueba manual). */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;
    const targets = await this.subs.find({
      userId: new Types.ObjectId(userId),
    });
    return this.deliver(targets, payload);
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
      const targets = await this.subs.find({
        tenantId: new Types.ObjectId(tenantId),
        ...(audience.excludeUserId
          ? { userId: { $ne: new Types.ObjectId(audience.excludeUserId) } }
          : {}),
      });
      const allowed = audience.moduleKey
        ? await this.filterByModule(tenantId, targets, audience.moduleKey)
        : targets;
      return await this.deliver(allowed, payload);
    } catch (err) {
      this.logger.error(`Error enviando push al tenant: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Descarta los dispositivos cuyo rol ya no tiene el módulo: los permisos se
   * pueden revocar después de suscribirse y la notificación no debe filtrarse.
   */
  private async filterByModule(
    tenantId: string,
    targets: PushSubscription[],
    moduleKey: string,
  ): Promise<PushSubscription[]> {
    const roles = [...new Set(targets.map((t) => t.role).filter(Boolean))];
    const allowed = new Map<string, boolean>();
    for (const role of roles as string[]) {
      if (role === 'SUPERADMIN') {
        allowed.set(role, true);
        continue;
      }
      const access = await this.roles.accessFor(tenantId, role);
      allowed.set(role, access.modules.includes(moduleKey));
    }
    return targets.filter((t) => t.role && allowed.get(t.role));
  }

  /** Entrega en paralelo y limpia las suscripciones que el navegador ya descartó. */
  private async deliver(
    targets: PushSubscription[],
    payload: PushPayload,
  ): Promise<number> {
    if (targets.length === 0) return 0;
    const body = JSON.stringify({ ...payload, timestamp: Date.now() });
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
              `Push fallido (${status ?? 'sin código'}): ${String(err)}`,
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
