import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  name?: string;

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
