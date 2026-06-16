import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const ORDER_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'served',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ['dine-in', 'delivery', 'takeaway'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export interface OrderLineItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  stations: string[];
  subtotal: number;
}

export interface StatusEntry {
  status: OrderStatus;
  at: Date;
}

@Schema({ timestamps: true })
export class Order extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Local', required: true, index: true })
  localId: Types.ObjectId;

  @Prop({ required: true })
  tableNumber: string;

  @Prop({ type: String, default: 'dine-in', enum: ORDER_TYPES })
  type: OrderType;

  @Prop({ type: String, default: 'pending', enum: ORDER_STATUSES, index: true })
  status: OrderStatus;

  @Prop({ type: [Object], required: true })
  items: OrderLineItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop()
  notes?: string;

  @Prop()
  guestName?: string;

  @Prop({ type: [Object], default: [] })
  statusHistory: StatusEntry[];

  @Prop({ default: false })
  callWaiter: boolean;

  @Prop({ default: false })
  callBill: boolean;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
