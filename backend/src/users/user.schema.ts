import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'MANAGER'
  | 'HOST'
  | 'SERVER'
  | 'KITCHEN'
  | 'BAR'
  | 'MARKETING'
  | 'IMPULSADOR';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  name?: string;

  @Prop({ default: 'SERVER' })
  role: UserRole;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Local', default: [] })
  localIds: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ sparse: true, index: true })
  referralCode?: string;

  @Prop()
  resetPasswordCode?: string;

  @Prop()
  resetPasswordExpires?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
