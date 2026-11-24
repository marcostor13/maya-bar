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

  /**
   * Teléfono en formato internacional sin "+". Lo usan los avisos por WhatsApp
   * (recordatorios de seguimiento); sin él solo llega el push.
   */
  @Prop({ trim: true })
  phone?: string;

  @Prop({ default: 'SERVER' })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Local', default: [] })
  localIds: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;

  /** Desactivado al bajar de plan (HU52): se reactiva solo al volver a subir. */
  @Prop()
  deactivatedByPlan?: boolean;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ sparse: true, index: true })
  referralCode?: string;

  /** Hash SHA-256 del código de recuperación, nunca el código en claro. */
  @Prop()
  resetPasswordCode?: string;

  /** Intentos fallidos con el código de recuperación vigente. */
  @Prop()
  resetPasswordAttempts?: number;

  @Prop()
  resetPasswordExpires?: Date;

  /**
   * Solo vale `false` en una cuenta creada por el registro público que aún no
   * confirmó su correo: esa no puede entrar. Las cuentas anteriores y las que
   * crea un administrador no tienen el campo y entran como siempre.
   */
  @Prop()
  emailVerified?: boolean;

  /**
   * Enlace de acceso de un solo uso tras pagar (HU47): hash SHA-256 del token
   * y vencimiento (72 h). Sin contraseña elegida aún, `accessPending` = true.
   */
  @Prop()
  accessTokenHash?: string;

  @Prop()
  accessTokenExpires?: Date;

  @Prop()
  accessPending?: boolean;

  /** Hash SHA-256 del código enviado; el código en claro solo va en el correo. */
  @Prop()
  emailVerificationCodeHash?: string;

  @Prop()
  emailVerificationExpires?: Date;

  /** Intentos fallidos con el código vigente; al llegar al tope se invalida. */
  @Prop()
  emailVerificationAttempts?: number;

  /**
   * Qué avisos push quiere recibir. Sin el campo (o sin una clave) el aviso
   * está activo: las cuentas existentes siguen recibiendo todo.
   */
  @Prop({ type: Object })
  pushPrefs?: PushPrefs;

  /** Último inicio o renovación de sesión. */
  @Prop({ type: Date })
  lastAccessAt?: Date;

  /** Los tokens de acceso emitidos antes de esta fecha ya no valen. */
  @Prop({ type: Date })
  sessionsValidFrom?: Date;

  /** Recibe oportunidades del reparto automático (HU59). Sin el campo: sí. */
  @Prop()
  available?: boolean;

  /** Horario en que recibe del reparto (hora de Lima). Sin el campo: siempre. */
  @Prop({ type: Object })
  availability?: { days?: number[]; from?: number; to?: number };

  /** Doble factor (HU62). El secreto va cifrado y los códigos de respaldo con hash. */
  @Prop({ type: Object })
  twoFactor?: TwoFactorState;

  /** Configuración a medias: secreto o código por correo aún sin confirmar. */
  @Prop({ type: Object })
  twoFactorPending?: TwoFactorPending;
}

export interface TwoFactorState {
  enabled: boolean;
  method: 'totp' | 'email';
  sealedSecret?: string;
  backupHashes: string[];
  enabledAt: Date;
  /** Último paso TOTP aceptado: el mismo código no sirve dos veces. */
  lastStep?: number;
  /** Código por correo vigente (método email). */
  emailCodeHash?: string;
  emailCodeExpires?: Date;
  emailCodeAttempts?: number;
}

export interface TwoFactorPending {
  method: 'totp' | 'email';
  sealedSecret?: string;
  emailCodeHash?: string;
  emailCodeExpires?: Date;
  attempts?: number;
  createdAt: Date;
}

/** Preferencias de notificaciones push de un usuario. */
export interface PushPrefs {
  chats?: boolean;
  forms?: boolean;
  leads?: boolean;
  recovery?: boolean;
  /** Llamadas de WhatsApp entrantes. */
  calls?: boolean;
  /** Silencia todo (salvo la notificación de prueba). */
  muted?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
