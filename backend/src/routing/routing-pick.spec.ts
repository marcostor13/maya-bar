import { inSchedule, pick, type Candidate } from './routing-pick';

const cand = (
  userId: string,
  o: Partial<Candidate> = {},
): [string, Candidate] => [
  userId,
  { userId, weight: 1, open: 0, received: 0, ...o },
];

describe('routing-pick (HU59)', () => {
  const members = ['a', 'b', 'c'];

  it('turno rotativo: sigue al último y salta a quien no está disponible', () => {
    const all = new Map([cand('a'), cand('b'), cand('c')]);
    expect(pick('round_robin', members, all, -1)).toBe(0);
    expect(pick('round_robin', members, all, 0)).toBe(1);
    expect(pick('round_robin', members, all, 2)).toBe(0);
    const noB = new Map([cand('a'), cand('c')]);
    expect(pick('round_robin', members, noB, 0)).toBe(2);
    expect(pick('round_robin', members, new Map(), 0)).toBe(-1);
  });

  it('menos abiertas y ponderado', () => {
    const load = new Map([
      cand('a', { open: 5 }),
      cand('b', { open: 2 }),
      cand('c', { open: 2 }),
    ]);
    expect(pick('least_open', members, load, -1)).toBe(1);
    // b pesa 2: recibe el doble antes de volver a a.
    const w = new Map([
      cand('a', { received: 1 }),
      cand('b', { weight: 2, received: 1 }),
    ]);
    expect(pick('weighted', ['a', 'b'], w, -1)).toBe(1);
    const w2 = new Map([
      cand('a', { received: 1 }),
      cand('b', { weight: 2, received: 3 }),
    ]);
    expect(pick('weighted', ['a', 'b'], w2, -1)).toBe(0);
  });

  it('horario en Lima por días y horas', () => {
    // Martes 2026-11-24 15:00 UTC = 10:00 en Lima.
    const now = new Date('2026-11-24T15:00:00Z');
    expect(inSchedule(undefined, now)).toBe(true);
    expect(inSchedule({ days: [1, 2, 3, 4, 5], from: 9, to: 18 }, now)).toBe(
      true,
    );
    expect(inSchedule({ days: [0, 6] }, now)).toBe(false);
    expect(inSchedule({ from: 14, to: 22 }, now)).toBe(false);
    expect(inSchedule({ from: 22, to: 11 }, now)).toBe(true);
  });
});
