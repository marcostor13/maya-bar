import { BadRequestException } from '@nestjs/common';
import { DEFAULT_AGENT_CALENDAR } from './agent-calendar';
import {
  CalendarToolSession,
  type BookedCita,
  type CalendarToolContext,
} from './calendar-tools';

// Lunes 9 de noviembre de 2026, 08:00 en Lima (UTC-5).
const NOW = new Date('2026-11-09T13:00:00Z');
const cfg = { ...DEFAULT_AGENT_CALENDAR, enabled: true };

function setup(
  over: {
    busy?: { start: Date; end: Date }[];
    ctx?: Partial<CalendarToolContext>;
    existing?: BookedCita | null;
    upcoming?: number;
    busyError?: Error;
    claimed?: boolean;
    createError?: Error;
  } = {},
) {
  const calendar = {
    busy: jest.fn(() =>
      over.busyError
        ? Promise.reject(over.busyError)
        : Promise.resolve({
            provider: 'google' as const,
            connectionId: 'conn-1',
            connectionEmail: 'agenda@acme.pe',
            busy: over.busy ?? [],
          }),
    ),
    createEvent: jest.fn(() =>
      over.createError
        ? Promise.reject(over.createError)
        : Promise.resolve({
            provider: 'google' as const,
            eventId: 'ev-1',
            htmlLink: 'https://calendar.google.com/e/1',
            joinUrl: 'https://meet.google.com/abc',
            start: '',
            end: '',
            connectionEmail: 'agenda@acme.pe',
          }),
    ),
  };
  const store = {
    findExisting: jest.fn(() => Promise.resolve(over.existing ?? null)),
    countUpcoming: jest.fn(() => Promise.resolve(over.upcoming ?? 0)),
    claim: jest.fn(() => Promise.resolve(over.claimed ?? true)),
    confirm: jest.fn(() => Promise.resolve()),
    release: jest.fn(() => Promise.resolve()),
  };
  const session = new CalendarToolSession(calendar, store, cfg, {
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    agentName: 'Sofía',
    conversationId: 'conv-1',
    contactName: 'Ana',
    channel: 'whatsapp',
    now: () => NOW,
    ...over.ctx,
  });
  return { session, calendar, store };
}

const run = (s: CalendarToolSession, name: string, input = {}) =>
  s.run({ name, input }) as Promise<Record<string, any>>;

