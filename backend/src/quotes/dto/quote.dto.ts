import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ImportWooDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  storeUrl: string;
}

export class QuoteItemDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsNumber()
  @Min(0.0001)
  @Max(1_000_000)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;
}

export class QuoteDto {
  @IsMongoId()
  leadId: string;

  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items: QuoteItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  igvRate?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  payOnline?: boolean;
}

export class SendQuoteDto {
  @IsIn(['whatsapp', 'email'])
  channel: 'whatsapp' | 'email';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class RejectQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
