import {
  DEFAULT_WORKING_HOURS,
  freeSlots,
  isSlotAllowed,
  isValidHours,
  isValidTimeZone,
  localIso,
  parseLocalOrIso,
  zonedToUtc,
  type SlotRules,
} from './availability';

const LIMA = 'America/Lima'; // UTC-5, sin horario de verano

const rules = (over: Partial<SlotRules> = {}): SlotRules => ({
  timeZone: LIMA,
  hours: DEFAULT_WORKING_HOURS,
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  ...over,
});

// Lunes 9 de noviembre de 2026, 08:00 en Lima (13:00 UTC).
const NOW = new Date('2026-11-09T13:00:00Z');

describe('availability', () => {
  it('convierte hora local a UTC, también con horario de verano', () => {
    expect(zonedToUtc(2026, 11, 9, 9, 0, LIMA).toISOString()).toBe(
      '2026-11-09T14:00:00.000Z',
    );
    // Madrid: verano UTC+2 (julio) e invierno UTC+1 (enero).
    expect(zonedToUtc(2026, 7, 1, 10, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-07-01T08:00:00.000Z',
    );
    expect(zonedToUtc(2026, 1, 15, 10, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-01-15T09:00:00.000Z',
    );
  });

  it('interpreta la hora sin zona como hora local del agente', () => {
    expect(parseLocalOrIso('2026-11-10T15:30', LIMA)?.toISOString()).toBe(
      '2026-11-10T20:30:00.000Z',
    );
    expect(parseLocalOrIso('2026-11-10T15:30:00Z', LIMA)?.toISOString()).toBe(
      '2026-11-10T15:30:00.000Z',
    );
    expect(parseLocalOrIso('mañana a las 3', LIMA)).toBeNull();
    expect(parseLocalOrIso('2026-13-40T99:00', LIMA)).toBeNull();
    expect(localIso(new Date('2026-11-10T20:30:00Z'), LIMA)).toBe(
      '2026-11-10T15:30',
    );
  });

  it('valida zonas y franjas', () => {
    expect(isValidTimeZone(LIMA)).toBe(true);
    expect(isValidTimeZone('Marte/Olimpo')).toBe(false);
    expect(isValidHours({ day: 1, start: '09:00', end: '18:00' })).toBe(true);
    expect(isValidHours({ day: 7, start: '09:00', end: '18:00' })).toBe(false);
    expect(isValidHours({ day: 1, start: '18:00', end: '09:00' })).toBe(false);
  });

  it('respeta la antelación mínima: el primer hueco es a las 10:00 locales', () => {
    const slots = freeSlots(
      rules(),
      [],
      { start: NOW, end: new Date('2026-11-10T00:00:00Z') },
      NOW,
      3,
    );
    expect(slots.map((s) => localIso(s, LIMA))).toEqual([
      '2026-11-09T10:00',
      '2026-11-09T10:30',
      '2026-11-09T11:00',
    ]);
  });

  it('no ofrece horarios ocupados ni pegados a otra cita con margen', () => {
    const busy = [
      {
        start: new Date('2026-11-09T15:00:00Z'), // 10:00-11:00 Lima
        end: new Date('2026-11-09T16:00:00Z'),
      },
    ];
    const slots = freeSlots(
      rules({ bufferMinutes: 15 }),
      busy,
      { start: NOW, end: new Date('2026-11-10T00:00:00Z') },
      NOW,
      2,
    );
    // 11:00 queda dentro del margen de 15 min; el primero libre es 11:30.
    expect(slots.map((s) => localIso(s, LIMA))).toEqual([
      '2026-11-09T11:30',
      '2026-11-09T12:00',
    ]);
  });

  it('salta el fin de semana y no pasa del cierre', () => {
    const friday = new Date('2026-11-13T22:00:00Z'); // viernes 17:00 Lima
    const slots = freeSlots(
      rules({ minNoticeHours: 0, durationMinutes: 60 }),
      [],
      { start: friday, end: new Date('2026-11-17T00:00:00Z') },
      friday,
      2,
    );
    expect(slots.map((s) => localIso(s, LIMA))).toEqual([
      '2026-11-13T17:00',
      '2026-11-16T09:00',
    ]);
  });

  it('rechaza un horario fuera de franja, ocupado o demasiado lejano', () => {
    const r = rules();
    const at = (iso: string) => parseLocalOrIso(iso, LIMA)!;
    expect(isSlotAllowed(at('2026-11-10T10:00'), r, [], NOW)).toBe(true);
    expect(isSlotAllowed(at('2026-11-10T19:00'), r, [], NOW)).toBe(false);
    expect(isSlotAllowed(at('2026-11-14T10:00'), r, [], NOW)).toBe(false); // sábado
    expect(isSlotAllowed(at('2026-11-09T09:00'), r, [], NOW)).toBe(false); // < 2 h
    expect(isSlotAllowed(at('2027-01-10T10:00'), r, [], NOW)).toBe(false); // > 30 días
    const busy = [
      { start: at('2026-11-10T10:15'), end: at('2026-11-10T10:45') },
    ];
    expect(isSlotAllowed(at('2026-11-10T10:00'), r, busy, NOW)).toBe(false);
  });
});
