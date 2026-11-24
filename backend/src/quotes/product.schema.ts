import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Producto o servicio del catálogo de la empresa, para cotizar (HU68). */
@Schema({ timestamps: true, collection: 'products' })
export class Product extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  /** El precio ya incluye el IGV. */
  @Prop({ default: true })
  taxIncluded: boolean;

  @Prop({ default: 'unidad', trim: true })
  unit: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: String, enum: ['manual', 'woocommerce'], default: 'manual' })
  source: 'manual' | 'woocommerce';

  /** Id del producto en la tienda WooCommerce, para no duplicar al reimportar. */
  @Prop()
  externalId?: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ tenantId: 1, name: 1 });
ProductSchema.index(
  { tenantId: 1, source: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalId: { $type: 'string' } },
  },
);
