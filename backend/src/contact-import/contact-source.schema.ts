import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Conexión guardada a una base MongoDB externa desde la que se alimentan los
 * contactos. La URI se guarda porque hace falta para re-sincronizar, pero
 * NUNCA se devuelve al frontend (ver `toPublic` en el service).
 */
@Schema({ timestamps: true })
export class ContactSource extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  uri: string;

  @Prop({ required: true })
  database: string;

  /** `collectionName` y no `collection`: Document ya usa ese nombre. */
  @Prop({ required: true })
  collectionName: string;

  /** Campo del origen → campo del contacto. */
  @Prop({ type: Object, default: {} })
  mapping: Record<string, string>;

  /** Filtro de Mongo (JSON) que acota qué documentos se importan. */
  @Prop({ type: Object })
  filter?: Record<string, unknown>;

  /** Etiquetas que se añaden a todos los contactos de esta fuente. */
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  lastRunAt?: Date;

  @Prop({ default: 0 })
  lastImported: number;

  @Prop({ default: 0 })
  lastUpdated: number;

  @Prop()
  lastError?: string;
}

export const ContactSourceSchema = SchemaFactory.createForClass(ContactSource);
ContactSourceSchema.index({ tenantId: 1, label: 1 });
