import {
  billableMinutes,
  DEFAULT_VOICE_PREFS,
  withinHours,
} from './voice-agent.service';

describe('agente de voz: reglas', () => {
  it('cobra cada minuto empezado', () => {
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(125)).toBe(3);
  });

  it('horario de atención en hora de Lima, días incluidos y franja nocturna', () => {
    const p = { ...DEFAULT_VOICE_PREFS }; // L-V 9 a 18
    // Martes 2026-11-24 10:00 Lima = 15:00 UTC
    expect(withinHours(p, new Date('2026-11-24T15:00:00Z'))).toBe(true);
    // Martes 20:00 Lima
    expect(withinHours(p, new Date('2026-11-25T01:00:00Z'))).toBe(false);
    // Domingo 10:00 Lima
    expect(withinHours(p, new Date('2026-11-22T15:00:00Z'))).toBe(false);
    // Franja que cruza medianoche (22 a 6): 23:00 Lima dentro
    const night = {
      ...p,
      hoursFrom: 22,
      hoursTo: 6,
      days: [0, 1, 2, 3, 4, 5, 6],
    };
    expect(withinHours(night, new Date('2026-11-25T04:00:00Z'))).toBe(true);
    expect(withinHours(night, new Date('2026-11-24T17:00:00Z'))).toBe(false);
  });
});
