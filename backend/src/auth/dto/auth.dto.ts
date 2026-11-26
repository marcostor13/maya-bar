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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

/** Origen del registro (HU84): primer toque de UTM y de Meta, y el consentimiento. */
export class AcquisitionDto {
  @IsOptional() @IsString() @MaxLength(200) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(200) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(200) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(200) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(200) utmTerm?: string;
  @IsOptional() @IsString() @MaxLength(500) fbclid?: string;
  @IsOptional() @IsString() @MaxLength(600) fbc?: string;
  @IsOptional() @IsString() @MaxLength(200) fbp?: string;
  @IsOptional() @IsString() @MaxLength(300) landingPath?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
  @IsBoolean() consent!: boolean;
}

export class RegisterTenantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;

  /** Token del widget de Cloudflare Turnstile. */
  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcquisitionDto)
  acquisition?: AcquisitionDto;
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
