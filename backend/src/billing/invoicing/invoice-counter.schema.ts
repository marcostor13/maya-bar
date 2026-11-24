import { Schema } from 'mongoose';

/** Correlativo por serie de comprobante (HU49): `_id` = serie, p. ej. F001. */
export interface InvoiceCounter {
  _id: string;
  seq: number;
}

export const InvoiceCounter = { name: 'InvoiceCounter' } as const;

export const InvoiceCounterSchema = new Schema<InvoiceCounter>(
  { _id: { type: String }, seq: { type: Number, default: 0 } },
  { collection: 'invoice_counters', versionKey: false },
);
