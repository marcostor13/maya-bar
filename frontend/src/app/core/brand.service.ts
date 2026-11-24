import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { currentHost, isCustomDomain, markPanelDomain } from '../shared/custom-domain';

export interface Brand {
  appName: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  /** El usuario en sesión administra una agencia (HU72). */
  agency?: boolean;
}

export const MAYA: Brand = { appName: 'Maya CRM' };

/**
 * Marca blanca del panel (HU72). En el dominio propio de una agencia, o
 * dentro de una de sus sub-cuentas, el panel muestra su nombre, logo y color
 * en lugar de los de Maya.
 */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private http = inject(HttpClient);
  readonly brand = signal<Brand>(MAYA);
  readonly custom = computed(() => this.brand().appName !== MAYA.appName);
  readonly logo = computed(() => this.brand().logo || (this.custom() ? '' : '/logo.png?v=2'));
  readonly agency = computed(() => !!this.brand().agency);

  /** Al arrancar: si el host es el panel de una agencia, carga su marca. */
  async initFromHost(): Promise<void> {
    if (!isCustomDomain()) return;
    try {
      const b = await firstValueFrom(
        this.http.get<Brand>(`${environment.apiUrl}/public/white-label`, { params: { host: currentHost() } }),
      );
      markPanelDomain();
      this.apply(b);
    } catch {
      /* dominio de una landing de evento (HU25): sin marca propia */
    }
  }

  /** Con sesión: la marca de la agencia de la empresa activa. */
  loadForSession(): void {
    this.http.get<Brand>(`${environment.apiUrl}/agency/brand`).subscribe({
      next: (b) => this.apply(b),
      error: () => undefined,
    });
  }

  apply(b: Brand): void {
    this.brand.set(b);
    if (typeof document === 'undefined') return;
    if (b.appName !== MAYA.appName) document.title = b.appName;
    const root = document.documentElement.style;
    if (b.primaryColor) root.setProperty('--color-brand', b.primaryColor);
    else root.removeProperty('--color-brand');
    if (b.favicon) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = b.favicon;
    }
  }
}
