import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateWidgetDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  greeting?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'El color debe ser hexadecimal (#RRGGBB)',
  })
  color?: string;

  @IsOptional()
  @IsBoolean()
  askContact?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappNumber?: string;

  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  allowedDomains?: string[];

  /** `null` quita el agente: atiende solo el equipo. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsMongoId()
  agentId?: string | null;
}

export class WebSessionDto {
  @IsOptional()
  @Matches(/^v[a-f0-9]{24}$/)
  visitorId?: string;
}

export class WebMessageDto {
  @IsString()
  @MaxLength(200)
  token: string;

  @IsString()
  @MaxLength(2000)
  text: string;

  /** Trampa para bots: un humano nunca la llena. */
  @IsOptional()
  @IsString()
  website?: string;
}

export class WebContactDto {
  @IsString()
  @MaxLength(200)
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;
}
