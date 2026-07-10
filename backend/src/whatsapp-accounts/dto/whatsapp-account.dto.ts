import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWhatsAppAccountDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsIn(['waha', 'cloudapi'])
  provider: 'waha' | 'cloudapi';

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  wahaApiUrl?: string;

  @IsOptional()
  @IsString()
  wahaApiKey?: string;

  @IsOptional()
  @IsString()
  wahaSession?: string;

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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWhatsAppAccountDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['waha', 'cloudapi'])
  provider?: 'waha' | 'cloudapi';

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  wahaApiUrl?: string;

  @IsOptional()
  @IsString()
  wahaApiKey?: string;

  @IsOptional()
  @IsString()
  wahaSession?: string;

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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
