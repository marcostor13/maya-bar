import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SMS_BODY_TYPES } from '../sms-config.schema';

export class SmsHeaderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @IsString()
  @MaxLength(1000)
  value: string;
}

export class SmsSecretDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,39}$/i, {
    message: 'El nombre del secreto solo admite letras, números y guion bajo',
  })
  name: string;

  /** Vacío o ausente = conservar el valor que ya estaba guardado. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string;
}

export class SaveSmsConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @MaxLength(60)
  name: string;

  @IsString()
  @MaxLength(1000)
  url: string;

  @IsIn(['POST', 'GET', 'PUT'])
  method: 'POST' | 'GET' | 'PUT';

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SmsHeaderDto)
  headers: SmsHeaderDto[];

  @IsIn(SMS_BODY_TYPES as readonly string[])
  bodyType: string;

  @IsString()
  @MaxLength(4000)
  body: string;

  @IsString()
  @MaxLength(40)
  from: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SmsSecretDto)
  secrets: SmsSecretDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  successPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  successValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idPath?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}$/, { message: 'Código de país inválido' })
  defaultCountryCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  ratePerMinute?: number;
}

export class TestSmsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  to: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  message: string;
}
