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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
