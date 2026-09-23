import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INCOMING_PROTOCOLS } from '../email-account.schema';

/** Alta manual: cualquier servidor con IMAP o POP3 para recibir y SMTP para enviar. */
export class CreateEmailAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @IsEmail()
  email: string;

  @IsOptional() @IsString() @MaxLength(120) fromName?: string;
  @IsOptional() @IsString() @MaxLength(2000) signature?: string;

  @IsIn(INCOMING_PROTOCOLS)
  incomingProtocol: 'imap' | 'pop3';

  @IsString() @IsNotEmpty() incomingHost: string;
  @IsInt() @Min(1) @Max(65535) incomingPort: number;
  @IsBoolean() incomingSecure: boolean;

  @IsString() @IsNotEmpty() smtpHost: string;
  @IsInt() @Min(1) @Max(65535) smtpPort: number;
  @IsBoolean() smtpSecure: boolean;

  /** Por defecto, la propia dirección. */
  @IsOptional() @IsString() username?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional() @IsBoolean() skipBulk?: boolean;
}

export class UpdateEmailAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(120) fromName?: string;
  @IsOptional() @IsString() @MaxLength(2000) signature?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() skipBulk?: boolean;

  // Solo cuentas manuales: las de Gmail/Outlook se reconectan con OAuth.
  @IsOptional() @IsIn(INCOMING_PROTOCOLS) incomingProtocol?: 'imap' | 'pop3';
  @IsOptional() @IsString() @IsNotEmpty() incomingHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) incomingPort?: number;
  @IsOptional() @IsBoolean() incomingSecure?: boolean;
  @IsOptional() @IsString() @IsNotEmpty() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() username?: string;
  /** Solo si se quiere cambiar. */
  @IsOptional() @IsString() @IsNotEmpty() password?: string;
}
