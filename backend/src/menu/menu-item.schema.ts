import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface VariantOption {
  label: string;
  priceModifier: number;
}

export interface Variant {
  name: string;
  options: VariantOption[];
}

export interface ModifierOption {
  label: string;
  price: number;
}

export interface Modifier {
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
}

export type Station = 'kitchen' | 'bar' | 'desserts';

export const ALLERGENS = [
  'gluten',
  'dairy',
  'nuts',
  'eggs',
  'soy',
  'shellfish',
  'fish',
  'peanuts',
] as const;
export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'spicy',
  'sugar-free',
] as const;

@Schema({ timestamps: true })
export class MenuItem extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Local', required: true, index: true })
  localId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'MenuCategory',
    required: true,
    index: true,
  })
  categoryId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [Object], default: [] })
  variants: Variant[];

  @Prop({ type: [Object], default: [] })
  modifiers: Modifier[];

  @Prop({ type: [String], default: [] })
  allergens: string[];

  @Prop({ type: [String], default: [] })
  dietaryTags: string[];

  // HU-2.6: Ruteo a estación
  @Prop({ type: [String], default: ['kitchen'] })
  stations: Station[];

  // HU-2.3: Sistema 86
  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);
