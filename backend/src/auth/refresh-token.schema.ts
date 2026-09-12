import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Token de renovación de sesión.
 *
 * Se guarda el HASH, nunca el token: si alguien se lleva la base de datos, no
 * se lleva sesiones utilizables. Y se rota en cada uso —cada renovación emite
 * uno nuevo y marca el anterior— para que un token robado deje de servir en
 * cuanto el dueño legítimo renueve.
 */
@Schema({ timestamps: true })
export class RefreshToken extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** SHA-256 del token entregado al cliente. */
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  /** Se marca al rotarlo o al cerrar sesión; un token usado no vuelve a valer. */
  @Prop({ type: Date })
  revokedAt?: Date;

  /** Para que el usuario pueda reconocer sus sesiones si algún día se listan. */
  @Prop()
  userAgent?: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Mongo borra solo los caducados: la colección no crece sin límite y un token
// vencido no puede quedarse por ahí aunque nadie pase a limpiar.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
