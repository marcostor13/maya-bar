import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type CalendarProvider = 'google' | 'microsoft';

export interface CalendarConnection {
  _id: string;
  provider: CalendarProvider;
  email: string;
  name?: string;
  isDefault: boolean;
}

export interface CalendarConnections {
  /** Qué proveedores tienen credenciales de OAuth en el servidor. */
  available: Record<CalendarProvider, boolean>;
  connections: CalendarConnection[];
}

export interface CreateCalendarEvent {
  title: string;
  description?: string;
  /** ISO 8601, idealmente con offset. */
  start: string;
  /** Entre 5 y 480. */
  durationMinutes: number;
  attendees?: string[];
  /** Sin él se usa el calendario predeterminado. */
  connectionId?: string;
  /** Zona IANA, p. ej. `America/Lima`. */
  timeZone?: string;
}

export interface CalendarEvent {
  provider: CalendarProvider;
  eventId: string;
  htmlLink?: string;
  /** Enlace de Google Meet o Microsoft Teams. */
  joinUrl?: string;
  start: string;
  end: string;
  connectionEmail: string;
}

/** Calendarios conectados (Google Meet / Microsoft Teams) y creación de reuniones. */
@Injectable({ providedIn: 'root' })
export class CalendarService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/calendar`;

  connections(): Observable<CalendarConnections> {
    return this.http.get<CalendarConnections>(`${this.base}/connections`);
  }

  createEvent(body: CreateCalendarEvent): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>(`${this.base}/events`, body);
  }

  startOAuth(provider: CalendarProvider): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/oauth/${provider}/start`);
  }

  setDefault(id: string): Observable<CalendarConnection> {
    return this.http.patch<CalendarConnection>(`${this.base}/connections/${id}/default`, {});
  }

  disconnect(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base}/connections/${id}`);
  }
}
