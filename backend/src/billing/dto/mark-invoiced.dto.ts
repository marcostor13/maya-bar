import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Pago facturado a mano (HU75): serie y número del comprobante, opcional. */
export class MarkInvoicedDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;
}
