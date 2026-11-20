import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Dominio propio para la landing de un evento (HU25).
 *
 * Lo sirve la app del frontend (no la API, a diferencia de los dominios de
 * links). Estados, como `ShortDomain`:
 * - `pending`: el DNS aún no apunta al servidor.
 * - `dns_ok`: apunta, pero el alta en el proxy no es automática o falló.
 * - `activating`: se pidió el alta en Coolify; Traefik emite el certificado.
 * - `active`: responde por https; la raíz del dominio muestra el evento.
 */
@Schema({ timestamps: true })
export class LandingDomain extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  domain: string;

  /** Evento que se ve en la raíz del dominio. */
  @Prop({ type: Types.ObjectId, ref: 'Event', index: true })
  eventId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['pending', 'dns_ok', 'activating', 'active'],
    default: 'pending',
  })
  status: 'pending' | 'dns_ok' | 'activating' | 'active';

  /**
   * Prueba de propiedad: el TXT `_maya-verify.<dominio>` debe contener
   * `maya-verify=<token>`. Apuntar el DNS al servidor no basta, porque un
   * CNAME hacia la plataforma lo puede aprovechar cualquier empresa.
   */
  @Prop({ required: true })
  verifyToken: string;

  @Prop({ type: Date })
  activationRequestedAt?: Date;

  @Prop({ type: Date })
  checkedAt?: Date;

  @Prop()
  checkMessage?: string;

  @Prop({ type: [String], default: [] })
  resolvedTo: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}
export const LandingDomainSchema = SchemaFactory.createForClass(LandingDomain);
