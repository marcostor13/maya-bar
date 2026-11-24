import { Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BillingInfoDto } from './billing-info.dto';

export const PERIOD_ALIASES: Record<
  string,
  'monthly' | 'quarterly' | 'annual'
> = {
  mensual: 'monthly',
  trimestral: 'quarterly',
  anual: 'annual',
  monthly: 'monthly',
  quarterly: 'quarterly',
  annual: 'annual',
};

export class CheckoutBuyerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail({}, { message: 'Correo no válido' })
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class CreateCheckoutDto {
  @IsIn(['inicia', 'crece', 'escala'], {
    message: 'Plan no disponible para compra en línea',
  })
  plan: 'inicia' | 'crece' | 'escala';

  @IsIn(Object.keys(PERIOD_ALIASES))
  period: string;

  @IsIn(['PEN', 'USD'])
  currency: 'PEN' | 'USD';

  @ValidateNested()
  @Type(() => CheckoutBuyerDto)
  buyer: CheckoutBuyerDto;

  @ValidateNested()
  @Type(() => BillingInfoDto)
  billing: BillingInfoDto;

  @Equals(true, { message: 'Acepta los términos del servicio para continuar' })
  acceptTerms: boolean;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  /** Implementación contratada (HU55). */
  @IsOptional()
  @IsIn(['puesta', 'pro'])
  setup?: 'puesta' | 'pro';

  /** Cupón (HU54). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  coupon?: string;
}
