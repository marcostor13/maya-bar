import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Un dispositivo registrado para recibir push. La clave real es el `token` de
 * FCM: el mismo usuario puede tener varios (móvil, tablet) y un mismo
 * dispositivo puede cambiar de usuario, así que el token se reasigna en vez de
 * duplicarse.
 */
@Schema({ timestamps: true })
export class DeviceToken extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ enum: ['android', 'ios', 'web'], default: 'android' })
  platform: 'android' | 'ios' | 'web';

  @Prop()
  appVersion?: string;

  /** Se refresca en cada registro; sirve para purgar dispositivos dormidos. */
  @Prop({ default: Date.now })
  lastSeenAt: Date;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
