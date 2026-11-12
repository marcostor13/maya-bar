import {
  applyChange,
  buildTranscripts,
  MAX_SUGGESTIONS,
  redact,
  sanitizeSuggestions,
} from './prompt-review.logic';

describe('prompt-review.logic', () => {
  describe('redact (C11)', () => {
    it('oculta correos y teléfonos, deja horas y precios', () => {
      const out = redact(
        'Escríbeme a ana.perez@mail.com o al +1 (657) 256-7174. Cita a las 10:30 por $250.',
      );
      expect(out).toBe(
        'Escríbeme a [correo] o al [teléfono]. Cita a las 10:30 por $250.',
      );
    });
  });

  describe('buildTranscripts', () => {
    const conv = (id: string, text: string) => ({
      id,
      messages: [
        { author: 'customer', text },
        { author: 'agent', text: 'Hola' },
      ],
    });

    it('etiqueta autores y señales, y oculta datos (C11)', () => {
      const { text, ids } = buildTranscripts([
        {
          ...conv('c1', 'mi número es 16572567174'),
          escalated: true,
          unanswered: true,
        },
      ]);
      expect(ids).toEqual(['c1']);
      expect(text).toContain(
        '### Conversación c1 (derivada a humano, termina con el cliente sin respuesta)',
      );
      expect(text).toContain('Cliente: mi número es [teléfono]');
      expect(text).toContain('Agente IA: Hola');
    });

    it('usa la transcripción de los audios y respeta el tope total', () => {
      const { text, ids } = buildTranscripts(
        [
          {
            id: 'a',
            messages: [
              { author: 'customer', type: 'voice', transcript: 'audio dicho' },
            ],
          },
          conv('b', 'x'.repeat(500)),
        ],
        200,
      );
      expect(text).toContain('Cliente: audio dicho');
      expect(ids).toEqual(['a']);
    });
  });

  describe('sanitizeSuggestions (C2)', () => {
    const prompt = 'Eres Sofía.\nNunca des precios.';
    const base = {
      title: 't',
      problem: 'p',
      evidence: [{ conversationId: 'c1', excerpt: 'x' }],
    };

    it('acepta add, replace y remove válidos y marca pendientes', () => {
      const out = sanitizeSuggestions(
        [
          { ...base, action: 'add', text: 'Regla nueva' },
          {
            ...base,
            action: 'replace',
            find: 'Eres Sofía.',
            text: 'Eres Ana.',
          },
          { ...base, action: 'remove', find: 'Nunca des precios.' },
        ],
        prompt,
        ['c1'],
      );
      expect(out.map((s) => s.action)).toEqual(['add', 'replace', 'remove']);
      expect(out.every((s) => s.status === 'pending')).toBe(true);
      expect(out[0].find).toBeUndefined();
      expect(out[2].text).toBeUndefined();
    });

    it('descarta acciones desconocidas, cambios vacíos y textos que no están en el prompt', () => {
      const out = sanitizeSuggestions(
        [
          { ...base, action: 'rewrite', text: 'x' },
          { ...base, action: 'add', text: '' },
          { ...base, action: 'replace', find: 'no existe', text: 'x' },
          { ...base, action: 'remove' },
          { action: 'add', text: 'sin título' },
          'basura',
        ],
        prompt,
        ['c1'],
      );
      expect(out).toEqual([]);
    });

    it('recorta a 10 y solo deja evidencia de conversaciones enviadas', () => {
      const many = Array.from({ length: 15 }, () => ({
        ...base,
        action: 'add',
        text: 'x',
        evidence: [
          { conversationId: 'c1', excerpt: 'llamar al 16572567174' },
          { conversationId: 'otro-tenant', excerpt: 'y' },
        ],
      }));
      const out = sanitizeSuggestions(many, prompt, ['c1']);
      expect(out).toHaveLength(MAX_SUGGESTIONS);
      expect(out[0].evidence).toEqual([
        { conversationId: 'c1', excerpt: 'llamar al [teléfono]' },
      ]);
    });

    it('descarta las sugerencias sin evidencia de una conversación enviada (R2)', () => {
      const out = sanitizeSuggestions(
        [
          { ...base, action: 'add', text: 'x', evidence: [] },
          {
            ...base,
            action: 'add',
            text: 'y',
            evidence: [{ conversationId: 'inventada', excerpt: 'z' }],
          },
        ],
        prompt,
        ['c1'],
      );
      expect(out).toEqual([]);
    });

    it('no acepta algo que no sea una lista', () => {
      expect(sanitizeSuggestions({ a: 1 }, prompt, [])).toEqual([]);
    });
  });

  describe('applyChange', () => {
    const prompt = 'A\n\nB\n\nC';

    it('add añade al final', () => {
      expect(applyChange(prompt, { action: 'add', text: 'D' })).toBe(
        'A\n\nB\n\nC\n\nD\n',
      );
    });

    it('replace cambia la primera aparición sin interpretar $', () => {
      expect(
        applyChange(prompt, { action: 'replace', find: 'B', text: '$&x' }),
      ).toBe('A\n\n$&x\n\nC');
    });

    it('remove quita el texto sin dejar huecos de más', () => {
      expect(applyChange(prompt, { action: 'remove', find: 'B' })).toBe(
        'A\n\nC',
      );
    });

    it('no toca el espaciado del resto del prompt', () => {
      const p = 'A\n\n\nB\n\nC\n\nD';
      expect(applyChange(p, { action: 'remove', find: 'C' })).toBe(
        'A\n\n\nB\n\nD',
      );
      expect(applyChange(p, { action: 'replace', find: 'D', text: 'E' })).toBe(
        'A\n\n\nB\n\nC\n\nE',
      );
    });

    it('devuelve null si el texto ya no está (C5)', () => {
      expect(
        applyChange(prompt, { action: 'replace', find: 'Z', text: 'x' }),
      ).toBeNull();
    });
  });
});
