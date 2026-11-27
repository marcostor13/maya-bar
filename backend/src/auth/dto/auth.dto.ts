import {
  IsMongoId,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** "Recordar este dispositivo" (HU62): salta el segundo factor 30 días. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deviceToken?: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\s*\d{6}\s*$/, { message: 'El código tiene 6 dígitos' })
  code!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

/** Cambio de sub-cuenta de un usuario de agencia (HU72). */
export class SwitchTenantDto {
  @IsMongoId()
  tenantId!: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/** Canje del enlace de acceso tras pagar (HU47). */
export class RedeemAccessDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

/** Segundo factor durante el login (HU62). */
export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  challengeToken!: string;

  /** Código de 6 dígitos (app o correo) o código de respaldo. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;
}

export class TwoFactorChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  challengeToken!: string;
}

export class TwoFactorSetupStartDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  challengeToken?: string;

  @IsIn(['totp', 'email'])
  method!: 'totp' | 'email';
}

export class TwoFactorSetupConfirmDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  challengeToken?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;
}

export class TwoFactorPasswordDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class TwoFactorPolicyDto {
  @IsBoolean()
  required!: boolean;
}
