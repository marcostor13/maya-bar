/** Modelos del asistente de recuperación de clientes. */

export type RecoveryStatus =
  | 'analyzing' | 'review' | 'templates' | 'scheduled' | 'sending' | 'done' | 'failed';

export type RecoveryStage =
  | 'interesado' | 'objecion' | 'vio_precio' | 'sin_conversacion'
  | 'cliente' | 'no_encaja' | 'no_contactar' | 'en_curso';

export type RecipientSendStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export type SegmentSendStatus = 'idle' | 'scheduled' | 'sending' | 'paused' | 'done';

export interface RecoveryRecipient {
  conversationId: string;
  customerId?: string;
  name: string;
  phone: string;
  lastMessageAt: string;
  stage: RecoveryStage;
  note: string;
  insideWindow: boolean;
  reason?: string;
  sendStatus?: RecipientSendStatus;
  sentAt?: string;
  error?: string;
}

export interface RecoverySegment {
  key: string;
  name: string;
  description: string;
  strategy: string;
  color: string;
  enabled: boolean;
  recipients: RecoveryRecipient[];
  message: string;
  templateName?: string;
  templateId?: string;
  templateBody?: string;
  templateStatus?: string;
  rejectedReason?: string;
  templateError?: string;
  recommendedAt?: string;
  recommendationReason?: string;
  sendAt?: string;
  firstBatchSize: number;
  firstPauseMinutes: number;
  batchSize: number;
  batchIntervalMinutes: number;
  sendStatus: SegmentSendStatus;
  nextBatchAt?: string;
  sendError?: string;
}

export interface RecoveryAnalysis {
  total: number;
  processed: number;
  analyzedAt?: string;
  headline: string;
  summary: string;
  insights: string[];
  hourHistogram: number[];
  bestHour?: number;
  insideWindow: number;
  error?: string;
}

export interface RecoveryPlan {
  _id: string;
  name: string;
  status: RecoveryStatus;
  lookbackDays: number;
  context: string;
  timezone: string;
  language: string;
  analysis: RecoveryAnalysis;
  segments: RecoverySegment[];
  excluded: RecoveryRecipient[];
  createdAt: string;
  updatedAt: string;
}

export interface SegmentEdit {
  key: string;
  name: string;
  message: string;
  enabled: boolean;
  recipients: string[];
}

export interface SegmentSchedule {
  key: string;
  enabled: boolean;
  sendAt?: string;
  firstBatchSize: number;
  firstPauseMinutes: number;
  batchSize: number;
  batchIntervalMinutes: number;
}

/** Precio orientativo por conversación de marketing (el mismo que usa Campañas). */
export const PRICE_PER_MESSAGE_USD = 0.0625;

export const RECOVERY_STEPS = [
  { n: 1, label: 'Analizar', hint: 'La IA lee tus chats' },
  { n: 2, label: 'Plan', hint: 'Segmentos y mensajes' },
  { n: 3, label: 'Plantillas', hint: 'Aprobación de Meta' },
  { n: 4, label: 'Programar', hint: 'Fecha y hora' },
] as const;

/** Paso del asistente que corresponde a cada estado del plan. */
export function stepForStatus(status: RecoveryStatus): number {
  switch (status) {
    case 'analyzing': case 'failed': return 1;
    case 'review': return 2;
    case 'templates': return 3;
    default: return 4;
  }
}

export function sendCounts(recipients: Pick<RecoveryRecipient, 'sendStatus'>[]) {
  const c = { sent: 0, failed: 0, skipped: 0, pending: 0 };
  for (const r of recipients) c[r.sendStatus && r.sendStatus in c ? r.sendStatus : 'pending']++;
  return c;
}

/** `{{1}}` pintado con un nombre de ejemplo, para la vista previa. */
export function previewMessage(body: string, name = 'María'): string {
  return (body ?? '').replace(/\{\{\s*1\s*\}\}/g, name);
}

/** Espejo de la validación del backend, para avisar antes de enviar a Meta. */
export function validateTemplateBody(body: string): string | null {
  const text = body?.trim() ?? '';
  if (!text) return 'El mensaje está vacío';
  if (text.length > 1024) return `Tiene ${text.length} caracteres; WhatsApp admite 1024`;
  const vars = [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
  if (vars.some(v => v !== '1')) return 'Solo se puede usar {{1}} (el nombre)';
  if (/^\{\{\s*1\s*\}\}/.test(text) || /\{\{\s*1\s*\}\}[\s.!?¿¡]*$/.test(text))
    return '{{1}} no puede ir al principio ni al final';
  if (/\n{3,}/.test(text)) return 'No dejes más de una línea en blanco seguida';
  return null;
}
