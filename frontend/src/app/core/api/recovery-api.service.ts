import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RecoveryCampaignOption,
  RecoveryPlan,
  SegmentEdit,
  SegmentSchedule,
} from '../../shared/models/recovery.model';

/** Capa de datos del asistente de recuperación de clientes. */
@Injectable({ providedIn: 'root' })
export class RecoveryApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/recovery`;

  list(): Observable<RecoveryPlan[]> {
    return this.http.get<RecoveryPlan[]>(this.base);
  }

  get(id: string): Observable<RecoveryPlan> {
    return this.http.get<RecoveryPlan>(`${this.base}/${id}`);
  }

  /** Campañas de las que vienen chats de WhatsApp (anuncios y campañas de Maya). */
  campaigns(): Observable<RecoveryCampaignOption[]> {
    return this.http.get<RecoveryCampaignOption[]>(`${this.base}/campaigns`);
  }

  create(body: { lookbackDays: number; context: string; timezone: string; name?: string; campaign?: string }): Observable<RecoveryPlan> {
    return this.http.post<RecoveryPlan>(this.base, body);
  }

  reanalyze(id: string, body: { lookbackDays: number; context: string; campaign?: string }): Observable<RecoveryPlan> {
    return this.http.post<RecoveryPlan>(`${this.base}/${id}/reanalyze`, body);
  }

  update(id: string, body: { name?: string; segments?: SegmentEdit[] }): Observable<RecoveryPlan> {
    return this.http.patch<RecoveryPlan>(`${this.base}/${id}`, body);
  }

  /** Encola la reescritura; el resultado aparece en `segments[].rewriteJob`. */
  rewrite(id: string, key: string, instruction: string): Observable<{ requestedAt: string }> {
    return this.http.post<{ requestedAt: string }>(`${this.base}/${id}/segments/${key}/rewrite`, { instruction });
  }

  submitTemplates(id: string): Observable<RecoveryPlan> {
    return this.http.post<RecoveryPlan>(`${this.base}/${id}/templates`, {});
  }

  refreshTemplates(id: string): Observable<RecoveryPlan> {
    return this.http.post<RecoveryPlan>(`${this.base}/${id}/templates/refresh`, {});
  }

  schedule(id: string, segments: SegmentSchedule[]): Observable<RecoveryPlan> {
    return this.http.put<RecoveryPlan>(`${this.base}/${id}/schedule`, { segments });
  }

  cancel(id: string): Observable<RecoveryPlan> {
    return this.http.post<RecoveryPlan>(`${this.base}/${id}/cancel`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
