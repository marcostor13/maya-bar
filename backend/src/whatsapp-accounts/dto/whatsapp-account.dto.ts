import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateWhatsAppAccountDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsIn(['cloudapi'])
  provider: 'cloudapi';

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  waPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  waAccessToken?: string;

  @IsOptional()
  @IsString()
  waBusinessAccountId?: string;

  @IsOptional()
  @IsString()
  waVerifyToken?: string;

  /** App Secret de la app de Meta, para verificar la firma de los webhooks. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  waAppSecret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWhatsAppAccountDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['cloudapi'])
  provider?: 'cloudapi';

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  waPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  waAccessToken?: string;

  @IsOptional()
  @IsString()
  waBusinessAccountId?: string;

  @IsOptional()
  @IsString()
  waVerifyToken?: string;

  /** App Secret de la app de Meta, para verificar la firma de los webhooks. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  waAppSecret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
