import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

/** Tipos de bloque que entiende el editor. */
export const EMAIL_BLOCK_TYPES = [
  'header',
  'text',
  'image',
  'button',
  'divider',
  'spacer',
  'columns',
  'footer',
  'html',
] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  props: Record<string, unknown>;
}

export interface EmailDesignDoc {
  settings: Record<string, unknown>;
  blocks: EmailBlock[];
}

/**
 * Plantilla HTML de email. `design` es lo que edita el constructor por
 * bloques y `html` lo que finalmente se envía: en modo `html` el usuario
 * escribe el código directamente y `design` no se usa.
 */
@Schema({ timestamps: true })
export class EmailTemplate extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  subject: string;

  /** Texto que algunos clientes muestran junto al asunto en la bandeja. */
  @Prop({ trim: true, default: '' })
  preheader: string;

  @Prop({
    type: String,
    required: true,
    enum: ['blocks', 'html'],
    default: 'blocks',
  })
  mode: 'blocks' | 'html';

  @Prop({ type: MongooseSchema.Types.Mixed })
  design?: EmailDesignDoc;

  @Prop({ required: true, default: '' })
  html: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
EmailTemplateSchema.index({ tenantId: 1, updatedAt: -1 });
