import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class InstagramAccount extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  label: string; // nombre legible de la cuenta

  @Prop()
  username?: string; // @usuario visible (informativo)

  // Instagram API with Instagram Login (Meta Graph API) — no requiere Página de FB
  @Prop() igBusinessAccountId?: string; // Instagram User ID (IG_ID)
  @Prop() pageId?: string; // solo informativo, flujo clásico ligado a Página (legacy)
  @Prop() pageAccessToken?: string; // Instagram User Access Token (largo plazo)
  @Prop() verifyToken?: string; // token de verificación del webhook (Meta)

  @Prop({ type: Date })
  tokenExpiresAt?: Date; // vencimiento del access token (solo cuentas conectadas vía OAuth)

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  isDefault: boolean; // cuenta usada por defecto para envíos salientes
}

export const InstagramAccountSchema = SchemaFactory.createForClass(InstagramAccount);
