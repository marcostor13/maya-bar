import { smsSegments as analyze } from '../shared/sms-segments';

/** Segmentos que cobra el operador por un texto (al menos 1). */
export function smsSegments(text: string): number {
  return Math.max(1, analyze(text).segments);
}
