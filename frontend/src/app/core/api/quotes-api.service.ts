import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Product {
  _id: string;
  name: string;
  price: number;
  taxIncluded: boolean;
  unit: string;
  active: boolean;
  source: 'manual' | 'woocommerce';
}

export type ProductInput = Pick<Product, 'name' | 'price' | 'taxIncluded' | 'unit'> & { active?: boolean };

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'paid';

export interface QuoteItem {
  productId?: string;
  name: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxIncluded?: boolean;
  total?: number;
}

export interface Quote {
  _id: string;
  leadId: string;
  number: string;
  items: QuoteItem[];
  igvRate: number;
  currency: string;
  subtotal: number;
  discount: number;
  igv: number;
  total: number;
  validUntil?: string | null;
  notes?: string;
  payOnline: boolean;
  status: QuoteStatus;
  publicToken: string;
  sentVia: string[];
  sentAt?: string;
  createdAt: string;
}

export interface QuoteInput {
  leadId: string;
  items: QuoteItem[];
  igvRate?: number;
  validUntil?: string;
  notes?: string;
  payOnline?: boolean;
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; badge: string }> = {
  draft: { label: 'Borrador', badge: 'badge-neutral' },
  sent: { label: 'Enviada', badge: 'badge-info' },
  viewed: { label: 'Vista', badge: 'badge-warning' },
  accepted: { label: 'Aceptada', badge: 'badge-success' },
  rejected: { label: 'Rechazada', badge: 'badge-danger' },
  paid: { label: 'Pagada', badge: 'badge-success' },
};

/** Catálogo y cotizaciones de las oportunidades (HU68). */
@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  products(all = false): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.base}/products`, { params: all ? { all: '1' } : {} });
  }

  createProduct(body: ProductInput): Observable<Product> {
    return this.http.post<Product>(`${this.base}/products`, body);
  }

  updateProduct(id: string, body: Partial<ProductInput>): Observable<Product> {
    return this.http.patch<Product>(`${this.base}/products/${id}`, body);
  }

  removeProduct(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/products/${id}`);
  }

  importWoo(storeUrl: string): Observable<{ total: number; created: number; updated: number }> {
    return this.http.post<{ total: number; created: number; updated: number }>(
      `${this.base}/products/import-woocommerce`,
      { storeUrl },
    );
  }

  byLead(leadId: string): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${this.base}/quotes`, { params: { leadId } });
  }

  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.base}/quotes/${id}`);
  }

  create(body: QuoteInput): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/quotes`, body);
  }

  update(id: string, body: QuoteInput): Observable<Quote> {
    return this.http.patch<Quote>(`${this.base}/quotes/${id}`, body);
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/quotes/${id}`);
  }

  send(id: string, channel: 'whatsapp' | 'email', message?: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/quotes/${id}/send`, { channel, ...(message ? { message } : {}) });
  }

  pdf(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/quotes/${id}/pdf`, { responseType: 'blob' });
  }
}
