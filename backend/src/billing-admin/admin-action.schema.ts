import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminActionType =
  | 'extend_trial'
  | 'change_plan'
  | 'manual_payment'
  | 'refund'
  | 'resend_access'
  | 'resend_receipt';

/** Qué hizo el superadmin sobre una suscripción y quién (HU57 §5). */
@Schema({ collection: 'billing_admin_actions', timestamps: true })
export class AdminAction extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  actorEmail: string;

  @Prop({ type: String, required: true })
  action: AdminActionType;

  @Prop({ type: Object })
  details?: Record<string, unknown>;

  createdAt?: Date;
}

export const AdminActionSchema = SchemaFactory.createForClass(AdminAction);
AdminActionSchema.index({ tenantId: 1, createdAt: -1 });
