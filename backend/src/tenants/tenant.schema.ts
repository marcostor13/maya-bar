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
      primaryColor: String,
      secondaryColor: String,
    },
    default: {},
  })
  branding: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };

  @Prop({ default: true })
  isActive: boolean;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
