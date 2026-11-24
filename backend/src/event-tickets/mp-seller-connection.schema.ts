import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Cuenta de Mercado Pago de la empresa conectada por OAuth (HU67): el dinero
 * de las entradas va a la productora y Maya cobra su comisión (`marketplace_fee`).
 * Los tokens se guardan cifrados con `SecretBox`.
 */
@Schema({ collection: 'mp_seller_connections', timestamps: true })
export class MpSellerConnection extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, index: true })
  mpUserId: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop()
  refreshToken?: string;

  @Prop()
  publicKey?: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: false })
  liveMode: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  connectedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MpSellerConnectionSchema =
  SchemaFactory.createForClass(MpSellerConnection);
