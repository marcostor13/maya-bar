import { CheckInByCodeResult, Registration } from '../../../shared/models/event.model';

/** Resultado de una lectura en la puerta (HU30): verde, ámbar o rojo. */
export type ScanKind = 'ok' | 'already' | 'error';

export interface ScanOutcome {
  kind: ScanKind;
  title: string;
  detail: string;
}

function hhmm(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export function groupLabel(partySize: number): string {
  return partySize > 1 ? `Grupo de ${partySize}` : 'Entrada individual';
}

export function outcomeFromResult(res: CheckInByCodeResult): ScanOutcome {
  if (res.alreadyCheckedIn) {
    const at = hhmm(res.checkedInAt);
    return { kind: 'already', title: `${res.name} ya ingresó`, detail: at ? `Entró a las ${at}` : 'Ya tenía check-in' };
  }
  const by = res.impulsadorName ? ` · Invitado por ${res.impulsadorName}` : '';
  return { kind: 'ok', title: `Bienvenido, ${res.name}`, detail: groupLabel(res.partySize) + by };
}

export function outcomeFromError(err: unknown): ScanOutcome {
  const e = err as { status?: number; error?: { message?: string } };
  if (e?.status === 404) return { kind: 'error', title: 'Entrada no válida', detail: 'El código no corresponde a este evento' };
  if (e?.status === 409) return { kind: 'error', title: 'Registro cancelado', detail: e.error?.message ?? 'Esta entrada fue cancelada' };
  return { kind: 'error', title: 'No se pudo validar', detail: e?.error?.message ?? 'Revisa la conexión e inténtalo de nuevo' };
}

/** Patrón de vibración distinto por resultado: se nota sin mirar la pantalla. */
export function vibrationFor(kind: ScanKind): number[] {
  if (kind === 'ok') return [80];
  if (kind === 'already') return [60, 80, 60];
  return [300];
}

/** Búsqueda de la lista de check-in: nombre, email, teléfono (solo dígitos) o ticket. */
export function matchesCheckin(r: Registration, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    r.name.toLowerCase().includes(q) ||
    r.email.toLowerCase().includes(q) ||
    r.ticketCode.toLowerCase().includes(q) ||
    (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
  );
}
