import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Alta y edición de cupones desde superadmin (HU54). */
export class CouponDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
    message: 'El código usa de 3 a 30 letras, números, - o _',
  })
  code: string;

  @IsIn(['percent', 'fixed'])
  type: 'percent' | 'fixed';

  @IsNumber()
  @Min(0.01)
  value: number;

  @IsOptional()
  @IsIn(['PEN', 'USD'])
  currency?: 'PEN' | 'USD';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['inicia', 'crece', 'escala'], { each: true })
  plans?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['monthly', 'quarterly', 'annual'], { each: true })
  periods?: string[];

  @IsIn(['once', 'months', 'forever'])
  duration: 'once' | 'months' | 'forever';

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

/** El código no se cambia: ya puede estar en suscripciones y comprobantes. */
export class UpdateCouponDto extends PartialType(
  OmitType(CouponDto, ['code'] as const),
) {}
