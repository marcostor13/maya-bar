import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const FIELD_TYPES = [
  'text',
  'email',
  'tel',
  'number',
  'textarea',
  'select',
  'checkbox',
  'date',
];

const MAP_TARGETS = ['name', 'email', 'phone', 'notes', ''];

export class FormFieldDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsIn(FIELD_TYPES)
  type: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsIn(MAP_TARGETS)
  mapTo?: string;
}

export class CreateFormDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  successMessage?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;
}

export class UpdateFormDto extends CreateFormDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  declare name: string;
}
