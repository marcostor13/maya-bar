import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_WORKING_HOURS,
  isValidHours,
  isValidTimeZone,
  type SlotRules,
  type WorkingHours,
} from '../../calendar/availability';

/** Configuración de agendamiento de un agente IA (subdocumento `calendar`). */
export interface AgentCalendarConfig {
  enabled: boolean;
  /** Calendario de la empresa; sin él, el predeterminado. */
  connectionId?: string;
  durationMinutes: number;
  timeZone: string;
  hours: WorkingHours[];
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  /** Crear Meet / Teams con la cita. */
  video: boolean;
  /** Título del evento: "<título> – <nombre del cliente>". */
  title: string;
  /** Criterios propios: qué tipo de cita, qué preguntar antes, etc. */
  instructions?: string;
}

export const DEFAULT_AGENT_CALENDAR: AgentCalendarConfig = {
  enabled: false,
  durationMinutes: 30,
  timeZone: 'America/Lima',
  hours: DEFAULT_WORKING_HOURS,
  bufferMinutes: 0,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  video: true,
  title: 'Cita',
};

/** Completa con los valores por defecto lo que falte (agentes antiguos). */
export function agentCalendar(
  cfg?: Partial<AgentCalendarConfig> | null,
): AgentCalendarConfig {
  const c = { ...DEFAULT_AGENT_CALENDAR, ...(cfg ?? {}) };
  return {
    ...c,
    hours: c.hours?.length ? c.hours : DEFAULT_WORKING_HOURS,
    connectionId: c.connectionId ? String(c.connectionId) : undefined,
  };
}

export function slotRules(c: AgentCalendarConfig): SlotRules {
  return {
    timeZone: c.timeZone,
    hours: c.hours,
    durationMinutes: c.durationMinutes,
    bufferMinutes: c.bufferMinutes,
    minNoticeHours: c.minNoticeHours,
    maxDaysAhead: c.maxDaysAhead,
  };
}

/** Valida lo que el DTO no puede: zona IANA y franjas coherentes. */
export function assertAgentCalendar(c: Partial<AgentCalendarConfig>): void {
  if (c.timeZone !== undefined && !isValidTimeZone(c.timeZone))
    throw new BadRequestException(`Zona horaria inválida: ${c.timeZone}`);
  const bad = (c.hours ?? []).find((h) => !isValidHours(h));
  if (bad)
    throw new BadRequestException(
      'Horario de atención inválido: cada franja necesita día 0-6 y hora de inicio menor que la de fin (HH:MM).',
    );
  if (c.enabled && c.hours && !c.hours.length)
    throw new BadRequestException(
      'Para agendar, define al menos una franja de atención.',
    );
}
