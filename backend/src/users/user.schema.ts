import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Roles del sistema. La empresa puede crear los suyos, así que `User.role` es
 * un `string`: esta unión sirve para escribir código contra los conocidos, no
 * para limitar lo que se puede guardar.
 */
export type SystemUserRole =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'MANAGER'
  | 'HOST'
  | 'SERVER'
  | 'KITCHEN'
  | 'BAR'
  | 'MARKETING'
  | 'IMPULSADOR';

/** Alias histórico; se conserva para no tocar los imports existentes. */
export type UserRole = string;

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  name?: string;

  @Prop({ default: 'SERVER' })
  role: string;

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
