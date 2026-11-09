import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Lo que Meta no devuelve al consultar el permiso de llamada: que hay una
 * solicitud pendiente o que el cliente la rechazó. El estado vigente (temporal
 * o permanente, y su vencimiento) se pregunta siempre a Meta.
 */
@Schema({ timestamps: true, collection: 'call_permissions' })
export class CallPermission extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'WhatsAppAccount', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  contact: string;

  @Prop() requestedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  requestedBy?: Types.ObjectId;

  @Prop({ type: String, enum: ['accept', 'reject'] })
  response?: 'accept' | 'reject';

  @Prop() respondedAt?: Date;
  @Prop() expiresAt?: Date;
  @Prop() permanent?: boolean;
}

export const CallPermissionSchema =
  SchemaFactory.createForClass(CallPermission);
CallPermissionSchema.index({ accountId: 1, contact: 1 }, { unique: true });
