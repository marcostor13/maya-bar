import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ResendDomain {
  name: string;
  status: string;
}

/** Cuenta de Resend tal como la devuelve el backend: sin la API key. */
export interface ResendConfig {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  ratePerMinute: number;
  domains: ResendDomain[];
  checkedAt?: string;
  /** null = no se pudo comprobar (key solo de envío). */
  fromVerified: boolean | null;
}

/** Sin `apiKey` se conserva la que ya estaba guardada. */
export interface ResendConfigInput {
  enabled: boolean;
  apiKey?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  ratePerMinute?: number;
}

/** Cuenta de Resend de la empresa para los correos masivos. */
@Injectable({ providedIn: 'root' })
export class ResendApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/resend`;

  getConfig(): Observable<ResendConfig> {
    return this.http.get<ResendConfig>(`${this.base}/config`);
  }

  saveConfig(input: ResendConfigInput): Observable<ResendConfig> {
    return this.http.put<ResendConfig>(`${this.base}/config`, input);
  }

  test(to: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/test`, { to });
  }

  remove(): Observable<void> {
    return this.http.delete<void>(`${this.base}/config`);
  }

  /** Para el editor de campañas: con qué remitente saldrán por defecto. */
  status(): Observable<{ configured: boolean; from: string }> {
    return this.http.get<{ configured: boolean; from: string }>(`${environment.apiUrl}/resend-status`);
  }
}
