import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  IgAccount,
  IgAccountPayload,
  IgStatus,
  TenantSettings,
  TokenRefreshResult,
  WaAccount,
  WaAccountPayload,
  WaOauthConfig,
  WaOauthConnectPayload,
  WaQr,
  WaStatus,
  WaTemplate,
  WaTemplatePayload,
  WaTestResult,
  WebhookResult,
} from '../../shared/models/accounts.model';

/** Capa de datos de configuración (cuentas WhatsApp/Instagram, plantillas, keys de IA). Los componentes no usan HttpClient directamente. */
@Injectable({ providedIn: 'root' })
export class AccountsApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // ── Configuración del tenant (keys de IA + límite diario) ───────────────

  getSettings(): Observable<TenantSettings> {
    return this.http.get<TenantSettings>(`${this.base}/settings`);
  }

  updateSettings(body: Partial<TenantSettings>): Observable<unknown> {
    return this.http.put(`${this.base}/settings`, body);
  }

  // ── Cuentas WhatsApp ─────────────────────────────────────────────────────

  getWaAccounts(): Observable<WaAccount[]> {
    return this.http.get<WaAccount[]>(`${this.base}/whatsapp-accounts`);
  }

  createWaAccount(body: WaAccountPayload): Observable<WaAccount> {
    return this.http.post<WaAccount>(`${this.base}/whatsapp-accounts`, body);
  }

  updateWaAccount(id: string, body: WaAccountPayload): Observable<WaAccount> {
    return this.http.patch<WaAccount>(`${this.base}/whatsapp-accounts/${id}`, body);
  }

  deleteWaAccount(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/whatsapp-accounts/${id}`);
  }

  setDefaultWaAccount(id: string): Observable<unknown> {
    return this.http.patch(`${this.base}/whatsapp-accounts/${id}/default`, {});
  }

  configureWaWebhook(id: string): Observable<WebhookResult> {
    return this.http.post<WebhookResult>(`${this.base}/whatsapp-accounts/${id}/webhook`, {});
  }

  getWaStatus(id: string): Observable<WaStatus> {
    return this.http.get<WaStatus>(`${this.base}/whatsapp-accounts/${id}/status`);
  }

  getWaQr(id: string): Observable<WaQr> {
    return this.http.get<WaQr>(`${this.base}/whatsapp-accounts/${id}/qr`);
  }

  testWaAccount(id: string, phone: string): Observable<WaTestResult> {
    return this.http.post<WaTestResult>(`${this.base}/whatsapp-accounts/${id}/test`, { phone });
  }

  refreshWaToken(id: string): Observable<TokenRefreshResult> {
    return this.http.post<TokenRefreshResult>(`${this.base}/whatsapp-accounts/${id}/oauth/refresh`, {});
  }

  getWaOauthConfig(): Observable<WaOauthConfig> {
    return this.http.get<WaOauthConfig>(`${this.base}/whatsapp-accounts/oauth/config`);
  }

  connectWaOauth(body: WaOauthConnectPayload): Observable<WaAccount> {
    return this.http.post<WaAccount>(`${this.base}/whatsapp-accounts/oauth/connect`, body);
  }

  /** URL del webhook entrante de una cuenta WhatsApp (informativa, se muestra en la UI). */
  waWebhookUrl(acc: Pick<WaAccount, '_id' | 'provider'>): string {
    const kind = acc.provider === 'waha' ? 'waha' : 'cloud';
    return `${this.base}/wa/webhook/${kind}/${acc._id}`;
  }

  // ── Cuentas Instagram ────────────────────────────────────────────────────

  getIgAccounts(): Observable<IgAccount[]> {
    return this.http.get<IgAccount[]>(`${this.base}/instagram-accounts`);
  }

  createIgAccount(body: IgAccountPayload): Observable<IgAccount> {
    return this.http.post<IgAccount>(`${this.base}/instagram-accounts`, body);
  }

  updateIgAccount(id: string, body: IgAccountPayload): Observable<IgAccount> {
    return this.http.patch<IgAccount>(`${this.base}/instagram-accounts/${id}`, body);
  }

  deleteIgAccount(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/instagram-accounts/${id}`);
  }

  getIgStatus(id: string): Observable<IgStatus> {
    return this.http.get<IgStatus>(`${this.base}/instagram-accounts/${id}/status`);
  }

  startIgOauth(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/instagram-accounts/oauth/start`);
  }

  refreshIgToken(id: string): Observable<TokenRefreshResult> {
    return this.http.post<TokenRefreshResult>(`${this.base}/instagram-accounts/${id}/oauth/refresh`, {});
  }

  subscribeIgWebhook(id: string): Observable<WebhookResult> {
    return this.http.post<WebhookResult>(`${this.base}/instagram-accounts/${id}/subscribe`, {});
  }

  /** URL del webhook de Instagram de la app (única para todas las cuentas). */
  igWebhookUrl(): string {
    return `${this.base}/ig/webhook`;
  }

  // ── Plantillas WhatsApp (Cloud API) ──────────────────────────────────────

  getTemplates(): Observable<WaTemplate[]> {
    return this.http.get<WaTemplate[]>(`${this.base}/settings/templates`);
  }

  syncTemplates(): Observable<WaTemplate[]> {
    return this.http.post<WaTemplate[]>(`${this.base}/settings/templates/sync`, {});
  }

  createTemplate(dto: WaTemplatePayload): Observable<WaTemplate[]> {
    return this.http.post<WaTemplate[]>(`${this.base}/settings/templates`, dto);
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/settings/templates/${id}`);
  }
}
