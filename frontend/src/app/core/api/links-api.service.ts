import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LinkUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface ShortLink {
  _id: string;
  domain: string;
  code: string;
  shortUrl: string;
  title: string;
  destination: string;
  utm: LinkUtm;
  status: 'active' | 'paused';
  expiresAt?: string;
  clicks: number;
  uniqueClicks: number;
  botClicks: number;
  lastClickAt?: string;
  createdAt: string;
}

export interface LinkInput {
  destination: string;
  title?: string;
  alias?: string;
  domain?: string;
  utm?: LinkUtm;
  expiresAt?: string;
}

export type DomainStatus = 'pending' | 'dns_ok' | 'activating' | 'active';

export interface ShortDomain {
  _id: string;
  domain: string;
  status: DomainStatus;
  isDefault: boolean;
  checkedAt?: string;
  checkMessage?: string;
  resolvedTo: string[];
}

export interface DomainsResponse {
  serverIp: string;
  platformBase: string;
  /** Si basta con crear el registro A: el alta en el servidor es automática. */
  selfService: boolean;
  domains: ShortDomain[];
}

export type LinkChannel = 'sms' | 'email' | 'whatsapp' | 'other';

export interface LinkBatch {
  _id: string;
  name: string;
  destination: string;
  domain: string;
  channel: LinkChannel;
  message: string;
  subject?: string;
  source: 'lists' | 'contacts' | 'file';
  count: number;
  createdAt: string;
}

export interface BatchRow {
  _id: string;
  customerId?: string;
  name: string;
  phone: string;
  email: string;
  shortUrl: string;
  clicks: number;
  uniqueClicks: number;
  lastClickAt?: string;
  subject?: string;
  message: string;
}

export interface BatchInput {
  name: string;
  destination: string;
  domain?: string;
  channel: LinkChannel;
  message?: string;
  subject?: string;
  utm?: LinkUtm;
  listIds?: string[];
  customerIds?: string[];
  rows?: { name?: string; phone?: string; email?: string; fields?: Record<string, string> }[];
}

export interface ParsedFile {
  columns: string[];
  total: number;
  rows: Record<string, string>[];
}

export interface StatItem {
  label: string;
  value: number;
}

export interface RecentClick {
  _id: string;
  at: string;
  ip?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  device?: string;
  isBot: boolean;
  isUnique: boolean;
  language?: string;
  refererHost?: string;
  country?: string;
  city?: string;
  query?: Record<string, string>;
  cookies?: Record<string, string>;
  visitorId?: string;
  userAgent?: string;
  customerName?: string;
}

export interface LinkStats {
  totals: { clicks: number; unique: number; bots: number; lastClickAt: string | null };
  series: { date: string; clicks: number; unique: number }[];
  devices: StatItem[];
  browsers: StatItem[];
  os: StatItem[];
  countries: StatItem[];
  referers: StatItem[];
  languages: StatItem[];
  hours: number[][];
  topLinks: { _id: string; title: string; shortUrl: string; clicks: number; unique: number }[];
  recent: RecentClick[];
}

export interface StatsFilter {
  linkId?: string;
  batchId?: string;
  campaignId?: string;
  from?: string;
  to?: string;
}

/** Links cortos, dominios propios, lotes masivos y analítica de clics. */
@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/links`;

  // ── Links ──
  list(search = ''): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(this.base, { params: search ? { search } : {} });
  }

  get(id: string): Observable<ShortLink> {
    return this.http.get<ShortLink>(`${this.base}/${id}`);
  }

  create(input: LinkInput): Observable<ShortLink> {
    return this.http.post<ShortLink>(this.base, input);
  }

  update(id: string, input: Partial<LinkInput> & { status?: 'active' | 'paused' }): Observable<ShortLink> {
    return this.http.patch<ShortLink>(`${this.base}/${id}`, input);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  // ── Analítica ──
  stats(filter: StatsFilter): Observable<LinkStats> {
    const params: Record<string, string> = {
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima',
    };
    for (const [key, value] of Object.entries(filter)) if (value) params[key] = value;
    return this.http.get<LinkStats>(`${this.base}/stats`, { params });
  }

  exportClicks(filter: { linkId?: string; batchId?: string }): Observable<Blob> {
    const params: Record<string, string> = {};
    if (filter.linkId) params['linkId'] = filter.linkId;
    if (filter.batchId) params['batchId'] = filter.batchId;
    return this.http.get(`${this.base}/clicks.csv`, { params, responseType: 'blob' });
  }

  // ── Dominios ──
  domains(): Observable<DomainsResponse> {
    return this.http.get<DomainsResponse>(`${this.base}/domains`);
  }

  addDomain(domain: string): Observable<ShortDomain> {
    return this.http.post<ShortDomain>(`${this.base}/domains`, { domain });
  }

  verifyDomain(id: string): Observable<ShortDomain> {
    return this.http.post<ShortDomain>(`${this.base}/domains/${id}/verify`, {});
  }

  setDefaultDomain(id: string): Observable<ShortDomain> {
    return this.http.patch<ShortDomain>(`${this.base}/domains/${id}/default`, {});
  }

  removeDomain(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/domains/${id}`);
  }

  // ── Lotes ──
  batches(): Observable<LinkBatch[]> {
    return this.http.get<LinkBatch[]>(`${this.base}/batches`);
  }

  parseFile(file: File): Observable<ParsedFile> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<ParsedFile>(`${this.base}/batches/parse`, fd);
  }

  createBatch(input: BatchInput): Observable<LinkBatch> {
    return this.http.post<LinkBatch>(`${this.base}/batches`, input);
  }

  batch(id: string): Observable<{ batch: LinkBatch; rows: BatchRow[] }> {
    return this.http.get<{ batch: LinkBatch; rows: BatchRow[] }>(`${this.base}/batches/${id}`);
  }

  exportBatch(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/batches/${id}/export.csv`, { responseType: 'blob' });
  }

  removeBatch(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/batches/${id}`);
  }
}

/** Descarga un blob como archivo. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
