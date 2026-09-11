import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeviceToken } from './device-token.schema';
import { User } from '../users/user.schema';
import { RolesService } from '../roles/roles.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Datos de navegación. `route` es la ruta del frontend a abrir al tocar. */
  data?: Record<string, string>;
}

/** Errores de FCM que significan "este token ya no sirve, bórralo". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Envío de notificaciones push a los dispositivos de un usuario.
 *
 * Si no hay credenciales de Firebase configuradas el servicio queda inactivo y
 * cada envío es un no-op registrado en el log: la aplicación debe seguir
 * funcionando en entornos donde el push no esté dado de alta.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(
    private config: ConfigService,
    private roles: RolesService,
    @InjectModel(DeviceToken.name)
    private deviceTokens: Model<DeviceToken>,
    @InjectModel(User.name)
    private users: Model<User>,
  ) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const rawKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !rawKey) {
      this.logger.warn(
        'Firebase no configurado (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY): las push quedan desactivadas',
      );
      return;
    }

    // En .env la clave va en una línea con "\n" escapados.
    const privateKey = rawKey.replace(/\\n/g, '\n');

    try {
      this.app =
        getApps().find((a) => a.name === 'push') ??
        initializeApp(
          { credential: cert({ projectId, clientEmail, privateKey }) },
          'push',
        );
      this.logger.log(`Push activado para el proyecto ${projectId}`);
    } catch (err) {
      this.logger.error(`No se pudo inicializar Firebase: ${(err as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.app !== null;
  }

  /** Alta o reasignación de un dispositivo. */
  async registerDevice(params: {
    tenantId: string;
    userId: string;
    token: string;
    platform?: 'android' | 'ios' | 'web';
    appVersion?: string;
  }): Promise<void> {
    await this.deviceTokens.updateOne(
      { token: params.token },
      {
        $set: {
          tenantId: new Types.ObjectId(params.tenantId),
          userId: new Types.ObjectId(params.userId),
          platform: params.platform ?? 'android',
          appVersion: params.appVersion,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /** Baja de un dispositivo (logout). */
  async unregisterDevice(token: string): Promise<void> {
    await this.deviceTokens.deleteOne({ token });
  }

  /**
   * Envía a todos los dispositivos de un usuario. Nunca lanza: una push que
   * falla no debe tumbar la operación de negocio que la disparó.
   */
  async sendToUser(userId: string | Types.ObjectId, payload: PushPayload): Promise<number> {
    if (!this.app) return 0;

    const devices = await this.deviceTokens
      .find({ userId: new Types.ObjectId(userId.toString()) })
      .select('token')
      .lean();
    if (!devices.length) return 0;

    return this.send(
      devices.map((d) => d.token),
      payload,
    );
  }

  /** Envía a varios usuarios de una vez (por ejemplo, todo un equipo). */
  async sendToUsers(
    userIds: (string | Types.ObjectId)[],
    payload: PushPayload,
  ): Promise<number> {
    if (!this.app || !userIds.length) return 0;

    const devices = await this.deviceTokens
      .find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id.toString())) } })
      .select('token')
      .lean();
    if (!devices.length) return 0;

    return this.send(
      devices.map((d) => d.token),
      payload,
    );
  }

  /**
   * Avisa a quienes de la empresa tienen acceso a un módulo. Es la vía normal
   * para los avisos de negocio: notificar a todo el tenant llenaría el móvil
   * del impulsador de mensajes de una bandeja que ni siquiera puede abrir.
   */
  async sendToTenantModule(
    tenantId: string | Types.ObjectId,
    moduleKey: string,
    payload: PushPayload,
    opts?: { excludeUserId?: string },
  ): Promise<number> {
    if (!this.app) return 0;
    const tenant = String(tenantId);

    const devices = await this.deviceTokens
      .find({ tenantId: new Types.ObjectId(tenant) })
      .select('token userId')
      .lean();
    if (!devices.length) return 0;

    const users = await this.users
      .find({
        _id: { $in: devices.map((d) => d.userId) },
        isActive: true,
      })
      .select('role')
      .lean();
    const roleOf = new Map(users.map((u) => [String(u._id), u.role]));

    // La matriz de módulos se resuelve una vez por rol, no una por dispositivo.
    const roleAllows = new Map<string, boolean>();
    const tokens: string[] = [];

    for (const device of devices) {
      const userId = String(device.userId);
      if (opts?.excludeUserId && userId === opts.excludeUserId) continue;

      const role = roleOf.get(userId);
      if (!role) continue; // usuario desactivado o borrado

      if (!roleAllows.has(role)) {
        const modules = await this.roles.modulesFor(tenant, role);
        roleAllows.set(role, modules.includes(moduleKey));
      }
      if (roleAllows.get(role)) tokens.push(device.token);
    }

    if (!tokens.length) return 0;
    return this.send(tokens, payload);
  }

  private async send(tokens: string[], payload: PushPayload): Promise<number> {
    if (!this.app) return 0;

    try {
      const res = await getMessaging(this.app).sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'maya_default',
            color: '#E11D48',
            icon: 'ic_stat_maya',
          },
        },
      });

      // Un token muerto se queda ahí para siempre si no se limpia, y cada envío
      // posterior vuelve a fallar contra él.
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
          dead.push(tokens[i]);
        }
      });
      if (dead.length) {
        await this.deviceTokens.deleteMany({ token: { $in: dead } });
        this.logger.log(`${dead.length} token(s) caducados eliminados`);
      }

      return res.successCount;
    } catch (err) {
      this.logger.error(`Error enviando push: ${(err as Error).message}`);
      return 0;
    }
  }
}