describe('CalendarToolSession', () => {
  it('ofrece las dos herramientas y solo responde a las suyas', () => {
    const { session } = setup();
    expect(session.tools.map((t) => t.name)).toEqual([
      'consultar_disponibilidad',
      'agendar_cita',
    ]);
    expect(session.handles('agendar_cita')).toBe(true);
    expect(session.handles('buscar_producto')).toBe(false);
  });

  it('consulta horarios libres reales dentro del horario y sin lo ocupado', async () => {
    const { session, calendar } = setup({
      busy: [
        {
          start: new Date('2026-11-09T15:00:00Z'), // 10:00-11:00 Lima
          end: new Date('2026-11-09T16:00:00Z'),
        },
      ],
    });
    const res = await run(session, 'consultar_disponibilidad', {
      desde: '2026-11-09',
      hasta: '2026-11-09',
    });
    expect(calendar.busy).toHaveBeenCalledWith(
      'tenant-1',
      undefined,
      expect.any(Date),
      expect.any(Date),
    );
    const inicios = res.horarios.map((h: { inicio: string }) => h.inicio);
    // Antelación de 2 h → desde las 10:00; 10:00-11:00 ocupado.
    expect(inicios.slice(0, 3)).toEqual([
      '2026-11-09T11:00',
      '2026-11-09T11:30',
      '2026-11-09T12:00',
    ]);
    expect(res.zona_horaria).toBe('America/Lima');
    expect(res.horarios[0].texto).toMatch(/lunes/);
  });

  it('agenda un horario libre: crea el evento con invitado y Meet y lo registra', async () => {
    const { session, calendar, store } = setup();
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana Pérez',
      correo: 'Ana@Cliente.pe',
      motivo: 'Demo del CRM',
    });
    expect(res).toMatchObject({
      agendado: true,
      inicio: '2026-11-10T15:00',
      enlace_videollamada: 'https://meet.google.com/abc',
      invitacion_por_correo: true,
    });
    expect(calendar.createEvent).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        title: 'Cita – Ana Pérez',
        start: '2026-11-10T20:00:00.000Z',
        durationMinutes: 30,
        attendees: ['ana@cliente.pe'],
        connectionId: 'conn-1',
        timeZone: 'America/Lima',
        video: true,
      }),
    );
    expect(store.claim).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', eventId: '' }),
    );
    expect(store.confirm).toHaveBeenCalledWith(
      'conv-1',
      new Date('2026-11-10T20:00:00.000Z'),
      expect.objectContaining({ eventId: 'ev-1' }),
    );
    expect(session.bookings).toHaveLength(1);
  });

  it('no agenda un horario ocupado y devuelve alternativas', async () => {
    const { session, calendar } = setup({
      busy: [
        {
          start: new Date('2026-11-10T20:00:00Z'),
          end: new Date('2026-11-10T21:00:00Z'),
        },
      ],
    });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res.agendado).toBe(false);
    expect(res.alternativas.length).toBeGreaterThan(0);
    expect(
      res.alternativas.map((a: { inicio: string }) => a.inicio),
    ).not.toContain('2026-11-10T15:00');
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('no agenda fuera del horario de atención aunque el cliente insista', async () => {
    const { session, calendar } = setup();
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-14T23:00', // sábado de noche
      nombre: 'Ana',
    });
    expect(res.agendado).toBe(false);
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('no duplica la cita si ya estaba agendada en la conversación', async () => {
    const existing: BookedCita = {
      start: new Date('2026-11-10T20:00:00Z'),
      end: new Date('2026-11-10T20:30:00Z'),
      title: 'Cita – Ana',
      contactName: 'Ana',
      provider: 'google',
      eventId: 'ev-0',
    };
    const { session, calendar } = setup({ existing });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res).toMatchObject({ agendado: true, inicio: '2026-11-10T15:00' });
    expect(res.nota).toMatch(/no se duplicó/);
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(session.bookings).toHaveLength(0);
  });

  it('si otra respuesta simultánea ya reservó la cita, no crea otro evento', async () => {
    const { session, calendar } = setup({ claimed: false });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res.agendado).toBe(false);
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(session.bookings).toHaveLength(0);
  });

  it('si el proveedor falla al crear, libera la reserva', async () => {
    const { session, store } = setup({
      createError: new Error('Google caído'),
    });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res.error).toMatch(/Google caído/);
    expect(store.release).toHaveBeenCalledWith(
      'conv-1',
      new Date('2026-11-10T20:00:00.000Z'),
    );
  });

  it('limita las citas pendientes por conversación', async () => {
    const { session, calendar } = setup({ upcoming: 2 });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res.agendado).toBe(false);
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('en el playground simula: consulta real pero no crea eventos', async () => {
    const { session, calendar, store } = setup({ ctx: { simulate: true } });
    const res = await run(session, 'agendar_cita', {
      inicio: '2026-11-10T15:00',
      nombre: 'Ana',
    });
    expect(res).toMatchObject({ agendado: true, simulado: true });
    expect(calendar.busy).toHaveBeenCalled();
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(session.bookings[0].simulated).toBe(true);
  });

  it('valida los argumentos del modelo', async () => {
    const { session, calendar } = setup({ ctx: { contactName: '' } });
    expect(
      (await run(session, 'agendar_cita', { inicio: 'mañana', nombre: 'A' }))
        .error,
    ).toMatch(/inválida/);
    expect(
      (await run(session, 'agendar_cita', { inicio: '2026-11-10T15:00' }))
        .error,
    ).toMatch(/nombre/);
    expect(
      (
        await run(session, 'agendar_cita', {
          inicio: '2026-11-10T15:00',
          nombre: 'Ana',
          correo: 'no-es-correo',
        })
      ).error,
    ).toMatch(/correo/);
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('si el calendario falla, devuelve un error y no horarios', async () => {
    const { session } = setup({
      busyError: new BadRequestException(
        'No hay ningún calendario conectado. Conecta Google Calendar o Microsoft 365 en Configuración.',
      ),
    });
    const res = await run(session, 'consultar_disponibilidad');
    expect(res.error).toMatch(/No hay ningún calendario/);
    expect(res.horarios).toBeUndefined();
  });
});
