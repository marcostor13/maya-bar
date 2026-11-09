import { InjectionToken } from '@angular/core';

export type CallStatus =
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'completed'
  | 'missed'
  | 'rejected'
  | 'blocked'
  | 'failed';

/** Una llamada tal como la devuelve la API o el socket (nunca trae SDP). */
export interface CallView {
  _id: string;
  accountId: string;
  accountLabel?: string;
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  contact: string;
  contactName?: string;
  customerId?: string;
  conversationId?: string;
  claimedBy?: string;
  answeredBy?: string;
  answeredByName?: string;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  durationSec?: number;
  endReason?: string;
}

export type PermissionStatus = 'none' | 'pending' | 'granted' | 'permanent' | 'rejected' | 'expired';

export interface PermissionView {
  status: PermissionStatus;
  expiresAt?: string;
  canRequest: boolean;
  canCall: boolean;
}

export interface CallOptions {
  accounts: { _id: string; label: string; phoneNumber?: string; isDefault?: boolean }[];
  users: { _id: string; name: string }[];
  iceServers: RTCIceServer[];
}

/** Lo que muestra el panel de la llamada en curso. */
export interface CurrentCall {
  call: CallView;
  /** connecting: preparando audio · calling: sonando en el teléfono del cliente. */
  phase: 'connecting' | 'calling' | 'active';
  muted: boolean;
  /** Cuándo empezó a correr el cronómetro (al conectar el audio). */
  since?: number;
}

/**
 * Micrófono y WebRTC. Se inyectan para poder probar el servicio sin un
 * navegador real (y porque el WebView de la app los expone igual).
 */
export interface CallMedia {
  supported(): boolean;
  getMicrophone(): Promise<MediaStream>;
  createPeer(iceServers: RTCIceServer[]): RTCPeerConnection;
}

export const CALL_MEDIA = new InjectionToken<CallMedia>('CALL_MEDIA', {
  providedIn: 'root',
  factory: () => ({
    supported: () =>
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof RTCPeerConnection !== 'undefined',
    getMicrophone: () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      }),
    createPeer: (iceServers) => new RTCPeerConnection({ iceServers }),
  }),
});

/** Texto de cada estado del historial. */
export const STATUS_LABELS: Record<CallStatus, string> = {
  ringing: 'Sonando',
  connecting: 'Conectando',
  active: 'En curso',
  completed: 'Completada',
  missed: 'Perdida',
  rejected: 'Rechazada',
  blocked: 'Bloqueada',
  failed: 'Fallida',
};

export function formatDuration(sec?: number): string {
  if (!sec || sec < 1) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
}

/** mm:ss para el cronómetro. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function displayContact(c: { contact: string; contactName?: string }): string {
  return c.contactName?.trim() || (/^\d+$/.test(c.contact) ? `+${c.contact}` : c.contact);
}
