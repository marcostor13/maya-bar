import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LEAD_STAGE_KEYS } from '../../leads/lead-stages.catalog';
import { PROSPECT_STATUSES } from '../prospect.schema';

export class CreateSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6000)
  services: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  idealCustomer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(15)
  industries?: string[];

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  maxResults?: number;
}

export class CreateProspectDto {
  @IsOptional()
  @IsString()
  searchId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateProspectDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;

  @IsOptional()
  @IsIn(PROSPECT_STATUSES)
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ResearchProspectsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

export class GenerateMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

export class ConvertToCustomerDto {
  /** Persona de `research.people` a usar como contacto; sin ella, la empresa. */
  @IsOptional()
  @IsInt()
  @Min(0)
  personIndex?: number;
}

export class ConvertToLeadDto extends ConvertToCustomerDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsIn(LEAD_STAGE_KEYS)
  stage?: string;
}
