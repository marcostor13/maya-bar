import { isValidRuc } from '../ruc';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Datos del comprobante electrónico (HU44, HU49). */
export class BillingInfoDto {
  @IsIn(['boleta', 'factura'])
  docType: 'boleta' | 'factura';

  /** DNI de 8 dígitos para boleta; RUC de 11 para factura (ver `docNumberError`). */
  @Matches(/^\d{8}(\d{3})?$/, {
    message: 'Escribe un DNI de 8 dígitos o un RUC de 11',
  })
  docNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'Escribe la razón social o el nombre' })
  @MaxLength(200)
  legalName: string;

  @ValidateIf((o: BillingInfoDto) => o.docType === 'factura')
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Correo de facturación no válido' })
  email?: string;
}

/** Coherencia tipo de comprobante ↔ documento; null si es válido. */
export function docNumberError(dto: BillingInfoDto): string | null {
  if (dto.docType === 'boleta' && !/^\d{8}$/.test(dto.docNumber))
    return 'Para boleta escribe el DNI de 8 dígitos';
  if (dto.docType === 'factura' && !isValidRuc(dto.docNumber))
    return 'El RUC no es válido: revisa los 11 dígitos';
  if (!dto.legalName?.trim()) return 'Escribe la razón social o el nombre';
  if (dto.docType === 'factura' && !dto.address?.trim())
    return 'Para factura escribe la dirección fiscal';
  return null;
}
