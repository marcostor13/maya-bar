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
 * Respuesta automática por WhatsApp al completarse el registro. Usa una
 * plantilla aprobada porque, fuera de la ventana de 24 h, Meta solo admite
 * plantillas: un formulario público casi siempre es un primer contacto.
 */
export interface FormWhatsAppReply {
  enabled: boolean;
  templateName?: string;
  templateLanguage?: string;
  /** Valor de cada hueco; admite los tokens {nombre}, {email} y {telefono}. */
  templateVars: string[];
  /** Archivo para la cabecera, si la plantilla se aprobó con una multimedia. */
  headerMediaUrl?: string;
}

/** Respuesta automática por email al completarse el registro. */
export interface FormEmailReply {
  enabled: boolean;
  subject?: string;
  body?: string;
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

  /**
   * Mixed a propósito, igual que `fields`: un sub-esquema tipado trataría
   * claves como `type` o `required` como opciones reservadas de Mongoose.
   */
  @Prop({
    type: Object,
    default: () => ({ enabled: false, templateVars: [] }),
  })
  autoWhatsApp: FormWhatsAppReply;

  @Prop({ type: Object, default: () => ({ enabled: false }) })
  autoEmail: FormEmailReply;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;
}

export const ContactFormSchema = SchemaFactory.createForClass(ContactForm);
ContactFormSchema.index({ tenantId: 1, name: 1 });
