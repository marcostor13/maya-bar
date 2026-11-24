import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'paid';

@Schema({ _id: false })
export class QuoteItem {
  @Prop({ type: Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: 'unidad' })
  unit: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ default: 0, min: 0, max: 100 })
  discountPct: number;

  @Prop({ default: true })
  taxIncluded: boolean;

  // Totales de la línea, calculados al guardar (computeQuote).
  @Prop({ default: 0 }) base: number;
  @Prop({ default: 0 }) igv: number;
  @Prop({ default: 0 }) total: number;
}
const QuoteItemSchema = SchemaFactory.createForClass(QuoteItem);

/** Cotización armada desde una oportunidad (HU68). */
@Schema({ timestamps: true, collection: 'quotes' })
export class Quote extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true, index: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  /** Correlativo por empresa: COT-0001. */
  @Prop({ required: true })
  seq: number;

  @Prop({ required: true })
  number: string;

  @Prop({ type: [QuoteItemSchema], default: [] })
  items: QuoteItem[];

  @Prop({ default: 18, min: 0, max: 100 })
  igvRate: number;

  @Prop({ default: 'PEN' })
  currency: string;

  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ default: 0 }) igv: number;
  @Prop({ default: 0 }) total: number;

  @Prop()
  validUntil?: Date;

  @Prop({ trim: true })
  notes?: string;

  /** Ofrece pagar con la cuenta de Mercado Pago de la empresa (HU67). */
  @Prop({ default: false })
  payOnline: boolean;

  @Prop({
    type: String,
    enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid'],
    default: 'draft',
    index: true,
  })
  status: QuoteStatus;

  /** Token del link público para verla, aceptarla o pagarla. */
  @Prop({ required: true, unique: true })
  publicToken: string;

  @Prop({ type: [String], default: [] })
  sentVia: string[];

  @Prop() sentAt?: Date;
  @Prop() viewedAt?: Date;
  @Prop() acceptedAt?: Date;
  @Prop() rejectedAt?: Date;
  @Prop() rejectReason?: string;
  @Prop() paidAt?: Date;
  @Prop() mpPaymentId?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);
QuoteSchema.index({ tenantId: 1, seq: 1 }, { unique: true });
