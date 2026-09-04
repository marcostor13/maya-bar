import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** De dónde salió la baja. Sirve para auditar quién dejó de recibir y por qué. */
export const SUPPRESSION_SOURCES = [
  'inbox',
  'manual',
  'import',
  'reply',
] as const;
export type SuppressionSource = (typeof SUPPRESSION_SOURCES)[number];

/**
 * Una persona que pidió no recibir comunicaciones.
 *
 * Vive en su PROPIA colección y no como un campo del contacto a propósito: la
 * importación de contactos hace upserts masivos y una ficha se puede borrar y
 * volver a crear. Si la baja viviera en el contacto, el siguiente CSV la
 * borraría y se volvería a escribir a quien pidió que no. Aquí la clave es el
 * dato de contacto normalizado, así que la baja sobrevive a la ficha.
 */
@Schema({ timestamps: true })
export class SuppressionEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  /** Solo dígitos (`51999888777`), como los deja `phoneDigits`. */
  @Prop({ trim: true })
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  /** Nombre en el momento de la baja, para que la lista sea legible. */
  @Prop({ trim: true })
  name?: string;

  /** Motivo que anotó quien la dio de baja. */
  @Prop({ trim: true })
  reason?: string;

  // `type: String` explícito: con un tipo unión, Mongoose no puede deducirlo
  // desde los metadatos y el esquema revienta al construirse (al arrancar).
  @Prop({ type: String, enum: SUPPRESSION_SOURCES, default: 'manual' })
  source: SuppressionSource;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  /** Conversación desde la que se dio de baja, si vino de la bandeja. */
  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;
}

export const SuppressionEntrySchema =
  SchemaFactory.createForClass(SuppressionEntry);

// Índices parciales: un contacto puede tener solo teléfono o solo email, y no
// se puede dar de baja dos veces el mismo dato dentro del mismo tenant.
SuppressionEntrySchema.index(
  { tenantId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
  },
);
SuppressionEntrySchema.index(
  { tenantId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
  },
);
SuppressionEntrySchema.index({ tenantId: 1, createdAt: -1 });
