import { BadRequestException } from '@nestjs/common';
import { resolveRange, validateDefinition } from './report-definition';

describe('report-definition (HU64)', () => {
  // 2026-11-24 15:00 en Lima = 20:00 UTC
  const now = new Date('2026-11-24T20:00:00Z');

  it('resuelve los rangos relativos en hora de Lima', () => {
    expect(resolveRange({ range: 'this_month' }, now).from.toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    );
    const last = resolveRange({ range: 'last_month' }, now);
    expect(last.from.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(last.to.toISOString()).toBe('2026-11-01T04:59:59.999Z');
    expect(resolveRange({}, now).from.toISOString()).toBe(
      '2026-10-26T05:00:00.000Z',
    ); // últimos 30 días
    const custom = resolveRange(
      { range: 'custom', from: '2026-11-01', to: '2026-11-10' },
      now,
    );
    expect(custom.to.toISOString()).toBe('2026-11-11T04:59:59.999Z');
  });

  it('rechaza rangos de más de un año o invertidos', () => {
    expect(() =>
      resolveRange(
        { range: 'custom', from: '2025-01-01', to: '2026-06-01' },
        now,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveRange(
        { range: 'custom', from: '2026-11-10', to: '2026-11-01' },
        now,
      ),
    ).toThrow(BadRequestException);
    expect(() => resolveRange({ range: 'custom' }, now)).toThrow(
      BadRequestException,
    );
  });

  it('solo admite combinaciones válidas y limpia los filtros', () => {
    expect(() =>
      validateDefinition({
        source: 'customers',
        metric: 'conversion_rate',
        groupBy: 'none',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateDefinition({
        source: 'leads',
        metric: 'count',
        groupBy: 'event',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateDefinition({
        source: 'customers',
        metric: 'count',
        groupBy: 'none',
        filters: { dateField: 'closedAt' },
      }),
    ).toThrow(BadRequestException);
    const d = validateDefinition({
      source: 'leads',
      metric: 'count',
      groupBy: 'owner',
      filters: { status: ' won ', tag: '', extra: 'x' } as never,
    });
    expect(d.filters).toEqual({ status: 'won' });
  });
});
