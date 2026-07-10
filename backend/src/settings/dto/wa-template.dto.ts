import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWaTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsString()
  @IsNotEmpty()
  language: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footer?: string;
}
