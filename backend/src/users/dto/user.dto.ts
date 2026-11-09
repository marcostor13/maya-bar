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
  /** `email`: código de recuperación por correo. `temp`: contraseña temporal. */
  @IsIn(['email', 'temp'])
  mode!: 'email' | 'temp';
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
