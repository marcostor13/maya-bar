import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // La contraseña del TENANT_ADMIN la genera el servidor; solo se recibe el nombre.
  @IsOptional()
  @IsString()
  ownerName?: string;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
