import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantPlan = 'starter' | 'pro' | 'enterprise';

@Schema({ timestamps: true })
export class Tenant extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  ruc?: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ default: 'starter' })
  plan: TenantPlan;

  @Prop()
  planExpiresAt?: Date;

  @Prop()
  trialEndsAt?: Date;

  @Prop({
    type: {
      logo: String,
      favicon: String,
      primaryColor: String,
      secondaryColor: String,
    },
    default: {},
  })
  branding: {
    logo?: string;
    /** Icono de la pestaña en la landing de sus eventos (HU26). */
    favicon?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };

  @Prop({ default: true })
  isActive: boolean;

  /** Tarifas que la empresa paga a sus proveedores, para estimar costos (HU18). */
  @Prop({ type: Object })
  messageCosts?: { smsPerSegment?: number; emailPer1000?: number };
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
