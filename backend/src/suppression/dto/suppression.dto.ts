import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SUPPRESSION_SOURCES } from '../suppression-entry.schema';

/** Alta manual en la lista de no contactar. */
export class CreateSuppressionDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsIn(SUPPRESSION_SOURCES)
  source?: (typeof SUPPRESSION_SOURCES)[number];
}
