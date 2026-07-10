import type { DesignSpec } from '../../pages/events/invitation-designer';

// ── Tipos base ────────────────────────────────────────────────────────────────

export type EventStatus = 'draft' | 'published' | 'cancelled';
export type AiTool = 'copy' | 'social' | 'hashtags' | 'email';
export type FormFieldType =
  | 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'phone' | 'date';

export interface Local {
  _id: string;
  name: string;
}

export interface MediaFile {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

export interface AppEvent {
  _id: string;
  localId: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  price: number;
  imageUrl?: string;
  status: EventStatus;
  slug?: string;
  mediaFiles?: MediaFile[];
  formFields?: FormField[];
  invitationDesign?: DesignSpec;
}

export interface Registration {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  partySize: number;
  ticketCode: string;
  status: string;
  checkedIn: boolean;
  checkedInAt?: string;
  createdAt: string;
  customFields?: Record<string, string>;
  impulsadorName?: string | null;
}

export type CheckInByCodeResult = Registration & {
  impulsadorName: string | null;
  alreadyCheckedIn: boolean;
};

export interface Impulsador {
  _id: string;
  name: string;
  email: string;
  referralCode?: string;
  assigned: boolean;
  type: 'user' | 'external';
}

export interface ImpulsadorStat {
  name: string;
  registrations: number;
  attendees: number;
  checkedIn: number;
}

// ── Payloads / respuestas de API ─────────────────────────────────────────────

/** Cuerpo de creación/actualización de evento (valores del form pueden ser null). */
export interface EventPayload {
  title?: string | null;
  description?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  price?: number | null;
  capacity?: number | null;
  status?: string | null;
  localId?: string | null;
  imageUrl?: string;
  mediaFiles?: MediaFile[];
  formFields?: FormField[];
  invitationDesign?: DesignSpec | null;
}

export interface RegistrationsQuery {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  status?: string;
  search?: string;
}

export interface ExternalImpulsadorInput {
  name: string;
  phone?: string;
  email?: string;
}

export interface ExternalImpulsadorCreated {
  _id: string;
  name: string;
  email?: string;
  code: string;
}

export interface UploadResult {
  url: string;
  key: string;
  contentType: string;
  size: number;
}

// ── Metadatos de UI ──────────────────────────────────────────────────────────

export const EVENT_STATUS_META: Record<EventStatus, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'badge-neutral' },
  published: { label: 'Publicado', cls: 'badge-success' },
  cancelled: { label: 'Cancelado', cls: 'badge-danger'  },
};
