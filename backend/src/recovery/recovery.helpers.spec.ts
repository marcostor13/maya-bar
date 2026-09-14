import {
  bestHour,
  buildTemplateName,
  firstNameParam,
  hourHistogram,
  nextBatch,
  recommendSchedule,
  validateTemplateBody,
  zonedParts,
  zonedToUtc,
} from './recovery.helpers';
import type { RecoveryRecipient } from './recovery-plan.schema';

const LIMA = 'America/Lima';

function recipients(n: number, sent = 0): RecoveryRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    conversationId: String(i),
    name: 'Ana',
    phone: '51999',
    lastMessageAt: new Date(),
    stage: 'vio_precio',
    note: '',
    insideWindow: false,
    sendStatus: i < sent ? 'sent' : 'pending',
  }));
}

describe('recovery helpers', () => {
  it('convierte hora de pared de Lima a UTC (UTC−5)', () => {
    const d = zonedToUtc(2026, 9, 15, 18, 30, LIMA);
    expect(d.toISOString()).toBe('2026-09-15T23:30:00.000Z');
    expect(zonedParts(d, LIMA)).toMatchObject({
      hour: 18,
      minute: 30,
      weekday: 2,
    });
  });

  it('histograma por hora local', () => {
    const hist = hourHistogram([new Date('2026-09-15T00:10:00Z')], LIMA);
    expect(hist[19]).toBe(1);
  });

  it('hora pico con muestra suficiente, 19 por defecto sin ella', () => {
    const hist = new Array<number>(24).fill(1);
    hist[17] = 40;
    expect(bestHour(hist)).toBe(17);
    expect(bestHour(new Array<number>(24).fill(0))).toBe(19);
    const night = new Array<number>(24).fill(0);
    night[23] = 100;
    night[10] = 1;
    expect(bestHour(night)).not.toBe(23);
  });

  it('recomienda martes/miércoles/jueves distintos, 30 min antes del pico, con 24 h de margen', () => {
    const now = new Date('2026-09-14T15:00:00Z'); // lunes
    const s = recommendSchedule(3, new Array<number>(24).fill(0), LIMA, now);
    expect(s).toHaveLength(3);
    const parts = s.map((x) => zonedParts(x.sendAt, LIMA));
    expect(parts.map((p) => p.weekday)).toEqual([2, 3, 4]);
    expect(parts.every((p) => p.hour === 18 && p.minute === 30)).toBe(true);
    expect(s[0].sendAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(
      86_400_000,
    );
  });

  it('valida el cuerpo de la plantilla', () => {
    expect(validateTemplateBody('Hola {{1}}, ¿cómo va?')).toBeNull();
    expect(validateTemplateBody('{{1}} hola')).toMatch(/principio/);
    expect(validateTemplateBody('Hola, adiós {{1}}.')).toMatch(/final/);
    expect(validateTemplateBody('Hola {{2}}, qué tal')).toMatch(/\{\{1\}\}/);
    expect(validateTemplateBody('')).toMatch(/vacío/);
  });

  it('nombre de plantilla válido para Meta', () => {
    expect(buildTemplateName('vio_precio')).toMatch(
      /^recuperacion_vio_precio_\d{6}_[a-z0-9]+$/,
    );
  });

  it('primer nombre o "de nuevo"', () => {
    expect(firstNameParam('maría GARCÍA')).toBe('María');
    expect(firstNameParam('+51 999')).toBe('de nuevo');
    expect(firstNameParam('')).toBe('de nuevo');
  });

  it('tandas: primera de 10 con pausa de 30, luego 15 cada 10', () => {
    const cfg = {
      firstBatchSize: 10,
      firstPauseMinutes: 30,
      batchSize: 15,
      batchIntervalMinutes: 10,
    };
    const now = new Date('2026-09-15T23:30:00Z');
    const first = nextBatch({ ...cfg, recipients: recipients(30) }, now);
    expect(first.batch).toHaveLength(10);
    expect(first.nextAt.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(first.last).toBe(false);
    const second = nextBatch({ ...cfg, recipients: recipients(30, 10) }, now);
    expect(second.batch).toHaveLength(15);
    expect(second.nextAt.getTime() - now.getTime()).toBe(10 * 60_000);
    const third = nextBatch({ ...cfg, recipients: recipients(30, 25) }, now);
    expect(third.batch).toHaveLength(5);
    expect(third.last).toBe(true);
  });
});
