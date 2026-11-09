import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const USER_AUDIT_ACTIONS = [
  'create',
  'update',
  'activate',
  'deactivate',
  'reset_access',
  'transfer_admin',
  'delete',
] as const;
export type UserAuditAction = (typeof USER_AUDIT_ACTIONS)[number];

/** Cambio de un campo: valor anterior y nuevo. Nunca contraseñas ni códigos. */
export type AuditChanges = Record<string, { from?: unknown; to?: unknown }>;

/** Quién hizo qué con un usuario. Se conserva un año. */
@Schema({ collection: 'user_audit', versionKey: false })
export class UserAudit extends Document {
  /** Empresa del usuario afectado. */
  @Prop({ type: Types.ObjectId, index: true })
  tenantId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @Prop()
  actorName?: string;

  @Prop({ required: true })
  actorRole: string;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop()
  targetEmail?: string;

  @Prop()
  targetName?: string;

  @Prop({ type: String, required: true, enum: USER_AUDIT_ACTIONS })
  action: UserAuditAction;

  @Prop({ type: Object })
  changes?: AuditChanges;

  @Prop({ type: Date, default: Date.now })
  at: Date;
}

export const UserAuditSchema = SchemaFactory.createForClass(UserAudit);
UserAuditSchema.index({ tenantId: 1, at: -1 });
UserAuditSchema.index({ targetId: 1, at: -1 });
UserAuditSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });
