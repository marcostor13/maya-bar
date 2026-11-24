import { heatOf, parseAiReading, ruleScore } from './score-rules';

describe('Reglas del puntaje de leads (HU70)', () => {
  const base = {
    inboundRecent: 0,
    emailOpens: 0,
    emailClicks: 0,
    stageProgress: null,
  };

  it('suma origen, respuesta rápida, clics y avance en el embudo, con tope de 50', () => {
    expect(ruleScore({ ...base, source: 'import' }).points).toBe(2);
    const hot = ruleScore({
      ...base,
      source: 'form',
      inboundRecent: 6,
      replyMinutes: 3,
      emailClicks: 1,
      stageProgress: 1,
    });
    expect(hot.points).toBe(50);
    expect(hot.reasons).toEqual(
      expect.arrayContaining([
        'respondió rápido',
        'hizo clic en un email',
        'avanzó en el embudo',
      ]),
    );
  });

  it('clasifica en caliente, tibio y frío', () => {
    expect([heatOf(85), heatOf(70), heatOf(55), heatOf(39)]).toEqual([
      'hot',
      'hot',
      'warm',
      'cold',
    ]);
  });

  it('entiende el JSON de la IA aunque venga con texto y acota los puntos', () => {
    expect(
      parseAiReading(
        'Claro:\n{"points": 80, "urgency": "esta semana", "reason": "Pide precio y lo necesita ya"}',
      ),
    ).toMatchObject({
      points: 50,
      urgency: 'esta semana',
      reason: 'Pide precio y lo necesita ya',
    });
    expect(parseAiReading('no sé')).toBeNull();
    expect(parseAiReading('{"points": "x"}')).toBeNull();
  });
});
