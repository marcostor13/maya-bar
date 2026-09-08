import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class MessengerAccount extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  label: string; // nombre legible de la cuenta

  @Prop()
  username?: string; // @usuario de la Página (informativo)

  // Messenger Platform (Meta Graph API) — los DMs cuelgan de una Página de Facebook
  @Prop({ index: true })
  pageId?: string; // ID de la Página de Facebook

  @Prop()
  pageName?: string; // nombre de la Página tal como lo devuelve Meta

  @Prop()
  pageAccessToken?: string; // Page Access Token (no caduca si viene de un token de usuario largo)

  @Prop({ type: Date })
  tokenExpiresAt?: Date; // vencimiento del token de usuario que originó el de Página

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  isDefault: boolean; // cuenta usada por defecto para envíos salientes
}

export const MessengerAccountSchema =
  SchemaFactory.createForClass(MessengerAccount);
