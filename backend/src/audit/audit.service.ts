import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema';

/** Retención del registro de actividad (HU63). */
export const AUDIT_RETENTION_DAYS = 365;

@Schema({
  collection: 'audit_log',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditEntry {
  @Prop({ type: Types.ObjectId, index: true })
  tenantId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, index: true })
  userId?: Types.ObjectId | null;

  /** Correo de quien actuó (o intentó entrar), para leerlo sin cruzar con usuarios. */
  @Prop()
  actorEmail?: string;

  @Prop()
  actorRole?: string;

  /** p. ej. `auth.login`, `customers.export`, `users.role_changed`. */
  @Prop({ required: true, index: true })
  action: string;

  @Prop()
  resource?: string;

  @Prop()
  resourceId?: string;

  /** Resumen sin datos sensibles (nunca contraseñas, tokens ni contenido de mensajes). */
  @Prop({ type: Object })
  details?: Record<string, unknown>;

  @Prop({ default: true })
  success: boolean;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  createdAt: Date;
}
export const AuditEntrySchema = SchemaFactory.createForClass(AuditEntry);
AuditEntrySchema.index({ tenantId: 1, createdAt: -1 });
AuditEntrySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 3600 },
);

export interface AuditInput {
  tenantId?: string | null;
  userId?: string | null;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  ip?: string;
  userAgent?: string;
}

export interface AuditQuery {
  tenantId?: string;
  userId?: string;
  /** Parte del correo de quien actuó. */
  email?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const SENSITIVE = /pass|token|secret|key|code|authorization|cookie/i;
const oid = (v?: string | null) =>
  v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null;

/** Quita campos sensibles y recorta textos largos. */
export function sanitizeDetails(
  d?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!d) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || SENSITIVE.test(k)) continue;
    if (typeof v === 'string')
      out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null)
      out[k] = v;
    else if (Array.isArray(v))
      out[k] = (v as unknown[])
        .slice(0, 20)
        .map((x) => (x !== null && typeof x === 'object' ? '[obj]' : x));
    else out[k] = '[obj]';
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s =
    v === undefined || v === null
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : (v as { toString(): string }).toString();
  // Evita la inyección de fórmulas al abrir el CSV en Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Registro de actividad de la cuenta (HU63). Nunca rompe la operación que registra. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditEntry.name) private model: Model<AuditEntry>,
    @InjectModel(User.name) private users: Model<User>,
  ) {}

  async log(e: AuditInput): Promise<void> {
    try {
      await this.model.create({
        tenantId: oid(e.tenantId),
        userId: oid(e.userId),
        actorEmail: e.actorEmail?.toLowerCase(),
        actorRole: e.actorRole,
        action: e.action,
        resource: e.resource,
        resourceId: e.resourceId,
        details: sanitizeDetails(e.details),
        success: e.success ?? true,
        ip: e.ip,
        userAgent: e.userAgent?.slice(0, 300),
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar ${e.action}: ${(err as Error).message}`,
      );
    }
  }

  /** Inicio de sesión correcto (también tras el segundo factor). */
  loginOk(
    user: Record<string, unknown>,
    ip?: string,
    userAgent?: string,
    method?: string,
  ) {
    const str = (v: unknown) =>
      v === undefined || v === null
        ? null
        : (v as { toString(): string }).toString();
    return this.log({
      tenantId: str(user.tenantId),
      userId: str(user._id),
      actorEmail: user.email as string,
      actorRole: user.role as string,
      action: 'auth.login',
      resource: 'user',
      resourceId: str(user._id) ?? undefined,
      details: method ? { method } : undefined,
      ip,
      userAgent,
    });
  }

  /** Intento fallido: se atribuye a la empresa del correo si existe (sin revelarlo a nadie más). */
  async loginFailed(
    email: string,
    reason: string,
    ip?: string,
    userAgent?: string,
    stage = 'password',
  ) {
    const u = await this.users
      .findOne({
        email: String(email ?? '')
          .toLowerCase()
          .trim(),
      })
      .select('_id tenantId role')
      .lean<{ _id: Types.ObjectId; tenantId?: Types.ObjectId; role?: string }>()
      .exec()
      .catch(() => null);
    return this.log({
      tenantId: u?.tenantId ? String(u.tenantId) : null,
      userId: u ? String(u._id) : null,
      actorEmail: email,
      actorRole: u?.role,
      action: 'auth.login_failed',
      resource: 'user',
      details: { reason, stage },
      success: false,
      ip,
      userAgent,
    });
  }

  /** Código del segundo factor incorrecto. */
  async twoFactorFailed(userId: string, ip?: string, userAgent?: string) {
    const u = Types.ObjectId.isValid(userId)
      ? await this.users
          .findById(userId)
          .select('_id tenantId role email')
          .lean<{
            _id: Types.ObjectId;
            tenantId?: Types.ObjectId;
            role?: string;
            email?: string;
          }>()
          .exec()
          .catch(() => null)
      : null;
    return this.log({
      tenantId: u?.tenantId ? String(u.tenantId) : null,
      userId,
      actorEmail: u?.email,
      actorRole: u?.role,
      action: 'auth.login_failed',
      resource: 'user',
      details: { reason: 'bad_code', stage: '2fa' },
      success: false,
      ip,
      userAgent,
    });
  }

  private filter(q: AuditQuery) {
    const f: Record<string, unknown> = {};
    if (q.tenantId) f.tenantId = oid(q.tenantId);
    if (q.userId) f.userId = oid(q.userId);
    if (q.email)
      f.actorEmail = {
        $regex: String(q.email)
          .toLowerCase()
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      };
    if (q.action)
      f.action = q.action.endsWith('.')
        ? { $regex: `^${q.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
        : q.action;
    const created: Record<string, Date> = {};
    if (q.from && !isNaN(Date.parse(q.from))) created.$gte = new Date(q.from);
    if (q.to && !isNaN(Date.parse(q.to))) {
      const to = new Date(q.to);
      // Fecha sin hora: incluye todo ese día.
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setUTCHours(23, 59, 59, 999);
      created.$lte = to;
    }
    if (Object.keys(created).length) f.createdAt = created;
    return f;
  }

  async list(q: AuditQuery) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const f = this.filter(q);
    const [items, total] = await Promise.all([
      this.model
        .find(f)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(f).exec(),
    ]);
    return { items, total, page, limit };
  }

  /** Acciones distintas del filtro, para el desplegable. */
  async actions(tenantId?: string): Promise<string[]> {
    const vals = await this.model
      .distinct('action', tenantId ? { tenantId: oid(tenantId) } : {})
      .exec();
    return vals.sort();
  }

  async exportCsv(q: AuditQuery): Promise<string> {
    const rows = await this.model
      .find(this.filter(q))
      .sort({ createdAt: -1 })
      .limit(50_000)
      .lean()
      .exec();
    const head = [
      'fecha',
      'usuario',
      'rol',
      'accion',
      'recurso',
      'id',
      'resultado',
      'detalle',
      'ip',
      'dispositivo',
    ];
    const lines = rows.map((r) =>
      [
        r.createdAt?.toISOString(),
        r.actorEmail,
        r.actorRole,
        r.action,
        r.resource,
        r.resourceId,
        r.success ? 'ok' : 'fallo',
        r.details,
        r.ip,
        r.userAgent,
      ]
        .map(csvCell)
        .join(','),
    );
    return [head.join(','), ...lines].join('\n');
  }
}
