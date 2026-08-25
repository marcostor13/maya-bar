import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  localId!: string;

  @IsString()
  @IsNotEmpty()
  date!: string; // 'YYYY-MM-DD'

  @IsString()
  @IsNotEmpty()
  turno!: string; // 'HH:MM'

  @IsNumber()
  partySize!: number;

  @IsString()
  @IsNotEmpty()
  guestName!: string;

  @IsEmail()
  guestEmail!: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReservationStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReservationConfigDto {
  @IsString()
  @IsNotEmpty()
  localId!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @IsString({ each: true })
  turnos!: string[];

  @IsNumber()
  defaultDuration!: number;

  @IsNumber()
  maxPerTurno!: number;

  @IsNumber()
  maxPartySize!: number;

  @IsNumber()
  advanceBookingDays!: number;

  @IsOptional()
  @IsString()
  welcomeTitle?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  policy?: string;
}
