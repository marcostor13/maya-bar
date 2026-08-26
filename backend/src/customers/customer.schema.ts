import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Customer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  /**
   * Opcional: muchas listas importadas solo traen teléfono. La unicidad se
   * resuelve con índices parciales (ver más abajo).
   */
  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  /**
   * Canal por el que entró el contacto. Se fija al crearlo y no se pisa
   * después: sirve para distinguir un alta directa de una que llegó por un
   * formulario embebido en una landing externa.
   */
  @Prop({
    enum: [
      'reservation',
      'event',
      'manual',
      'import',
      'mongodb',
      'form',
      'api',
      'whatsapp',
      'instagram',
    ],
    default: 'manual',
  })
  source: string;

  /** Fuente de importación de la que vino el contacto, si aplica. */
  @Prop({ type: Types.ObjectId, ref: 'ContactSource', index: true })
  sourceId?: Types.ObjectId;

  /** Formulario público que lo capturó, si `source === 'form'`. */
  @Prop({ type: Types.ObjectId, ref: 'ContactForm', index: true })
  formId?: Types.ObjectId;

  /** Nombre legible del origen: "Landing Black Friday", "Import CSV enero"… */
  @Prop({ trim: true })
  sourceLabel?: string;

  /** URL de la página desde la que se envió el formulario. */
  @Prop({ trim: true })
  sourceUrl?: string;

  /** Campos del origen que no encajan en el modelo, conservados tal cual. */
  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ default: 0 })
  totalReservations: number;

  @Prop({ default: 0 })
  totalEvents: number;

  @Prop()
  lastVisit?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

// Unicidad por (email, tenant, dueño) — los impulsadores tienen su propia lista.
// Es parcial: los contactos sin email (importados solo con teléfono) no chocan
// entre sí, cosa que un índice único normal sí haría al tratar null como valor.
CustomerSchema.index(
  { email: 1, tenantId: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
    name: 'email_tenant_owner_unique',
  },
);

// Misma idea para el teléfono, que es la clave real en WhatsApp.
CustomerSchema.index(
  { phone: 1, tenantId: 1, createdBy: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
    name: 'phone_tenant_owner_unique',
  },
);
