import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Un dispositivo (navegador o app instalada) suscrito a las notificaciones push.
 *
 * El `endpoint` que devuelve el navegador identifica al dispositivo de forma
 * única, así que es la clave natural: reinstalar la PWA genera uno nuevo y el
 * viejo se limpia solo en cuanto el servicio de push lo rechaza (404/410).
 */
@Schema({ timestamps: true })
export class PushSubscription extends Document {
  @Prop({ required: true, unique: true, index: true })
  endpoint: string;

  /** Clave pública del cliente para cifrar el payload (estándar Web Push). */
  @Prop({ required: true })
  p256dh: string;

  /** Secreto de autenticación del cliente (estándar Web Push). */
  @Prop({ required: true })
  auth: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId?: Types.ObjectId;

  /** Rol en el momento de suscribirse; se refresca en cada alta. */
  @Prop()
  role?: string;

  @Prop()
  userAgent?: string;

  /** Última vez que el dispositivo confirmó la suscripción desde el cliente. */
  @Prop({ default: Date.now })
  lastSeenAt: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
