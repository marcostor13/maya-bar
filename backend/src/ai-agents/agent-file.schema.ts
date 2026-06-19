import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AgentFile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true, index: true })
  agentId: Types.ObjectId;

  /** Identificador corto usado en {{SEND_FILE:alias}} dentro del prompt */
  @Prop({ required: true })
  alias: string;

  /** Nombre descriptivo visible en el prompt del sistema y en la UI */
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  key?: string;

  @Prop()
  contentType?: string;
}

export const AgentFileSchema = SchemaFactory.createForClass(AgentFile);
AgentFileSchema.index({ agentId: 1, alias: 1 }, { unique: true });
