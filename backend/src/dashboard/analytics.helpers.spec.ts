import {
  dayKey,
  deltaPct,
  fillSeries,
  percentile,
  resolveRange,
  responseStats,
  safeTimezone,
} from './analytics.helpers';

const at = (iso: string) => new Date(iso);

describe('analytics helpers', () => {
  it('valida la zona horaria y cae a Lima si no es válida', () => {
    expect(safeTimezone('Europe/Madrid')).toBe('Europe/Madrid');
    expect(safeTimezone('Nowhere/Fake')).toBe('America/Lima');
    expect(safeTimezone(undefined)).toBe('America/Lima');
  });

  it('agrupa por día local, no UTC', () => {
    // 02:00 UTC del 23 es aún el 22 en Lima (UTC-5).
    expect(dayKey(at('2026-09-23T02:00:00Z'), 'America/Lima')).toBe(
      '2026-09-22',
    );
    expect(dayKey(at('2026-09-23T02:00:00Z'), 'UTC')).toBe('2026-09-23');
  });

  it('7 días: 7 cubetas diarias terminando hoy y periodo anterior contiguo', () => {
    const now = at('2026-09-23T15:00:00Z');
    const r = resolveRange('7d', 'America/Lima', now);
    expect(r.bucket).toBe('day');
    expect(r.buckets).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(r.to).toEqual(now);
    expect(r.prevTo).toEqual(r.from);
    expect(r.from.getTime() - r.prevFrom.getTime()).toBe(
      now.getTime() - r.from.getTime(),
    );
  });

  it('12 meses: cubetas mensuales hasta el mes actual', () => {
    const r = resolveRange('12m', 'America/Lima', at('2026-02-10T12:00:00Z'));
    expect(r.bucket).toBe('month');
    expect(r.buckets[0]).toBe('2025-03');
    expect(r.buckets[11]).toBe('2026-02');
    expect(r.buckets).toHaveLength(12);
    expect(r.from.toISOString()).toBe('2025-03-01T00:00:00.000Z');
  });

  it('un rango desconocido usa 30 días', () => {
    expect(resolveRange('999d', 'UTC').buckets).toHaveLength(30);
  });

  it('rellena con ceros las cubetas sin datos', () => {
    expect(
      fillSeries(
        ['a', 'b', 'c'],
        [
          { _id: 'c', value: 3 },
          { _id: 'a', value: 1.234 },
        ],
      ),
    ).toEqual([1.23, 0, 3]);
  });

  it('deltaPct no divide entre cero', () => {
    expect(deltaPct(15, 10)).toBe(50);
    expect(deltaPct(5, 10)).toBe(-50);
    expect(deltaPct(5, 0)).toBeNull();
  });

  it('percentile toma el valor del rango', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });

  describe('responseStats', () => {
    const m = (
      c: string,
      direction: 'in' | 'out',
      author: string,
      minute: number,
    ) => ({
      conversationId: c,
      direction,
      author,
      at: new Date(Date.UTC(2026, 0, 1, 0, minute)),
    });

    it('mide desde el primer mensaje del turno hasta la primera respuesta', () => {
      const s = responseStats([
        // Turno 1: dos mensajes del cliente, el agente responde a los 3 min del primero.
        m('a', 'in', 'customer', 0),
        m('a', 'in', 'customer', 1),
        m('a', 'out', 'agent', 3),
        m('a', 'out', 'agent', 4), // segunda respuesta del mismo turno: no cuenta
        // Turno 2: una persona responde a los 20 min.
        m('a', 'in', 'customer', 10),
        m('a', 'out', 'system', 11), // nota interna: se ignora
        m('a', 'out', 'human', 30),
        // Otra conversación que queda sin respuesta.
        m('b', 'in', 'customer', 5),
      ]);
      expect(s.answered).toBe(2);
      expect(s.unanswered).toBe(1);
      expect(s.aiMedianMinutes).toBe(3);
      expect(s.humanMedianMinutes).toBe(20);
      expect(s.medianMinutes).toBe(3);
      expect(s.p90Minutes).toBe(20);
      expect(s.withinFiveMinutes).toBe(50);
    });

    it('sin respuestas devuelve nulos, no ceros engañosos', () => {
      const s = responseStats([m('a', 'in', 'customer', 0)]);
      expect(s).toMatchObject({
        medianMinutes: null,
        withinFiveMinutes: null,
        answered: 0,
        unanswered: 1,
      });
    });

    it('un mensaje nuestro sin pregunta previa no es una respuesta', () => {
      const s = responseStats([
        m('a', 'out', 'human', 0),
        m('a', 'in', 'customer', 5),
        m('a', 'out', 'agent', 6),
      ]);
      expect(s.answered).toBe(1);
      expect(s.medianMinutes).toBe(1);
    });
  });
});
