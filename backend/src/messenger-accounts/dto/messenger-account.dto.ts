import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMessengerAccountDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @IsString()
  pageAccessToken?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMessengerAccountDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @IsString()
  pageAccessToken?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
