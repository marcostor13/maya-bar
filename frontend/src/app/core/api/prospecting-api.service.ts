import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Prospect,
  ProspectSearch,
  ProspectingIntegrations,
} from '../../shared/models/prospecting.model';

export interface NewSearch {
  name?: string;
  services: string;
  idealCustomer?: string;
  location?: string;
  industries?: string[];
  maxResults?: number;
}

/** Capa de datos del módulo de prospección. */
@Injectable({ providedIn: 'root' })
export class ProspectingApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/prospecting`;

  integrations(): Observable<ProspectingIntegrations> {
    return this.http.get<ProspectingIntegrations>(`${this.base}/integrations`);
  }

  searches(): Observable<ProspectSearch[]> {
    return this.http.get<ProspectSearch[]>(`${this.base}/searches`);
  }

  search(id: string): Observable<ProspectSearch> {
    return this.http.get<ProspectSearch>(`${this.base}/searches/${id}`);
  }

  createSearch(body: NewSearch): Observable<ProspectSearch> {
    return this.http.post<ProspectSearch>(`${this.base}/searches`, body);
  }

  retrySearch(id: string): Observable<ProspectSearch> {
    return this.http.post<ProspectSearch>(`${this.base}/searches/${id}/retry`, {});
  }

  removeSearch(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/searches/${id}`);
  }

  prospects(filter: { status?: string; q?: string; searchId?: string } = {}): Observable<Prospect[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filter)) if (v) params = params.set(k, v);
    return this.http.get<Prospect[]>(`${this.base}/prospects`, { params });
  }

  prospect(id: string): Observable<Prospect> {
    return this.http.get<Prospect>(`${this.base}/prospects/${id}`);
  }

  createProspect(body: Partial<Prospect> & { searchId?: string }): Observable<Prospect> {
    return this.http.post<Prospect>(`${this.base}/prospects`, body);
  }

  updateProspect(id: string, body: Partial<Pick<Prospect, 'name' | 'website' | 'phone' | 'email' | 'address' | 'industry' | 'notes' | 'status' | 'tags'>>): Observable<Prospect> {
    return this.http.patch<Prospect>(`${this.base}/prospects/${id}`, body);
  }

  removeProspect(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/prospects/${id}`);
  }

  research(ids: string[]): Observable<{ queued: number }> {
    return this.http.post<{ queued: number }>(`${this.base}/prospects/research`, { ids });
  }

  material(id: string, instructions?: string): Observable<Prospect> {
    return this.http.post<Prospect>(`${this.base}/prospects/${id}/material`, { instructions });
  }

  toCustomer(id: string, personIndex?: number): Observable<{ prospect: Prospect }> {
    return this.http.post<{ prospect: Prospect }>(`${this.base}/prospects/${id}/customer`, { personIndex });
  }

  toLead(id: string, body: { personIndex?: number; title?: string; value?: number }): Observable<{ prospect: Prospect; leadId: string }> {
    return this.http.post<{ prospect: Prospect; leadId: string }>(`${this.base}/prospects/${id}/lead`, body);
  }
}
