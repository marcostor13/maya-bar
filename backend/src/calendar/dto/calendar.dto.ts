import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Reunión con videollamada (Meet o Teams) en el calendario conectado. */
export class CreateCalendarEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  /** Inicio en ISO 8601, idealmente con offset (`2026-10-01T15:00:00-05:00`). */
  @IsISO8601({ strict: true })
  start: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  attendees?: string[];

  /** Sin él se usa el calendario predeterminado de la empresa. */
  @IsOptional() @IsMongoId() connectionId?: string;

  /** Zona IANA (p. ej. `America/Lima`) con la que se muestra el evento. */
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
}
