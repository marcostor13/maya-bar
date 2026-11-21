import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Globe, RefreshCw, Trash2, ExternalLink, Copy } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface LandingDomainRow {
  _id: string;
  domain: string;
  eventId: string | null;
  status: 'pending' | 'dns_ok' | 'activating' | 'active';
  checkMessage?: string;
  txtName?: string;
  txtValue?: string;
}

interface DomainsResponse {
  cnameTarget: string;
  serverIp: string;
  selfService: boolean;
  canManage?: boolean;
  domains: LandingDomainRow[];
}

const STATUS: Record<LandingDomainRow['status'], { label: string; badge: string }> = {
  active: { label: 'Activo', badge: 'badge-success' },
  activating: { label: 'Activando', badge: 'badge-info' },
  dns_ok: { label: 'DNS correcto', badge: 'badge-warning' },
  pending: { label: 'Pendiente de DNS', badge: 'badge-neutral' },
};

/** Dominio propio de la landing del evento (HU25). */
@Component({
  selector: 'app-event-domain-card',
  standalone: true,
  imports: [LucideAngularModule, RouterLink],
  template: `
    <section class="card dom-card" aria-labelledby="dom-title">
      <div class="dom-head">
        <h3 id="dom-title"><lucide-icon [img]="Globe" [size]="18"></lucide-icon> Dominio propio</h3>
        <span class="muted">La landing en tu dominio, p. ej. <strong>fiesta.tuempresa.com</strong></span>
      </div>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (loadError()) {
        <p class="muted" role="alert">No se pudieron cargar los dominios.
          <button type="button" class="btn btn-ghost btn-sm" (click)="load()">Reintentar</button></p>
      } @else {
        @for (d of domains(); track d._id) {
          <div class="dom-row">
            <div class="dom-main">
              <span class="dom-name">
                @if (d.status === 'active') {
                  <a [href]="'https://' + d.domain" target="_blank" rel="noopener">{{ d.domain }}
                    <lucide-icon [img]="ExternalLink" [size]="13"></lucide-icon></a>
                } @else { {{ d.domain }} }
              </span>
              <span [class]="'badge ' + status(d).badge">{{ status(d).label }}</span>
            </div>
            @if (d.checkMessage && d.status !== 'active') {
              <p class="dom-msg">{{ d.checkMessage }}</p>
            }
            @if (canManage()) {
            <div class="dom-actions">
              @if (d.status !== 'active') {
                <button type="button" class="btn btn-secondary btn-sm" (click)="verify(d)" [disabled]="busy() === d._id">
                  <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon> {{ busy() === d._id ? 'Verificando…' : 'Verificar' }}
                </button>
              }
              <button type="button" class="btn btn-ghost btn-sm" (click)="remove(d)" [disabled]="busy() === d._id"
                [attr.aria-label]="'Quitar ' + d.domain">
                <lucide-icon [img]="Trash2" [size]="14"></lucide-icon> Quitar
              </button>
            </div>
            }
          </div>
        }

        @if (!domains().length && !canManage()) {
          <p class="muted">Pide a un administrador o a marketing que conecte el dominio.</p>
        }
        @if (!domains().length && canManage()) {
          <form class="dom-form" (submit)="$event.preventDefault(); add()">
            <input class="input" type="text" inputmode="url" autocomplete="off" spellcheck="false"
              placeholder="fiesta.tuempresa.com" aria-label="Dominio"
              [value]="draft()" (input)="draft.set($any($event.target).value)" />
            <button type="submit" class="btn btn-primary btn-sm" [disabled]="adding() || !draft().trim()">
              {{ adding() ? 'Guardando…' : 'Conectar dominio' }}
            </button>
          </form>
        }

        <div class="dom-help">
          <p><strong>Cómo conectarlo</strong> — en el panel de tu dominio crea uno de estos registros:</p>
          <table>
            <thead><tr><th scope="col">Si usas</th><th scope="col">Tipo</th><th scope="col">Nombre</th><th scope="col">Valor</th></tr></thead>
            <tbody>
              <tr><td>Un subdominio (recomendado)</td><td>CNAME</td><td>{{ subLabel() }}</td>
                <td><code>{{ info()?.cnameTarget }}</code>
                  <button type="button" class="copy" (click)="copy(info()?.cnameTarget)" aria-label="Copiar destino del CNAME">
                    <lucide-icon [img]="Copy" [size]="12"></lucide-icon></button></td></tr>
              <tr><td>El dominio raíz</td><td>A</td><td>&#64;</td>
                <td><code>{{ info()?.serverIp || 'IP del servidor' }}</code>
                  @if (info()?.serverIp) {
                    <button type="button" class="copy" (click)="copy(info()?.serverIp)" aria-label="Copiar IP">
                      <lucide-icon [img]="Copy" [size]="12"></lucide-icon></button>
                  }</td></tr>
              @if (domains()[0]?.txtName; as name) {
                <tr><td>Prueba de propiedad (obligatorio)</td><td>TXT</td><td><code>{{ name }}</code></td>
                  <td><code>{{ domains()[0].txtValue }}</code>
                    <button type="button" class="copy" (click)="copy(domains()[0].txtValue)" aria-label="Copiar valor del TXT">
                      <lucide-icon [img]="Copy" [size]="12"></lucide-icon></button></td></tr>
              }
            </tbody>
          </table>
          <p class="muted">Si usas Cloudflare, deja el registro <strong>sin proxy (nube gris)</strong>. Cuando el DNS propague pulsa «Verificar»: el certificado tarda unos minutos. El evento debe estar publicado.</p>
          <p class="muted brand-hint">El logo y el favicon con que se ve la landing son los de tu empresa:
            se configuran en <a routerLink="/settings">Configuración → Marca de la empresa</a>.</p>
          @if (info() && !info()!.selfService) {
            <p class="muted">En este servidor el alta no es automática: avisa a soporte cuando el DNS esté listo.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .dom-card { padding: 24px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
    .dom-head { display: flex; flex-direction: column; gap: 4px; }
    h3 { margin: 0; font-family: var(--font-heading); font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .muted { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
    .dom-row { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 16px; }
    .dom-main { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .dom-name { font-weight: 600; font-size: 14px; word-break: break-all; }
    .dom-name a { color: var(--color-brand); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
    .dom-msg { margin: 0; font-size: 12.5px; color: var(--color-text-muted); line-height: 1.5; }
    .dom-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .dom-form { display: flex; gap: 8px; flex-wrap: wrap; }
    .brand-hint a { color: var(--color-brand); }
    .dom-form .input { flex: 1 1 220px; min-width: 0; }
    .dom-help { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .dom-help p { margin: 0; }
    .dom-help table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .dom-help th, .dom-help td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--color-border); }
    .dom-help th { font-weight: 600; color: var(--color-text-muted); }
    code { font-size: 12px; background: var(--color-bg-app); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
    .copy { background: none; border: 0; padding: 2px; margin-left: 4px; cursor: pointer; color: var(--color-text-muted); vertical-align: middle; }
    .copy:hover { color: var(--color-brand); }
    @media (max-width: 560px) { .dom-help th:first-child, .dom-help td:first-child { display: none; } }
  `],
})
export class EventDomainCardComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Globe = Globe; readonly RefreshCw = RefreshCw; readonly Trash2 = Trash2;
  readonly ExternalLink = ExternalLink; readonly Copy = Copy;

  eventId = input.required<string>();

  info = signal<DomainsResponse | null>(null);
  loading = signal(true);
  loadError = signal(false);
  adding = signal(false);
  busy = signal<string | null>(null);
  draft = signal('');

  domains = computed(() => this.info()?.domains ?? []);
  canManage = computed(() => this.info()?.canManage !== false);
  /** Nombre del registro CNAME: lo que va antes del dominio, si lo escribió. */
  subLabel = computed(() => {
    const d = (this.domains()[0]?.domain ?? this.draft()).trim().toLowerCase();
    const parts = d.split('.').filter(Boolean);
    return parts.length > 2 ? parts.slice(0, -2).join('.') : 'fiesta';
  });

  constructor() {
    effect(() => {
      this.eventId();
      this.load();
    });
  }

  status(d: LandingDomainRow) { return STATUS[d.status] ?? STATUS.pending; }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.http.get<DomainsResponse>(`${API}/landing-domains`, { params: { eventId: this.eventId() } }).subscribe({
      next: (r) => { this.info.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  async add() {
    const domain = this.draft().trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    this.adding.set(true);
    try {
      const row = await firstValueFrom(
        this.http.post<LandingDomainRow>(`${API}/landing-domains`, { domain, eventId: this.eventId() }),
      );
      this.replace(row, true);
      this.draft.set('');
      if (row.status === 'active') this.toast.success('Dominio conectado');
      else this.toast.info('Dominio guardado. Crea el registro DNS y pulsa «Verificar».');
    } catch (err: unknown) {
      this.toast.error((err as { error?: { message?: string } }).error?.message || 'No se pudo guardar el dominio');
    } finally {
      this.adding.set(false);
    }
  }

  async verify(d: LandingDomainRow) {
    this.busy.set(d._id);
    try {
      const row = await firstValueFrom(this.http.post<LandingDomainRow>(`${API}/landing-domains/${d._id}/verify`, {}));
      this.replace(row);
      if (row.status === 'active') this.toast.success('Dominio activo');
      else this.toast.warning(row.checkMessage || 'El dominio aún no está listo');
    } catch (err: unknown) {
      this.toast.error((err as { error?: { message?: string } }).error?.message || 'No se pudo verificar');
    } finally {
      this.busy.set(null);
    }
  }

  async remove(d: LandingDomainRow) {
    const ok = await this.confirm.confirm({
      title: 'Quitar dominio',
      message: `La landing dejará de verse en ${d.domain}. Seguirá disponible en el enlace de Maya CRM.`,
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(d._id);
    try {
      await firstValueFrom(this.http.delete(`${API}/landing-domains/${d._id}`));
      const info = this.info();
      if (info) this.info.set({ ...info, domains: info.domains.filter((x) => x._id !== d._id) });
      this.toast.success('Dominio quitado');
    } catch (err: unknown) {
      this.toast.error((err as { error?: { message?: string } }).error?.message || 'No se pudo quitar el dominio');
    } finally {
      this.busy.set(null);
    }
  }

  async copy(text?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copiado');
    } catch {
      this.toast.error('No se pudo copiar');
    }
  }

  private replace(row: LandingDomainRow, append = false) {
    const info = this.info();
    if (!info) return;
    const exists = info.domains.some((x) => x._id === row._id);
    this.info.set({
      ...info,
      domains: exists ? info.domains.map((x) => (x._id === row._id ? row : x)) : append ? [...info.domains, row] : info.domains,
    });
  }
}
