import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class KnowledgeDoc extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ required: true })
  filename: string;

  @Prop()
  url?: string; // ubicación original en S3

  @Prop()
  key?: string;

  @Prop()
  contentType?: string;

  @Prop({ enum: ['processing', 'ready', 'error'], default: 'processing' })
  status: string;

  @Prop({ default: 0 })
  chunkCount: number;

  @Prop({ default: 0 })
  charCount: number;

  @Prop()
  error?: string;
}

export const KnowledgeDocSchema = SchemaFactory.createForClass(KnowledgeDoc);
