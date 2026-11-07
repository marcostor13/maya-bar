import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Envío exitoso de una campaña de Maya a una dirección (teléfono o correo). */
@Schema({ collection: 'campaign_touches' })
export class CampaignTouch extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ required: true })
  campaignName: string;

  @Prop({ type: String, enum: ['phone', 'email'], required: true })
  channel: 'phone' | 'email';

  /** Últimos 9 dígitos del teléfono o email en minúsculas. */
  @Prop({ required: true })
  address: string;

  @Prop({ type: Date, required: true })
  at: Date;
}

export const CampaignTouchSchema = SchemaFactory.createForClass(CampaignTouch);
CampaignTouchSchema.index({ tenantId: 1, channel: 1, address: 1, at: -1 });
// Más allá de la ventana de atribución ya no sirven.
CampaignTouchSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 86_400 });
