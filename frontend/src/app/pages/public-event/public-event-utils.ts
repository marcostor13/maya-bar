/** Utilidades de la landing pública del evento para el invitado (HU33). */

export interface CalendarEvent {
  title: string;
  date: string; // AAAA-MM-DD (o ISO)
  startTime?: string; // HH:mm
  endTime?: string;
  description?: string;
  location?: string;
  url?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parts(ev: CalendarEvent): { allDay: boolean; start: string; end: string } {
  const [y, m, d] = ev.date.slice(0, 10).split('-').map(Number);
  if (!ev.startTime) {
    const next = new Date(y, m - 1, d + 1);
    return {
      allDay: true,
      start: `${y}${pad(m)}${pad(d)}`,
      end: `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`,
    };
  }
  const [sh, sm] = ev.startTime.split(':').map(Number);
  const start = new Date(y, m - 1, d, sh, sm);
  let end: Date;
  if (ev.endTime) {
    const [eh, em] = ev.endTime.split(':').map(Number);
    end = new Date(y, m - 1, d, eh, em);
    if (end <= start) end.setDate(end.getDate() + 1); // termina pasada la medianoche
  } else {
    end = new Date(start.getTime() + 2 * 3600_000);
  }
  const fmt = (t: Date) =>
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
  return { allDay: false, start: fmt(start), end: fmt(end) };
}

/** Escapa texto para iCalendar (RFC 5545). */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** Archivo .ics con hora local "flotante": el móvil lo muestra a la hora del evento. */
export function buildIcs(ev: CalendarEvent, uid: string): string {
  const p = parts(ev);
  const dt = (k: string, v: string) => (p.allDay ? `${k};VALUE=DATE:${v}` : `${k}:${v}`);
  const desc = [ev.description, ev.url].filter(Boolean).join('\n\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maya//Eventos//ES',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    dt('DTSTART', p.start),
    dt('DTEND', p.end),
    `SUMMARY:${icsText(ev.title)}`,
    ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
    ...(ev.location ? [`LOCATION:${icsText(ev.location)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const p = parts(ev);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${p.start}/${p.end}`,
    ...(ev.description || ev.url ? { details: [ev.description, ev.url].filter(Boolean).join('\n\n') } : {}),
    ...(ev.location ? { location: ev.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function mapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

/** Entrada recordada en este dispositivo para no registrarse dos veces. */
export interface SavedTicket {
  ticketCode: string;
  name: string;
  email: string;
}

const ticketKey = (eventId: string) => `maya.ticket.${eventId}`;

export function loadTicket(eventId: string): SavedTicket | null {
  try {
    const raw = localStorage.getItem(ticketKey(eventId));
    if (!raw) return null;
    const t = JSON.parse(raw) as SavedTicket;
    return t?.ticketCode ? t : null;
  } catch {
    return null;
  }
}

export function saveTicket(eventId: string, t: SavedTicket): void {
  try { localStorage.setItem(ticketKey(eventId), JSON.stringify(t)); } catch { /* sin almacenamiento */ }
}

export function forgetTicket(eventId: string): void {
  try { localStorage.removeItem(ticketKey(eventId)); } catch { /* sin almacenamiento */ }
}

/** Texto del botón principal: no promete un pago en línea que no existe. */
export function ctaLabel(price: number): string {
  return price === 0 ? 'Reservar mi lugar' : `Reservar entrada · S/ ${price}`;
}
