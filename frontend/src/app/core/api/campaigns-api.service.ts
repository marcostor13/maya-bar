import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Campaign,
  CampaignEstimate,
  CampaignPayload,
  ContactList,
  GeneratedEmail,
  WaTemplate,
} from '../../shared/models/campaign.model';

/** Capa de datos de la feature de campañas. Los componentes no usan HttpClient directamente. */
@Injectable({ providedIn: 'root' })
export class CampaignsApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // ── CRUD de campañas ─────────────────────────────────────────────────────

  getCampaigns(): Observable<Campaign[]> {
    return this.http.get<Campaign[]>(`${this.base}/campaigns`);
  }

  createCampaign(body: CampaignPayload): Observable<Campaign> {
    return this.http.post<Campaign>(`${this.base}/campaigns`, body);
  }

  updateCampaign(id: string, body: CampaignPayload): Observable<Campaign> {
    return this.http.patch<Campaign>(`${this.base}/campaigns/${id}`, body);
  }

  deleteCampaign(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/campaigns/${id}`);
  }

  // ── Envío / estimación ───────────────────────────────────────────────────

  sendCampaign(id: string): Observable<Campaign> {
    return this.http.post<Campaign>(`${this.base}/campaigns/${id}/send`, {});
  }

  resendCampaign(id: string): Observable<Campaign> {
    return this.http.post<Campaign>(`${this.base}/campaigns/${id}/resend`, {});
  }

  getEstimate(id: string): Observable<CampaignEstimate> {
    return this.http.get<CampaignEstimate>(`${this.base}/campaigns/${id}/estimate`);
  }

  /** Conteo de destinatarios del segmento. Sin tags → todos los clientes. */
  previewCount(tags?: string[]): Observable<{ count: number }> {
    const params = tags && tags.length ? { tags: tags.join(',') } : undefined;
    return this.http.get<{ count: number }>(`${this.base}/campaigns/preview`, { params });
  }

  // ── IA ───────────────────────────────────────────────────────────────────

  generateEmail(topic: string, tone: string): Observable<GeneratedEmail> {
    return this.http.post<GeneratedEmail>(`${this.base}/campaigns/generate-email`, { topic, tone });
  }

  // ── Listas de contactos ──────────────────────────────────────────────────

  getLists(): Observable<ContactList[]> {
    return this.http.get<ContactList[]>(`${this.base}/lists`);
  }

  // ── Plantillas WhatsApp Cloud API ────────────────────────────────────────

  getTemplates(): Observable<WaTemplate[]> {
    return this.http.get<WaTemplate[]>(`${this.base}/settings/templates`);
  }

  syncTemplates(): Observable<WaTemplate[]> {
    return this.http.post<WaTemplate[]>(`${this.base}/settings/templates/sync`, {});
  }

  // ── Upload de archivos ───────────────────────────────────────────────────

  upload(file: Blob, filename?: string): Observable<{ url: string }> {
    const fd = new FormData();
    if (filename) fd.append('file', file, filename);
    else fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/upload?folder=campaigns`, fd);
  }
}
