export class CreateReservationDto {
  localId!: string;
  date!: string; // 'YYYY-MM-DD'
  turno!: string; // 'HH:MM'
  partySize!: number;
  guestName!: string;
  guestEmail!: string;
  guestPhone?: string;
  occasion?: string;
  notes?: string;
}

export class UpdateReservationStatusDto {
  status!: string;
  note?: string;
}

export class ReservationConfigDto {
  localId!: string;
  enabled!: boolean;
  turnos!: string[];
  defaultDuration!: number;
  maxPerTurno!: number;
  maxPartySize!: number;
  advanceBookingDays!: number;
  welcomeTitle?: string;
  welcomeMessage?: string;
  policy?: string;
}
