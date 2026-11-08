import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeviceToken } from './device-token.schema';
import {
  PushAudienceService,
  type PushCategory,
} from '../push/push-audience.service';

export interface NativePushPayload {
  title: string;
  body: string;
  /** Datos de navegación. `route` es la ruta del frontend a abrir al tocar. */
  data?: Record<string, string>;
  /** Etiqueta de la notificación en Android (p. ej. `conv_<id>`). */
  tag?: string;
  /** Tipo de aviso, para respetar las preferencias del usuario. Sin él: prueba. */
  category?: PushCategory;
  /** Número para la insignia del ícono de la app. */
  badge?: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  android: 'App de Android',
  ios: 'App de iPhone',
  web: 'Navegador',
};

/**
 * Deja la clave privada en PEM, venga como venga del entorno.
 *
 * En `.env` se guarda en una línea con `\n` escapados, pero al pasar por
 * docker-compose esas barras invertidas pueden llegar duplicadas (`\\n`) o
 * entrecomilladas, y `cert()` responde con un escueto "Failed to parse private
 * key". El valor almacenado era correcto: lo que lo rompía era el transporte.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  // Comillas que algunos gestores de secretos añaden al guardar o al inyectar.
  if (/^(".*"|'.*')$/s.test(key)) key = key.slice(1, -1);
  // Primero las barras duplicadas; si no, el reemplazo siguiente dejaría una
  // barra suelta dentro del PEM y seguiría sin parsear.
  key = key.replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n');
  // Algunos entornos escapan además el guion de las cabeceras BEGIN/END.
  key = key.replace(/\\-/g, '-');
  return key.endsWith('\n') ? key : `${key}\n`;
}

/** Describe la forma de un secreto para los logs, sin revelar su contenido. */
export function describeKeyShape(raw: string): string {
  return [
    `${raw.length} chars`,
    `${(raw.match(/\\n/g) || []).length} "\\n" literales`,
    `${(raw.match(/\n/g) || []).length} saltos reales`,
    `empieza por ${JSON.stringify(raw.slice(0, 5))}`,
    `termina en ${JSON.stringify(raw.slice(-5))}`,
  ].join(', ');
}

/** Errores de FCM que significan "este token ya no sirve, bórralo". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Envío de notificaciones push a los dispositivos de un usuario.
 *
 * Si no hay credenciales de Firebase configuradas el servicio queda inactivo y
 * cada envío es un no-op registrado en el log: la aplicación debe seguir
 * funcionando en entornos donde el push no esté dado de alta.
 */
@Injectable()
export class NativePushService implements OnModuleInit {
  private readonly logger = new Logger(NativePushService.name);
  private app: App | null = null;

  constructor(
    private config: ConfigService,
    private audience: PushAudienceService,
    @InjectModel(DeviceToken.name)
    private deviceTokens: Model<DeviceToken>,
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

    const privateKey = normalizePrivateKey(rawKey);

    try {
      this.app =
        getApps().find((a) => a.name === 'push') ??
        initializeApp(
          { credential: cert({ projectId, clientEmail, privateKey }) },
          'push',
        );
      this.logger.log(`Push activado para el proyecto ${projectId}`);
    } catch (err) {
      // La forma de la clave (nunca su contenido) es lo único que permite
      // distinguir un secreto mal pegado de uno que el despliegue ha destrozado
      // al inyectarlo. Sin esto solo queda "Failed to parse private key".
      this.logger.error(
        `No se pudo inicializar Firebase: ${(err as Error).message}. ` +
          `Forma de la clave recibida: ${describeKeyShape(rawKey)}`,
      );
    }
  }

  get enabled(): boolean {
    return this.app !== null;
  }

  /** Alta o reasignación de un dispositivo. Devuelve su id. */
  async registerDevice(params: {
    tenantId: string;
    userId: string;
    token: string;
    platform?: 'android' | 'ios' | 'web';
    appVersion?: string;
  }): Promise<string> {
    const doc = await this.deviceTokens.findOneAndUpdate(
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
      { upsert: true, new: true },
    );
    return String(doc?._id ?? '');
  }

