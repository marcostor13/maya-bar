import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Fragmento de texto vectorizado. El campo `embedding` se indexa con un
 * índice Atlas Vector Search ("vector_index"). Los campos `aId`/`tId` son
 * strings para poder filtrar la búsqueda vectorial por agente/tenant.
 */
@Schema({ timestamps: true })
export class KnowledgeChunk extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'KnowledgeDoc',
    required: true,
    index: true,
  })
  docId: Types.ObjectId;

  @Prop({ required: true, index: true })
  aId: string; // String(agentId) — filtro vectorial

  @Prop({ required: true })
  tId: string; // String(tenantId) — filtro vectorial

  @Prop({ required: true })
  text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ default: 0 })
  index: number;
}

export const KnowledgeChunkSchema =
  SchemaFactory.createForClass(KnowledgeChunk);
