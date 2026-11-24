import {
  limaHour,
  monthDay,
  nextLimaHour,
  stepError,
  triggerError,
  waitUntil,
  withinWindow,
} from './automation-steps';

describe('automation-steps (HU58)', () => {
  // 2026-11-24 15:00 UTC = 10:00 en Lima.
  const now = new Date('2026-11-24T15:00:00Z');

  it('calcula esperas por minutos, hasta una hora y antes del evento', () => {
    expect(
      waitUntil({ id: 'a', type: 'wait', minutes: 90 }, now).toISOString(),
    ).toBe('2026-11-24T16:30:00.000Z');
    // Hasta las 9 en Lima: ya pasaron hoy, así que mañana 9:00 (14:00 UTC).
    expect(
      waitUntil({ id: 'a', type: 'wait', untilHour: 9 }, now).toISOString(),
    ).toBe('2026-11-25T14:00:00.000Z');
    const event = new Date('2026-11-26T00:00:00Z');
    expect(
      waitUntil(
        { id: 'a', type: 'wait', hoursBeforeEvent: 24 },
        now,
        event,
      ).toISOString(),
    ).toBe('2026-11-25T00:00:00.000Z');
    // Si el momento ya pasó, sigue de inmediato.
    expect(
      waitUntil({ id: 'a', type: 'wait', hoursBeforeEvent: 48 }, now, event),
    ).toEqual(now);
  });

  it('respeta el horario de envío en Lima', () => {
    expect(limaHour(now)).toBe(10);
    expect(withinWindow(now, { from: 9, to: 18 })).toEqual(now);
    const night = new Date('2026-11-25T03:00:00Z'); // 22:00 Lima
    expect(withinWindow(night, { from: 9, to: 18 }).toISOString()).toBe(
      '2026-11-25T14:00:00.000Z',
    );
    expect(withinWindow(night, null)).toEqual(night);
    expect(
      nextLimaHour(new Date('2026-11-24T14:00:00Z'), 9).toISOString(),
    ).toBe('2026-11-24T14:00:00.000Z');
  });

  it('valida pasos y disparadores', () => {
    expect(stepError({ id: 'a', type: 'wait' }, 0)).toMatch(/cuánto esperar/);
    expect(stepError({ id: 'a', type: 'whatsapp' }, 1)).toMatch(/^Paso 2/);
    expect(
      stepError({ id: 'a', type: 'whatsapp', template: { name: 'x' } }, 0),
    ).toBeNull();
    expect(stepError({ id: 'a', type: 'webhook', url: 'http://x' }, 0)).toMatch(
      /https/,
    );
    expect(
      stepError({ id: 'a', type: 'condition', condition: 'has_tag' }, 0),
    ).toMatch(/etiqueta/);
    expect(triggerError({ type: 'tag_added' })).toMatch(/etiqueta/);
    expect(triggerError({ type: 'no_reply', hours: 48 })).toBeNull();
  });

  it('lee mes y día de fechas en varios formatos', () => {
    expect(monthDay('1990-03-07')).toBe('03-07');
    expect(monthDay('7/3/1990')).toBe('03-07');
    expect(monthDay(new Date('1990-03-07T00:00:00Z'))).toBe('03-07');
    expect(monthDay('ayer')).toBeNull();
  });
});