  /** Baja de un dispositivo (logout). Solo el dueño del token puede darlo de baja. */
  async unregisterDevice(token: string, userId: string): Promise<void> {
    await this.deviceTokens.deleteOne({
      token,
      userId: new Types.ObjectId(userId),
    });
  }

  /** Dispositivos del usuario para la lista de Configuración (sin el token). */
  async listForUser(userId: string) {
    const rows = await this.deviceTokens
      .find({ userId: new Types.ObjectId(userId) })
      .select('platform appVersion createdAt lastSeenAt')
      .sort({ lastSeenAt: -1 })
      .lean<
        {
          _id: Types.ObjectId;
          platform?: string;
          appVersion?: string;
          createdAt?: Date;
          lastSeenAt?: Date;
        }[]
      >();
    return rows.map((r) => {
      const kind = (r.platform ?? 'android') as 'android' | 'ios' | 'web';
      return {
        id: String(r._id),
        kind,
        label: `${PLATFORM_LABEL[kind] ?? 'App'}${r.appVersion ? ` ${r.appVersion}` : ''}`,
        installed: true,
        createdAt: r.createdAt,
        lastSeenAt: r.lastSeenAt,
      };
    });
  }

  /** Baja de un dispositivo por id, solo si es del usuario. */
  async removeById(id: string, userId: string): Promise<{ removed: number }> {
    if (!Types.ObjectId.isValid(id)) return { removed: 0 };
    const res = await this.deviceTokens.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
    return { removed: res.deletedCount ?? 0 };
  }

  /**
   * Envía a todos los dispositivos de un usuario. Nunca lanza: una push que
   * falla no debe tumbar la operación de negocio que la disparó.
   */
  async sendToUser(
    userId: string | Types.ObjectId,
    payload: NativePushPayload,
  ): Promise<number> {
    return this.sendToUsers([userId], payload);
  }

  /** Envía a varios usuarios de una vez, respetando sus preferencias. */
  async sendToUsers(
    userIds: (string | Types.ObjectId)[],
    payload: NativePushPayload,
  ): Promise<number> {
    if (!this.app || !userIds.length) return 0;
    const ids = await this.audience.forUsers(userIds, payload.category);
    return this.sendToAllowed(ids, payload);
  }

  /**
   * Avisa a quienes de la empresa tienen acceso a un módulo. Es la vía normal
   * para los avisos de negocio: notificar a todo el tenant llenaría el móvil
   * del impulsador de mensajes de una bandeja que ni siquiera puede abrir.
   */
  async sendToTenantModule(
    tenantId: string | Types.ObjectId,
    moduleKey: string,
    payload: NativePushPayload,
    opts?: { excludeUserId?: string },
  ): Promise<number> {
    if (!this.app) return 0;
    const ids = await this.audience.forModule(tenantId, moduleKey, {
      category: payload.category,
      excludeUserId: opts?.excludeUserId,
    });
    return this.sendToAllowed(ids, payload);
  }

  /** Tokens de los usuarios ya filtrados por la audiencia. Nunca lanza. */
  private async sendToAllowed(
    userIds: string[],
    payload: NativePushPayload,
  ): Promise<number> {
    if (!userIds.length) return 0;
    try {
      const devices = await this.deviceTokens
        .find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('token')
        .lean();
      if (!devices.length) return 0;
      return await this.send(
        devices.map((d) => d.token),
        payload,
      );
    } catch (err) {
      this.logger.error(`Error enviando push: ${(err as Error).message}`);
      return 0;
    }
  }

  private async send(
    tokens: string[],
    payload: NativePushPayload,
  ): Promise<number> {
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
            defaultSound: true,
            ...(payload.badge !== undefined
              ? { notificationCount: payload.badge }
              : {}),
            // Con etiqueta, cada aviso nuevo del mismo origen sustituye al
            // anterior y la app puede retirarlo al abrir la conversación.
            ...(payload.tag ? { tag: payload.tag } : {}),
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
