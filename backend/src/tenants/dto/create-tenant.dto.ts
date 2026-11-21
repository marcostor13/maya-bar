import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // La contraseña del TENANT_ADMIN la genera el servidor; solo se recibe el nombre.
  @IsOptional()
  @IsString()
  ownerName?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsIn(['starter', 'pro', 'enterprise'])
  plan?: 'starter' | 'pro' | 'enterprise';

  /** Fecha ISO, o `null` para quitarla. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  planExpiresAt?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  trialEndsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Logo y favicon de la empresa (HU26). `null` o '' los quita. Solo https: la
 * URL acaba en un `src`/`href` de la landing pública.
 */
export class UpdateBrandingDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  logo?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  favicon?: string | null;
}

/** Confirmación de borrado: el nombre exacto de la empresa (HU16). */
export class DeleteTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmName?: string;
}

/** Recuperar la cuenta del usuario principal (HU17). */
export class RecoverOwnerDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  /** Correo nuevo de acceso; vacío conserva el actual. */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(['email', 'temp'])
  mode: 'email' | 'temp';
}

/** Nombrar administrador: un usuario existente o uno nuevo (HU17). */
export class AssignOwnerDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @ValidateIf((o: AssignOwnerDto) => !o.userId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ValidateIf((o: AssignOwnerDto) => !o.userId)
  @IsEmail()
  email?: string;
}
