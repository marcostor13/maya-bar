import type { AiTool, AiToolCall } from '../../ai/ai.service';
import {
  bookingWindow,
  formatLocal,
  freeSlots,
  isSlotAllowed,
  localIso,
  parseLocalOrIso,
  zonedToUtc,
} from '../../calendar/availability';
import type {
  BusyResult,
  CalendarEventResult,
} from '../../calendar/calendar.service';
import type { CreateCalendarEventDto } from '../../calendar/dto/calendar.dto';
import { slotRules, type AgentCalendarConfig } from './agent-calendar';

/** Lo que la sesión necesita del calendario (CalendarService en producción). */
export interface CalendarPort {
  busy(
    tenantId: string,
    connectionId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<BusyResult>;
  createEvent(
    tenantId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventResult>;
}

/** Registro de citas (colección agent_bookings en producción). */
export interface BookingStore {
  findExisting(conversationId: string, start: Date): Promise<BookedCita | null>;
  countUpcoming(conversationId: string, now: Date): Promise<number>;
  /**
   * Reserva la cita ANTES de crear el evento (índice único conversación +
   * inicio): si otra respuesta simultánea ya la tomó, devuelve false.
   */
  claim(b: BookedCita & { conversationId: string }): Promise<boolean>;
  /** Completa la reserva con el evento creado. */
  confirm(conversationId: string, start: Date, b: BookedCita): Promise<void>;
  /** Libera la reserva si el evento no se pudo crear. */
  release(conversationId: string, start: Date): Promise<void>;
}

/** Cita agendada (o simulada en el playground) en esta respuesta. */
export interface BookedCita {
  start: Date;
  end: Date;
  title: string;
  contactName: string;
  attendeeEmail?: string;
  joinUrl?: string;
  htmlLink?: string;
  provider: string;
  eventId: string;
  connectionId?: string;
  simulated?: boolean;
}

export interface CalendarToolContext {
  tenantId: string;
  agentId: string;
  agentName: string;
  conversationId?: string;
  contactName?: string;
  contactEmail?: string;
  channel: string;
  /** Playground: consulta disponibilidad real pero no crea eventos. */
  simulate?: boolean;
  now?: () => Date;
}

export const CALENDAR_TOOL_NAMES = [
  'consultar_disponibilidad',
  'agendar_cita',
] as const;

const MAX_RANGE_DAYS = 14;
const MAX_SLOTS = 10;
/** Citas futuras por conversación: evita que un chat llene la agenda. */
const MAX_UPCOMING_PER_CONVERSATION = 2;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const AVAILABILITY_TOOL: AiTool = {
  name: 'consultar_disponibilidad',
  description:
    'Devuelve los horarios libres reales del calendario de la empresa para agendar una cita. Úsala siempre antes de proponer horarios. Sin fechas, busca desde hoy.',
  parameters: {
    type: 'object',
    properties: {
      desde: {
        type: 'string',
        description: 'Primer día a revisar, AAAA-MM-DD (hora local). Opcional.',
      },
      hasta: {
        type: 'string',
        description: `Último día a revisar, AAAA-MM-DD. Opcional; máximo ${MAX_RANGE_DAYS} días después de "desde".`,
      },
    },
  },
};

const BOOK_TOOL: AiTool = {
  name: 'agendar_cita',
  description:
    'Agenda la cita en el calendario de la empresa. Úsala solo cuando el cliente eligió un horario devuelto por consultar_disponibilidad y te dio su nombre.',
  parameters: {
    type: 'object',
    properties: {
      inicio: {
        type: 'string',
        description:
          'Inicio exacto tal como lo devolvió consultar_disponibilidad (campo "inicio", AAAA-MM-DDTHH:MM).',
      },
      nombre: { type: 'string', description: 'Nombre del cliente.' },
      correo: {
        type: 'string',
        description:
          'Correo del cliente para enviarle la invitación. Opcional; solo si lo dio.',
      },
      motivo: {
        type: 'string',
        description: 'Motivo o tema de la cita, en una frase.',
      },
    },
    required: ['inicio', 'nombre'],
  },
};

const clip = (v: unknown, max: number) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Herramientas de agenda para UNA respuesta del agente. Todo lo que propone el
 * modelo se vuelve a comprobar aquí: el texto del cliente nunca puede saltarse
 * el horario de atención ni ocupar un hueco ya tomado.
 */
export class CalendarToolSession {
  readonly tools: AiTool[] = [AVAILABILITY_TOOL, BOOK_TOOL];
  readonly bookings: BookedCita[] = [];

  constructor(
    private readonly calendar: CalendarPort,
    private readonly store: BookingStore,
    private readonly cfg: AgentCalendarConfig,
    private readonly ctx: CalendarToolContext,
  ) {}

  handles(name: string): boolean {
    return (CALENDAR_TOOL_NAMES as readonly string[]).includes(name);
  }

  private now(): Date {
    return this.ctx.now ? this.ctx.now() : new Date();
  }

  run = async (call: AiToolCall): Promise<unknown> => {
    try {
      if (call.name === 'consultar_disponibilidad')
        return await this.availability(call.input.desde, call.input.hasta);
      if (call.name === 'agendar_cita') return await this.book(call.input);
      return { error: `Herramienta desconocida: ${call.name}` };
    } catch (err) {
      // Errores del calendario (sin conexión, permiso, caída): el agente no
      // debe inventar horarios; se le pasa el mensaje para que ofrezca un asesor.
      return {
        error: err instanceof Error ? err.message : String(err),
        nota: 'No ofrezcas horarios: dile al cliente que un asesor le confirmará la cita.',
      };
    }
  };

  /** Inicio del día local `AAAA-MM-DD` en UTC. */
  private dayStart(value: unknown): Date | null {
    if (typeof value !== 'string' || !DATE.test(value.trim())) return null;
    const [y, m, d] = value.trim().split('-').map(Number);
    return zonedToUtc(y, m, d, 0, 0, this.cfg.timeZone);
  }

  private slotView(s: Date) {
    return {
      inicio: localIso(s, this.cfg.timeZone),
      texto: formatLocal(s, this.cfg.timeZone),
    };
  }

  private async slotsBetween(from: Date, to: Date, limit: number) {
    const rules = slotRules(this.cfg);
    const now = this.now();
    const win = bookingWindow(rules, now);
    const a = new Date(Math.max(from.getTime(), win.start.getTime()));
    const b = new Date(Math.min(to.getTime(), win.end.getTime()));
    if (a >= b) return [];
    const pad = rules.bufferMinutes * 60_000;
    const { busy } = await this.calendar.busy(
      this.ctx.tenantId,
      this.cfg.connectionId,
      new Date(a.getTime() - pad),
      new Date(b.getTime() + pad + rules.durationMinutes * 60_000),
    );
    return freeSlots(rules, busy, { start: a, end: b }, now, limit);
  }

  private async availability(desde: unknown, hasta: unknown) {
    const now = this.now();
    const from = this.dayStart(desde) ?? now;
    const maxTo = new Date(from.getTime() + MAX_RANGE_DAYS * 86_400_000);
    const askedTo = this.dayStart(hasta);
    const to = askedTo
      ? new Date(Math.min(askedTo.getTime() + 86_400_000, maxTo.getTime()))
      : new Date(from.getTime() + 7 * 86_400_000);
    if (to <= from) return { error: '"hasta" debe ser posterior a "desde".' };

    const slots = await this.slotsBetween(from, to, MAX_SLOTS);
    return {
      zona_horaria: this.cfg.timeZone,
      duracion_minutos: this.cfg.durationMinutes,
      horarios: slots.map((s) => this.slotView(s)),
      ...(slots.length
        ? {
            nota: 'Ofrece 2 o 3 opciones al cliente con el campo "texto". Al agendar usa el campo "inicio" exacto.',
          }
        : {
            nota: `No hay horarios libres en ese rango. Prueba otras fechas (se agenda hasta ${this.cfg.maxDaysAhead} días adelante).`,
          }),
    };
  }

  private async alternatives(near: Date) {
    const from = new Date(near.getTime() - 12 * 3_600_000);
    const to = new Date(near.getTime() + 3 * 86_400_000);
    const slots = await this.slotsBetween(from, to, 4);
    return slots.map((s) => this.slotView(s));
  }

  private async book(input: Record<string, unknown>) {
    const start = parseLocalOrIso(clip(input.inicio, 40), this.cfg.timeZone);
    if (!start)
      return {
        agendado: false,
        error:
          'Fecha de inicio inválida: usa el campo "inicio" de consultar_disponibilidad (AAAA-MM-DDTHH:MM).',
      };
    const nombre = clip(input.nombre, 120) || clip(this.ctx.contactName, 120);
    if (!nombre)
      return {
        agendado: false,
        error: 'Pide el nombre del cliente antes de agendar.',
      };
    const rawEmail = clip(input.correo, 200).toLowerCase();
    if (rawEmail && !EMAIL.test(rawEmail))
      return {
        agendado: false,
        error:
          'El correo no es válido: pídeselo de nuevo al cliente o agenda sin correo.',
      };
    const correo =
      rawEmail || this.ctx.contactEmail?.toLowerCase() || undefined;
    const motivo = clip(input.motivo, 300);

    const convId = this.ctx.conversationId;
    if (convId) {
      const existing = await this.store.findExisting(convId, start);
      if (existing) return this.confirmation(existing, true);
      if (
        (await this.store.countUpcoming(convId, this.now())) >=
        MAX_UPCOMING_PER_CONVERSATION
      )
        return {
          agendado: false,
          error:
            'Este cliente ya tiene citas pendientes. Para cambiar o agregar otra, deriva la conversación a un asesor.',
        };
    }
    if (this.bookings.length)
      return {
        agendado: false,
        error: 'Ya agendaste una cita en esta respuesta.',
      };

    // Se vuelve a leer el calendario: el hueco pudo ocuparse desde la consulta.
    const rules = slotRules(this.cfg);
    const end = new Date(start.getTime() + rules.durationMinutes * 60_000);
    const pad = rules.bufferMinutes * 60_000;
    const { busy, connectionId, provider } = await this.calendar.busy(
      this.ctx.tenantId,
      this.cfg.connectionId,
      new Date(start.getTime() - pad),
      new Date(end.getTime() + pad),
    );
    if (!isSlotAllowed(start, rules, busy, this.now()))
      return {
        agendado: false,
        motivo:
          'Ese horario ya no está disponible o está fuera del horario de atención.',
        alternativas: await this.alternatives(start),
      };

    const title = `${this.cfg.title || 'Cita'} – ${nombre}`.slice(0, 200);
    if (this.ctx.simulate) {
      const sim: BookedCita = {
        start,
        end,
        title,
        contactName: nombre,
        attendeeEmail: correo,
        provider,
        eventId: 'simulado',
        connectionId,
        simulated: true,
      };
      this.bookings.push(sim);
      return { ...this.confirmation(sim, false), simulado: true };
    }

    const description = [
      motivo && `Motivo: ${motivo}`,
      `Cliente: ${nombre}${correo ? ` <${correo}>` : ''}`,
      `Agendado por el agente IA "${this.ctx.agentName}" desde ${this.ctx.channel}.`,
    ]
      .filter(Boolean)
      .join('\n');
    const draft: BookedCita = {
      start,
      end,
      title,
      contactName: nombre,
      attendeeEmail: correo,
      provider,
      eventId: '',
      connectionId,
    };
    if (
      convId &&
      !(await this.store.claim({ ...draft, conversationId: convId }))
    )
      return {
        agendado: false,
        error:
          'Esta cita ya se está agendando en otra respuesta: no la repitas; confirma al cliente que queda agendada.',
      };
    let ev: CalendarEventResult;
    try {
      ev = await this.calendar.createEvent(this.ctx.tenantId, {
        title,
        description,
        start: start.toISOString(),
        durationMinutes: rules.durationMinutes,
        attendees: correo ? [correo] : [],
        connectionId,
        timeZone: this.cfg.timeZone,
        video: this.cfg.video,
      });
    } catch (err) {
      if (convId) await this.store.release(convId, start);
      throw err;
    }
    const cita: BookedCita = {
      start,
      end,
      title,
      contactName: nombre,
      attendeeEmail: correo,
      joinUrl: ev.joinUrl,
      htmlLink: ev.htmlLink,
      provider: ev.provider,
      eventId: ev.eventId,
      connectionId,
    };
    if (convId) await this.store.confirm(convId, start, cita);
    this.bookings.push(cita);
    return this.confirmation(cita, false);
  }

  private confirmation(c: BookedCita, repeated: boolean) {
    return {
      agendado: true,
      ...(repeated
        ? { nota: 'Esta cita ya estaba agendada; no se duplicó.' }
        : {}),
      inicio: localIso(c.start, this.cfg.timeZone),
      texto: formatLocal(c.start, this.cfg.timeZone),
      duracion_minutos: Math.round(
        (c.end.getTime() - c.start.getTime()) / 60_000,
      ),
      zona_horaria: this.cfg.timeZone,
      ...(c.joinUrl ? { enlace_videollamada: c.joinUrl } : {}),
      invitacion_por_correo: !!c.attendeeEmail,
    };
  }
}
