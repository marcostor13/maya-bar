import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlatformModule {
  key: string;
  label: string;
  group: string;
  route: string;
}

export interface TenantRole {
  _id: string;
  key: string;
  label: string;
  modules: string[];
  /** módulo → acciones permitidas. Sin entrada = todas. */
  actions?: Record<string, string[]>;
  isSystem: boolean;
  /** Cuántos usuarios lo tienen; el backend lo calcula al listar. */
  userCount?: number;
}

export interface ModuleActionDef {
  key: string;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  catalog(): Observable<{ modules: PlatformModule[]; actions: ModuleActionDef[] }> {
    return this.http.get<{ modules: PlatformModule[]; actions: ModuleActionDef[] }>(
      `${this.base}/roles/catalog`,
    );
  }

  list(): Observable<TenantRole[]> {
    return this.http.get<TenantRole[]>(`${this.base}/roles`);
  }

  update(
    key: string,
    modules: string[],
    actions: Record<string, string[]>,
  ): Observable<TenantRole> {
    return this.http.patch<TenantRole>(`${this.base}/roles/${key}`, {
      modules,
      actions,
    });
  }

  create(label: string): Observable<TenantRole> {
    return this.http.post<TenantRole>(`${this.base}/roles`, { label });
  }

  remove(key: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/roles/${key}`);
  }
}
