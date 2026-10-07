import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SaveResendConfigDto {
  @IsBoolean()
  enabled: boolean;

  /** Vacía o ausente = conservar la key que ya estaba guardada. */
  @IsOptional()
  @ValidateIf((o: SaveResendConfigDto) => !!o.apiKey)
  @IsString()
  @Matches(/^re_[A-Za-z0-9_-]{8,200}$/, {
    message: 'La API key de Resend empieza por "re_"',
  })
  apiKey?: string;

  @IsEmail({}, { message: 'El correo remitente no es válido' })
  @MaxLength(200)
  fromEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fromName?: string;

  @IsOptional()
  @ValidateIf((o: SaveResendConfigDto) => !!o.replyTo)
  @IsEmail({}, { message: 'El correo de respuesta no es válido' })
  @MaxLength(200)
  replyTo?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  ratePerMinute?: number;
}

export class TestResendDto {
  @IsEmail({}, { message: 'Escribe un correo válido para la prueba' })
  to: string;
}
