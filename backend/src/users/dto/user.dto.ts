import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Locales a los que se limita. Vacío = todos los de la empresa. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  localIds?: string[];

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  role!: string;

  /** Internacional sin "+". Habilita los avisos por WhatsApp. */
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  localIds?: string[];

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Internacional sin "+". Habilita los avisos por WhatsApp. */
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ResetAccessDto {
  /**
   * `email`: código de recuperación por correo. `temp`: contraseña temporal.
   * `manual`: la contraseña que elige el administrador (HU19).
   */
  @IsIn(['email', 'temp', 'manual'])
  mode!: 'email' | 'temp' | 'manual';

  @ValidateIf((o: ResetAccessDto) => o.mode === 'manual')
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede pasar de 72 caracteres' })
  password?: string;

  /** Solo en `manual`: pedir que la cambie al entrar. Por defecto, sí. */
  @IsOptional()
  @IsBoolean()
  mustChange?: boolean;
}

export class TransferAdminDto {
  @IsMongoId()
  toUserId!: string;

  /** Rol que tendrá quien traspasa. */
  @IsString()
  @IsNotEmpty()
  newRole!: string;
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
