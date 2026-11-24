import {
  ArrayMaxSize,
  IsDateString,
  IsIn,
  Matches,
  Min,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MediaFileDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  size!: number;
}

/** Tipo de entrada (HU67). `sold` no se acepta: lo lleva el servidor. */
export class TicketTypeDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{1,30}$/)
  key?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsDateString()
  salesEndAt?: string | null;
}

export class FormFieldDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  localId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsString()
  @IsNotEmpty()
  date!: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaFileDto)
  mediaFiles?: MediaFileDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  formFields?: FormFieldDto[];

  @IsOptional()
  @IsObject()
  invitationDesign?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  onlinePayment?: boolean;

  @IsOptional()
  @IsIn(['PEN', 'USD'])
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TicketTypeDto)
  ticketTypes?: TicketTypeDto[];
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaFileDto)
  mediaFiles?: MediaFileDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  formFields?: FormFieldDto[];

  @IsOptional()
  @IsObject()
  invitationDesign?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  onlinePayment?: boolean;

  @IsOptional()
  @IsIn(['PEN', 'USD'])
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TicketTypeDto)
  ticketTypes?: TicketTypeDto[];
}

export class GenerateDesignDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsOptional()
  @IsArray()
  mediaFiles?: { name: string; url: string; mimeType: string }[];
}

export class SaveTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsObject()
  design!: Record<string, unknown>;
}

export class RegisterEventDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  partySize?: number;

  @IsOptional()
  @IsString()
  ref?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;
}

export class ShareEventDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sharedWith?: string[];

  @IsOptional()
  @IsBoolean()
  sharedWithAll?: boolean;
}

export class CheckInByCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class CreateExternalImpulsadorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class GenerateFromPromptDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaFileNames?: string[];
}
