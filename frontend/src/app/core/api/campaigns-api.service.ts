import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AudiencePreview,
  Campaign,
  CampaignEstimate,
  CampaignRecipientsPage,
  CampaignTargeting,
  CampaignType,
  RecipientStatus,
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

  /**
   * Conteo de destinatarios del segmento. Sin tags → todos los clientes.
   * `blocked` son los que quedan fuera por estar en la lista de no contactar.
   */
  previewCount(tags?: string[]): Observable<{ count: number; blocked: number }> {
    const params = tags && tags.length ? { tags: tags.join(',') } : undefined;
    return this.http.get<{ count: number; blocked: number }>(
      `${this.base}/campaigns/preview`,
      { params },
    );
  }

  /** A cuántos llegaría esta audiencia por este canal, ya deduplicada. */
  audiencePreview(body: {
    type: CampaignType;
    targeting: CampaignTargeting;
    recipientTags?: string[];
    listIds?: string[];
    customerIds?: string[];
  }): Observable<AudiencePreview> {
    return this.http.post<AudiencePreview>(`${this.base}/campaigns/audience-preview`, body);
  }

  /** Destinatarios de una campaña de email o SMS, con su estado. */
  getRecipients(id: string, status?: RecipientStatus | '', page = 1): Observable<CampaignRecipientsPage> {
    const params: Record<string, string> = { page: String(page) };
    if (status) params['status'] = status;
    return this.http.get<CampaignRecipientsPage>(`${this.base}/campaigns/${id}/recipients`, { params });
  }

  cancelCampaign(id: string): Observable<Campaign> {
    return this.http.post<Campaign>(`${this.base}/campaigns/${id}/cancel`, {});
  }

  /** Si la empresa tiene un proveedor de SMS activo. */
  smsStatus(): Observable<{ configured: boolean; name: string; from: string }> {
    return this.http.get<{ configured: boolean; name: string; from: string }>(`${this.base}/sms-status`);
  }

  /** Si la empresa envía los correos masivos con su propia cuenta de Resend. */
  resendStatus(): Observable<{ configured: boolean; from: string }> {
    return this.http.get<{ configured: boolean; from: string }>(`${this.base}/resend-status`);
  }

  /** Contactos para elegirlos a mano como destinatarios. */
  getContacts(): Observable<{ _id: string; name: string; email?: string; phone?: string; tags: string[] }[]> {
    return this.http.get<{ _id: string; name: string; email?: string; phone?: string; tags: string[] }[]>(
      `${this.base}/customers`,
    );
  }

  /** Dominios cortos activos, para elegir con cuál salen los links. */
  getShortDomains(): Observable<{ domains: { domain: string; status: string; isDefault: boolean }[] }> {
    return this.http.get<{ domains: { domain: string; status: string; isDefault: boolean }[] }>(
      `${this.base}/links/domains`,
    );
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

  /**
   * Sin `accountId`: el backend resuelve la cuenta predeterminada del tenant,
   * que es desde la que la campaña va a enviar de todas formas.
   */
  getTemplates(): Observable<WaTemplate[]> {
    return this.http.get<WaTemplate[]>(`${this.base}/whatsapp-templates`);
  }

  syncTemplates(): Observable<WaTemplate[]> {
    return this.http.post<WaTemplate[]>(`${this.base}/whatsapp-templates/sync`, {});
  }

  // ── Upload de archivos ───────────────────────────────────────────────────

  upload(file: Blob, filename?: string): Observable<{ url: string }> {
    const fd = new FormData();
    if (filename) fd.append('file', file, filename);
    else fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/upload?folder=campaigns`, fd);
  }
}
