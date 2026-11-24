import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type {
  ReportChart,
  ReportFilters,
  ReportGroup,
  ReportMetric,
  ReportSource,
} from './report-definition';

/** Reporte guardado (HU64). */
@Schema({ collection: 'reports', timestamps: true })
export class Report extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true })
  source: ReportSource;

  @Prop({ type: String, required: true })
  metric: ReportMetric;

  @Prop({ type: String, required: true })
  groupBy: ReportGroup;

  @Prop({ type: Object, default: {} })
  filters: ReportFilters;

  @Prop({ type: String, default: 'table' })
  chart: ReportChart;

  /** Aparece en el dashboard de quienes lo pueden ver. */
  @Prop({ default: false })
  pinned: boolean;

  /** Roles que lo ven además de quien lo creó y el administrador. */
  @Prop({ type: [String], default: [] })
  sharedRoles: string[];

  @Prop({ type: Types.ObjectId })
  createdBy: Types.ObjectId;

  /** Envío programado por correo. */
  @Prop({ type: Object })
  schedule?: {
    frequency: 'weekly' | 'monthly';
    emails: string[];
    lastSentAt?: Date;
  } | null;
}
export const ReportSchema = SchemaFactory.createForClass(Report);
