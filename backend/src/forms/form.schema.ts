import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'date';

/** Campo del contacto al que se vuelca la respuesta. Vacío → customFields. */
export type FormFieldMapTo = 'name' | 'email' | 'phone' | 'notes' | '';

export interface FormField {
  /** Nombre técnico del input (name= en el HTML). */
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required: boolean;
  /** Solo para type 'select'. */
  options: string[];
  mapTo: FormFieldMapTo;
}

/**
 * Formulario publicable: se expone como API pública (`/public/forms/:publicKey`)
 * para que cualquier landing externa pueda enviar contactos a la plataforma.
 */
@Schema({ timestamps: true })
export class ContactForm extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  /**
   * Clave pública que identifica el formulario en la URL. No es un secreto:
   * queda a la vista en el HTML de la landing, por eso solo permite escribir
   * contactos y nunca leerlos.
   */
  @Prop({ required: true, unique: true, index: true })
  publicKey: string;

  /**
   * Mixed a propósito: un sub-esquema tipado interpretaría `type` y `required`
   * (dos de las claves del campo) como opciones reservadas de Mongoose y se
   * comería la definición. La forma la garantiza el DTO al entrar.
   */
  @Prop({ type: [Object], default: [] })
  fields: FormField[];

  /** Etiquetas que se añaden a todo contacto creado por este formulario. */
  @Prop({ type: [String], default: [] })
  tags: string[];

  /** Listas estáticas a las que se agrega automáticamente el contacto. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'ContactList' }], default: [] })
  listIds: Types.ObjectId[];

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: '¡Gracias! Hemos recibido tus datos.' })
  successMessage: string;

  /** Si se define, el embed redirige aquí tras un envío correcto. */
  @Prop()
  redirectUrl?: string;

  @Prop({ default: 0 })
  submissionCount: number;

  @Prop()
  lastSubmissionAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;
}

export const ContactFormSchema = SchemaFactory.createForClass(ContactForm);
ContactFormSchema.index({ tenantId: 1, name: 1 });
