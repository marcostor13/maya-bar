import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SmsBodyType = 'json' | 'form' | 'query' | 'none';

export interface SmsHeader {
  key: string;
  value: string;
}

/** Configuración tal como la devuelve el backend: sin valores secretos. */
export interface SmsConfig {
  enabled: boolean;
  name: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT';
  headers: SmsHeader[];
  bodyType: SmsBodyType;
  body: string;
  from: string;
  secrets: { name: string; hasValue: boolean }[];
  successPath: string;
  successValue: string;
  idPath: string;
  defaultCountryCode: string;
  ratePerMinute: number;
  missingSecrets: string[];
}

/** Lo que se guarda: un secreto sin `value` conserva el que ya había. */
export interface SmsConfigInput extends Omit<SmsConfig, 'secrets' | 'missingSecrets'> {
  secrets: { name: string; value?: string }[];
}

export interface SmsTestResult {
  id?: string;
  status: number;
  response: string;
}

/** Proveedor de SMS de la empresa (petición HTTP genérica). */
@Injectable({ providedIn: 'root' })
export class SmsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/sms`;

  getConfig(): Observable<SmsConfig> {
    return this.http.get<SmsConfig>(`${this.base}/config`);
  }

  saveConfig(input: SmsConfigInput): Observable<SmsConfig> {
    return this.http.put<SmsConfig>(`${this.base}/config`, input);
  }

  test(to: string, message: string): Observable<SmsTestResult> {
    return this.http.post<SmsTestResult>(`${this.base}/test`, { to, message });
  }
}
