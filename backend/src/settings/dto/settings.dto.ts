import { IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveSettingsDto {
  @IsOptional()
  @IsString()
  whatsappProvider?: string;

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
  @IsNumber()
  waDailyLimit?: number;

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
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  deepseekApiKey?: string;

  @IsOptional()
  @IsString()
  geminiApiKey?: string;

  @IsOptional()
  @IsString()
  claudeApiKey?: string;
}
