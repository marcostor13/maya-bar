import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const TENANT_AUDIT_ACTIONS = [
  'create',
  'update',
  'suspend',
  'reactivate',
  'delete',
  'owner_reset',
  'owner_assign',
] as const;
export type TenantAuditAction = (typeof TENANT_AUDIT_ACTIONS)[number];

/** Acción del superadministrador sobre una empresa (HU16, HU17). Se conserva dos años. */
@Schema({ collection: 'tenant_audit', versionKey: false })
export class TenantAudit extends Document {
  @Prop({ type: Types.ObjectId, required: true })
  tenantId: Types.ObjectId;

  @Prop()
  tenantName?: string;

  @Prop({ type: Types.ObjectId })
  actorId?: Types.ObjectId;

  @Prop()
  actorEmail?: string;

  @Prop({ type: String, required: true, enum: TENANT_AUDIT_ACTIONS })
  action: TenantAuditAction;

  /** Campo → { from, to }. Nunca contraseñas. */
  @Prop({ type: Object })
  changes?: Record<string, { from?: unknown; to?: unknown }>;

  @Prop({ type: Date, default: Date.now })
  at: Date;
}

export const TenantAuditSchema = SchemaFactory.createForClass(TenantAudit);
TenantAuditSchema.index({ tenantId: 1, at: -1 });
TenantAuditSchema.index({ at: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 3600 });
