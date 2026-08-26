import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Campos del contacto a los que se puede mapear una columna del origen. */
export type TargetField = 'name' | 'email' | 'phone' | 'tags' | 'notes';

export type DedupeKey = 'email' | 'phone' | 'both';

export interface ImportMapping {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string;
  notes?: string;
}

export interface ImportOptions {
  mapping: ImportMapping;
  dedupeBy?: DedupeKey;
  tags?: string[];
  updateExisting?: boolean;
  keepUnmapped?: boolean;
  /** Columnas del origen que se guardan como campos adicionales del contacto. */
  customFields?: string[];
}

/** Resultado del análisis previo: lo que alimenta la pantalla de mapeo. */
export interface AnalyzeResult {
  columns: string[];
  samples: Record<string, string[]>;
  totalRows: number;
  suggested: Record<string, string>;
}

export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  sourceId?: string;
}

export interface MongoConnection {
  uri: string;
  database: string;
  collection: string;
  filter?: Record<string, unknown>;
}

/** Conexión guardada, tal como la devuelve el backend (nunca incluye la URI). */
export interface ContactSource {
  _id: string;
  label: string;
  host: string;
  database: string;
  collection: string;
  mapping: ImportMapping;
  tags: string[];
  lastRunAt?: string;
  lastImported: number;
  lastUpdated: number;
  lastError?: string;
}

@Injectable({ providedIn: 'root' })
export class ContactImportApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/customers/import`;

  analyzeFile(file: File): Observable<AnalyzeResult> {
    return this.http.post<AnalyzeResult>(`${this.base}/file/analyze`, this.body(file));
  }

  importFile(file: File, options: ImportOptions): Observable<ImportResult> {
    const form = this.body(file);
    form.append('options', JSON.stringify(options));
    return this.http.post<ImportResult>(`${this.base}/file`, form);
  }

  analyzeMongo(conn: MongoConnection): Observable<AnalyzeResult> {
    return this.http.post<AnalyzeResult>(`${this.base}/mongo/analyze`, conn);
  }

  importMongo(
    conn: MongoConnection & { options: ImportOptions; saveAs?: string; sourceId?: string },
  ): Observable<ImportResult> {
    return this.http.post<ImportResult>(`${this.base}/mongo`, conn);
  }

  listSources(): Observable<ContactSource[]> {
    return this.http.get<ContactSource[]>(`${this.base}/sources`);
  }

  runSource(id: string): Observable<ImportResult> {
    return this.http.post<ImportResult>(`${this.base}/sources/${id}/run`, {});
  }

  deleteSource(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sources/${id}`);
  }

  private body(file: File): FormData {
    const form = new FormData();
    form.append('file', file, file.name);
    return form;
  }
}
