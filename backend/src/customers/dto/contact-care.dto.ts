import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CONTACT_ACTIVITY_TYPES } from '../contact-activity.schema';

export class AssignContactDto {
  @IsMongoId()
  toUserId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReleaseContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BulkAssignDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsMongoId({ each: true })
  customerIds: string[];

  /** Vacío o ausente = dejar sin responsable. */
  @IsOptional()
  @IsString()
  toUserId?: string;
}

export class BulkTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsMongoId({ each: true })
  customerIds: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  remove?: string[];
}

export class CreateContactActivityDto {
  @IsIn(CONTACT_ACTIVITY_TYPES as readonly string[])
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsDateString()
  at?: string;

  @IsOptional()
  @IsMongoId()
  conversationId?: string;
}

export class UpdateContactActivityDto {
  @IsOptional()
  @IsIn(CONTACT_ACTIVITY_TYPES as readonly string[])
  type?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsDateString()
  at?: string;
}
