import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Envío crudo de un formulario público, tal como llegó desde la landing. */
@Schema({ timestamps: true })
export class FormSubmission extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ContactForm',
    required: true,
    index: true,
  })
  formId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  /** Respuestas sin procesar (incluye campos no mapeados al contacto). */
  @Prop({ type: Object, default: {} })
  data: Record<string, unknown>;

  /** URL de la página donde estaba embebido el formulario. */
  @Prop()
  pageUrl?: string;

  @Prop()
  referer?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  createdAt: Date;
}

export const FormSubmissionSchema =
  SchemaFactory.createForClass(FormSubmission);
FormSubmissionSchema.index({ formId: 1, createdAt: -1 });
