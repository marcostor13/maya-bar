import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditChanges, UserAudit, UserAuditAction } from './user-audit.schema';

export interface AuditActor {
  userId: string;
  role: string;
  name?: string;
}

export interface AuditTarget {
  _id: Types.ObjectId | string;
  email?: string;
  name?: string;
  tenantId?: Types.ObjectId | string | null;
}

/** Campos que jamás se guardan en el registro, aunque lleguen en `changes`. */
const SECRET_FIELDS = new Set([
  'password',
  'resetPasswordCode',
  'resetPasswordExpires',
  'resetPasswordAttempts',
  'emailVerificationCodeHash',
  'tempPassword',
]);

const LIMIT = 200;

@Injectable()
export class UserAuditService {
  private readonly logger = new Logger(UserAuditService.name);

  constructor(@InjectModel(UserAudit.name) private model: Model<UserAudit>) {}

  /**
   * Registra una acción. Un fallo al registrar no deshace la acción (ya está
   * hecha): se deja en el log para no perderlo en silencio.
   */
  async record(
    actor: AuditActor,
    target: AuditTarget,
    action: UserAuditAction,
    changes?: AuditChanges,
  ): Promise<void> {
    const clean = changes
      ? Object.fromEntries(
          Object.entries(changes).filter(([k]) => !SECRET_FIELDS.has(k)),
        )
      : undefined;
    try {
      await this.model.create({
        tenantId: target.tenantId
          ? new Types.ObjectId(String(target.tenantId))
          : undefined,
        actorId: new Types.ObjectId(actor.userId),
        actorName: actor.name,
        actorRole: actor.role,
        targetId: new Types.ObjectId(String(target._id)),
        targetEmail: target.email,
        targetName: target.name,
        action,
        ...(clean && Object.keys(clean).length ? { changes: clean } : {}),
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar ${action} sobre el usuario ${String(target._id)}: ${String(err)}`,
      );
    }
  }

  /** Las más recientes de una empresa, o de toda la plataforma sin `tenantId`. */
  list(filter: { tenantId?: string; targetId?: string }) {
    const q: Record<string, unknown> = {};
    if (filter.tenantId) q.tenantId = new Types.ObjectId(filter.tenantId);
    if (filter.targetId && Types.ObjectId.isValid(filter.targetId))
      q.targetId = new Types.ObjectId(filter.targetId);
    return this.model.find(q).sort({ at: -1 }).limit(LIMIT).lean().exec();
  }
}

/** Diferencias entre dos objetos para los campos indicados. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): AuditChanges {
  const out: AuditChanges = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = JSON.stringify(before[f] ?? null);
    const b = JSON.stringify(after[f] ?? null);
    if (a !== b) out[f] = { from: before[f], to: after[f] };
  }
  return out;
}
