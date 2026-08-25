import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AiTool,
  AppEvent,
  CheckInByCodeResult,
  EventPayload,
  ExternalImpulsadorCreated,
  ExternalImpulsadorInput,
  Impulsador,
  Local,
  Registration,
  RegistrationsQuery,
  UploadResult,
} from '../../shared/models/event.model';

const AI_ENDPOINTS: Record<AiTool, string> = {
  copy: 'generate-copy',
  social: 'generate-social',
  hashtags: 'generate-hashtags',
  email: 'generate-email',
};

/** Capa de datos de la feature de eventos. Los componentes no usan HttpClient directamente. */
@Injectable({ providedIn: 'root' })
export class EventsApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // ── Locals ──────────────────────────────────────────────────────────────

  getLocals(): Observable<Local[]> {
    return this.http.get<Local[]>(`${this.base}/locals`);
  }

  // ── Eventos ─────────────────────────────────────────────────────────────

  getEvents(localId: string): Observable<AppEvent[]> {
    return this.http.get<AppEvent[]>(`${this.base}/events`, { params: { localId } });
  }

  getEvent(id: string): Observable<AppEvent> {
    return this.http.get<AppEvent>(`${this.base}/events/${id}`);
  }

  createEvent(body: EventPayload): Observable<AppEvent> {
    return this.http.post<AppEvent>(`${this.base}/events`, body);
  }

  updateEvent(id: string, body: EventPayload): Observable<AppEvent> {
    return this.http.patch<AppEvent>(`${this.base}/events/${id}`, body);
  }

  deleteEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/events/${id}`);
  }

  // ── Registros / asistentes ──────────────────────────────────────────────

  getRegistrations(eventId: string, query: RegistrationsQuery): Observable<Registration[]> {
    const params: Record<string, string> = {
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    if (query.status) params['status'] = query.status;
    if (query.search) params['search'] = query.search;
    return this.http.get<Registration[]>(`${this.base}/events/${eventId}/registrations`, { params });
  }

  checkIn(eventId: string, registrationId: string): Observable<Registration> {
    return this.http.patch<Registration>(
      `${this.base}/events/${eventId}/registrations/${registrationId}/check-in`, {},
    );
  }

  checkInByCode(eventId: string, code: string): Observable<CheckInByCodeResult> {
    return this.http.patch<CheckInByCodeResult>(
      `${this.base}/events/${eventId}/registrations/check-in/by-code`, { code },
    );
  }

  // ── Impulsadores ────────────────────────────────────────────────────────

  getImpulsadores(eventId: string): Observable<Impulsador[]> {
    return this.http.get<Impulsador[]>(`${this.base}/events/${eventId}/impulsadores`);
  }

  shareEvent(eventId: string, sharedWith: string[]): Observable<{ sharedWith: string[] }> {
    return this.http.patch<{ sharedWith: string[] }>(`${this.base}/events/${eventId}/share`, { sharedWith });
  }

  createExternalImpulsador(body: ExternalImpulsadorInput): Observable<ExternalImpulsadorCreated> {
    return this.http.post<ExternalImpulsadorCreated>(`${this.base}/impulsadores/external`, body);
  }

  deleteExternalImpulsador(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/impulsadores/external/${id}`);
  }

  // ── Marketing IA ────────────────────────────────────────────────────────

  runAI(eventId: string, tool: AiTool): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/events/${eventId}/${AI_ENDPOINTS[tool]}`, {},
    );
  }

  // ── Upload de archivos ──────────────────────────────────────────────────

  upload(file: File, folder = 'events'): Observable<UploadResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadResult>(`${this.base}/upload?folder=${folder}`, fd);
  }
}
