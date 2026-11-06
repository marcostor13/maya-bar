import { IsOptional, IsString } from 'class-validator';

export class SaveSettingsDto {
  @IsOptional()
  @IsString()
  whatsappProvider?: string;

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

  @IsOptional()
  @IsString()
  googlePlacesApiKey?: string;

  @IsOptional()
  @IsString()
  pageSpeedApiKey?: string;

  @IsOptional()
  @IsString()
  serperApiKey?: string;

  @IsOptional()
  @IsString()
  hunterApiKey?: string;
}
