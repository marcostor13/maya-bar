import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmailAccount, EmailAccountForm } from '../../shared/models/email.model';

/** Capa de datos de los buzones de correo conectados. */
@Injectable({ providedIn: 'root' })
export class EmailAccountsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/email-accounts`;

  list(): Observable<EmailAccount[]> {
    return this.http.get<EmailAccount[]>(this.base);
  }

  providers(): Observable<{ gmail: boolean; outlook: boolean }> {
    return this.http.get<{ gmail: boolean; outlook: boolean }>(`${this.base}/oauth/providers`);
  }

  startOAuth(provider: 'gmail' | 'outlook'): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/oauth/${provider}/start`);
  }

  create(body: EmailAccountForm): Observable<EmailAccount> {
    return this.http.post<EmailAccount>(this.base, body);
  }

  update(id: string, body: Partial<EmailAccountForm> & { active?: boolean }): Observable<EmailAccount> {
    return this.http.patch<EmailAccount>(`${this.base}/${id}`, body);
  }

  setDefault(id: string): Observable<EmailAccount> {
    return this.http.patch<EmailAccount>(`${this.base}/${id}/default`, {});
  }

  test(id: string): Observable<{ ok: boolean; error?: string }> {
    return this.http.post<{ ok: boolean; error?: string }>(`${this.base}/${id}/test`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
