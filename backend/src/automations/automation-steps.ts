/** Tipos y reglas puras del motor de automatizaciones (HU58). */

export const TRIGGER_TYPES = [
  'form_submitted',
  'contact_created',
  'tag_added',
  'stage_changed',
  'event_registered',
  'no_reply',
  'date_field',
  'email_opened',
  'email_clicked',
  'score_reached',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const STEP_TYPES = [
  'wait',
  'whatsapp',
  'email',
  'sms',
  'tag',
  'untag',
  'stage',
  'assign',
  'reminder',
  'webhook',
  'condition',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const SEND_STEPS: StepType[] = ['whatsapp', 'email', 'sms'];

export interface AutomationTrigger {
  type: TriggerType;
  /** form_submitted: formulario concreto (vacío = cualquiera). */
  formId?: string;
  /** tag_added: etiqueta. */
  tag?: string;
  /** stage_changed: etapa destino. */
  stage?: string;
  /** event_registered: evento concreto (vacío = cualquiera). */
  eventId?: string;
  /** no_reply: horas sin respuesta. */
  hours?: number;
  /** date_field: clave del campo personalizado (fecha) y desfase en días. */
  field?: string;
  offsetDays?: number;
  /** email_opened/email_clicked: campaña concreta (vacío = cualquiera). */
  campaignId?: string;
  /** score_reached: puntaje mínimo (HU70). */
  minScore?: number;
}

export interface AutomationStep {
  id: string;
  type: StepType;
  /** wait: duración en minutos. */
  minutes?: number;
  /** wait: hasta esta hora del día (0–23), Lima. */
  untilHour?: number;
  /** wait: N horas antes del evento de la inscripción. */
  hoursBeforeEvent?: number;
  /** whatsapp/sms/email: cuerpo con variables. */
  text?: string;
  /** email */
  subject?: string;
  /** whatsapp: cuenta (vacío = primera Cloud API activa). */
  accountId?: string;
  /** whatsapp: plantilla aprobada para la ventana cerrada. */
  template?: { name: string; language?: string; variables?: string[] };
  /** tag/untag/condition has_tag */
  tag?: string;
  /** stage */
  stage?: string;
  /** assign */
  userId?: string;
  /** reminder */
  title?: string;
  dueMinutes?: number;
  /** webhook */
  url?: string;
  /** condition */
  condition?:
    | 'replied'
    | 'not_replied'
    | 'has_tag'
    | 'lacks_tag'
    | 'score_at_least';
  /** condition score_at_least: puntaje mínimo (HU70). */
  minScore?: number;
  /** condition: qué hacer si no se cumple. */
  otherwise?: 'exit' | 'skip_next';
}

export interface SendWindow {
  /** Hora desde (incl.) y hasta (excl.), 0–24, en Lima. */
  from: number;
  to: number;
}

/** Lima no tiene horario de verano: UTC−5 fijo. */
const LIMA_OFFSET_MS = -5 * 3600_000;

export function limaHour(d: Date): number {
  return new Date(d.getTime() + LIMA_OFFSET_MS).getUTCHours();
}

/** Próximo instante ≥ `d` cuya hora en Lima sea exactamente `hour`:00. */
export function nextLimaHour(d: Date, hour: number): Date {
  const local = new Date(d.getTime() + LIMA_OFFSET_MS);
  const target = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hour,
      0,
      0,
      0,
    ),
  );
  if (target.getTime() < local.getTime())
    target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - LIMA_OFFSET_MS);
}

/** Si `d` cae fuera del horario de envío, el inicio del siguiente horario. */
export function withinWindow(d: Date, w?: SendWindow | null): Date {
  if (!w || (w.from === 0 && w.to >= 24) || w.from === w.to) return d;
  const h = limaHour(d);
  const inside =
    w.from < w.to ? h >= w.from && h < w.to : h >= w.from || h < w.to;
  return inside ? d : nextLimaHour(d, w.from);
}

/** Cuándo termina un paso de espera. */
export function waitUntil(
  step: AutomationStep,
  now: Date,
  eventAt?: Date | null,
): Date {
  if (step.hoursBeforeEvent !== undefined && step.hoursBeforeEvent !== null) {
    if (!eventAt) return now;
    const at = new Date(eventAt.getTime() - step.hoursBeforeEvent * 3600_000);
    return at > now ? at : now;
  }
  let at = new Date(now.getTime() + Math.max(0, step.minutes ?? 0) * 60_000);
  if (step.untilHour !== undefined && step.untilHour !== null)
    at = nextLimaHour(at, step.untilHour);
  return at;
}

/** Errores de configuración de un paso, en lenguaje del usuario. */
export function stepError(s: AutomationStep, i: number): string | null {
  const n = `Paso ${i + 1}`;
  switch (s.type) {
    case 'wait':
      if (
        !(s.minutes! > 0) &&
        s.untilHour === undefined &&
        s.hoursBeforeEvent === undefined
      )
        return `${n}: indica cuánto esperar.`;
      if (s.untilHour !== undefined && !(s.untilHour >= 0 && s.untilHour <= 23))
        return `${n}: la hora va de 0 a 23.`;
      return null;
    case 'whatsapp':
      return s.text?.trim() || s.template?.name
        ? null
        : `${n}: escribe el mensaje o elige una plantilla.`;
    case 'sms':
      return s.text?.trim() ? null : `${n}: escribe el SMS.`;
    case 'email':
      return s.subject?.trim() && s.text?.trim()
        ? null
        : `${n}: el email necesita asunto y texto.`;
    case 'tag':
    case 'untag':
      return s.tag?.trim() ? null : `${n}: indica la etiqueta.`;
    case 'stage':
      return s.stage?.trim() ? null : `${n}: elige la etapa.`;
    case 'assign':
      return s.userId ? null : `${n}: elige el responsable.`;
    case 'reminder':
      return s.title?.trim() ? null : `${n}: escribe el recordatorio.`;
    case 'webhook':
      return /^https:\/\//i.test(s.url ?? '')
        ? null
        : `${n}: el webhook necesita una URL https.`;
    case 'condition':
      if (!s.condition) return `${n}: elige la condición.`;
      if (
        (s.condition === 'has_tag' || s.condition === 'lacks_tag') &&
        !s.tag?.trim()
      )
        return `${n}: indica la etiqueta de la condición.`;
      if (
        s.condition === 'score_at_least' &&
        !(s.minScore! >= 1 && s.minScore! <= 100)
      )
        return `${n}: el puntaje mínimo va de 1 a 100.`;
      return null;
    default:
      return `${n}: tipo de paso desconocido.`;
  }
}

export function triggerError(t: AutomationTrigger): string | null {
  switch (t.type) {
    case 'tag_added':
      return t.tag?.trim() ? null : 'Indica la etiqueta que dispara la regla.';
    case 'stage_changed':
      return t.stage?.trim() ? null : 'Elige la etapa que dispara la regla.';
    case 'no_reply':
      return t.hours && t.hours >= 1
        ? null
        : 'Indica las horas sin respuesta (mínimo 1).';
    case 'date_field':
      return t.field?.trim() ? null : 'Indica el campo de fecha.';
    case 'score_reached':
      return t.minScore! >= 1 && t.minScore! <= 100
        ? null
        : 'Indica el puntaje (de 1 a 100) que dispara la regla.';
    default:
      return TRIGGER_TYPES.includes(t.type) ? null : 'Disparador desconocido.';
  }
}

/** Mes y día (MM-DD) de una fecha guardada como texto o Date. */
export function monthDay(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime()))
    return value.toISOString().slice(5, 10);
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?$/.exec(value.trim());
  if (dmy) return `${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}
