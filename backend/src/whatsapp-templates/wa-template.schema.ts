import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'IN_APPEAL'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED';

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export const TEMPLATE_STATUSES: TemplateStatus[] = [
  'APPROVED',
  'PENDING',
  'IN_APPEAL',
  'REJECTED',
  'PAUSED',
  'DISABLED',
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
];

/**
 * Plantilla de WhatsApp Cloud API. El espejo local de lo que vive en Meta:
 * `components` es la representación autoritativa (tal cual la acepta y devuelve
 * Graph) y el resto de campos están desnormalizados solo para pintar la lista.
 *
 * Cada plantilla pertenece a una cuenta de WhatsApp concreta, porque las
 * plantillas viven en el WABA de esa cuenta.
 */
@Schema({ timestamps: true })
export class WaTemplate extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  /** Cuenta de WhatsApp (WhatsAppAccount) dueña del WABA donde vive la plantilla. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  metaId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: TEMPLATE_CATEGORIES })
  category: TemplateCategory;

  @Prop({ required: true })
  language: string;

  @Prop({ enum: TEMPLATE_STATUSES, default: 'PENDING' })
  status: TemplateStatus;

  /** Motivo del rechazo que devuelve Meta (solo cuando status = REJECTED). */
  @Prop()
  rejectedReason?: string;

  /** Calidad del envío según Meta: GREEN | YELLOW | RED. */
  @Prop()
  qualityScore?: string;

  // ── Desnormalizado para la lista ──
  @Prop()
  headerType?: string;

  @Prop()
  headerText?: string;

  /**
   * URL en S3 del archivo de ejemplo de la cabecera multimedia. Meta no devuelve
   * una URL reutilizable en el sync, así que la guardamos para poder mostrar la
   * vista previa y reenviar el mismo archivo al editar.
   */
  @Prop()
  headerMediaUrl?: string;

  /** Vacío en las plantillas de autenticación: el texto lo redacta Meta. */
  @Prop({ default: '' })
  body: string;

  @Prop()
  footer?: string;

  /** Componentes completos tal como los acepta/devuelve Meta. */
  @Prop({ type: Array, default: [] })
  components: Record<string, unknown>[];
}

export const WaTemplateSchema = SchemaFactory.createForClass(WaTemplate);
WaTemplateSchema.index({ accountId: 1, metaId: 1 }, { unique: true });
WaTemplateSchema.index({ tenantId: 1, name: 1 });
