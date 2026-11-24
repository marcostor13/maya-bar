import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CouponDocument = HydratedDocument<Coupon>;

/** Cupón de descuento (HU54). `used` cuenta reservas vivas y canjes. */
@Schema({ collection: 'coupons', timestamps: true })
export class Coupon {
  /** En mayúsculas, sin espacios. */
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true, enum: ['percent', 'fixed'] })
  type: 'percent' | 'fixed';

  /** Porcentaje (1–100) o monto fijo sin IGV en la moneda del cobro. */
  @Prop({ required: true })
  value: number;

  /** Monto fijo: moneda en que vale. */
  @Prop()
  currency?: 'PEN' | 'USD';

  /** Vacío = todos. */
  @Prop({ type: [String], default: [] })
  plans: string[];

  @Prop({ type: [String], default: [] })
  periods: string[];

  @Prop({ required: true, enum: ['once', 'months', 'forever'] })
  duration: 'once' | 'months' | 'forever';

  @Prop()
  durationMonths?: number;

  /** Sin tope si no se indica. */
  @Prop()
  maxUses?: number;

  @Prop({ default: 0 })
  used: number;

  @Prop()
  validFrom?: Date;

  @Prop()
  validUntil?: Date;

  @Prop({ default: true })
  active: boolean;

  /** Texto público (landing, checkout). */
  @Prop()
  label?: string;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
