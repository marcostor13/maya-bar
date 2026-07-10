import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import type { LocalType, BusinessHours } from '../local.schema';

export class CreateLocalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsIn(['restaurant', 'bar', 'cafe', 'cafeteria', 'fastfood'])
  type?: LocalType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsArray()
  hours?: BusinessHours[];

  @IsOptional()
  @IsNumber()
  tableCount?: number;

  @IsOptional()
  @IsString()
  tenantId?: string; // usado por SUPERADMIN para asignar tenant
}

export class UpdateLocalDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['restaurant', 'bar', 'cafe', 'cafeteria', 'fastfood'])
  type?: LocalType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsArray()
  hours?: BusinessHours[];

  @IsOptional()
  @IsNumber()
  tableCount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
