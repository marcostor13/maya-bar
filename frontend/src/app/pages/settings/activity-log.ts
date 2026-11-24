import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeft, Download, ScrollText } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';

export interface AuditEntry {
  _id: string;
  action: string;
  actorEmail?: string;
  actorRole?: string;
  resource?: string;
  resourceId?: string;
  success: boolean;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}
interface Page { items: AuditEntry[]; total: number; page: number; limit: number }

/** Nombre legible de cada acción (las desconocidas se muestran tal cual). */
export const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.login_failed': 'Inicio de sesión fallido',
  'auth.2fa_enabled': 'Activó el doble factor',
  'auth.2fa_disabled': 'Desactivó el doble factor',
  'auth.2fa_reset': 'Reinició el doble factor de alguien',
  'auth.2fa_backup_regenerated': 'Generó códigos de respaldo',
  'auth.2fa_policy': 'Cambió la obligación del doble factor',
  'customers.export': 'Exportó contactos',
  'customers.import': 'Importó contactos',
  'customers.deleted': 'Eliminó un contacto',
  'customers.bulk_assigned': 'Asignó contactos en bloque',
  'customers.import_source_deleted': 'Eliminó una fuente de importación',
  'conversations.export': 'Exportó conversaciones',
  'conversations.deleted': 'Eliminó conversaciones',
  'conversations.purged': 'Borró una conversación de la papelera',
  'conversations.trash_emptied': 'Vació la papelera',
  'users.created': 'Creó un usuario',
  'users.updated': 'Modificó un usuario',
  'users.deleted': 'Eliminó un usuario',
  'users.access_reset': 'Restableció el acceso de un usuario',
  'users.sessions_revoked': 'Cerró las sesiones de un usuario',
  'users.admin_transferred': 'Transfirió la administración',
  'roles.created': 'Creó un rol',
  'roles.updated': 'Modificó un rol',
  'roles.deleted': 'Eliminó un rol',
  'channels.connected': 'Conectó un canal',
  'channels.configured': 'Configuró un canal',
  'channels.disconnected': 'Desconectó un canal',
  'api_keys.created': 'Creó una clave de API',
  'api_keys.regenerated': 'Regeneró una clave de API',
  'api_keys.revoked': 'Revocó una clave de API',
  'api_keys.webhook_set': 'Configuró el webhook de una clave',
  'api_keys.webhook_removed': 'Quitó el webhook de una clave',
  'billing.plan_upgrade': 'Subió de plan',
  'billing.plan_downgrade': 'Programó bajar de plan',
  'billing.downgrade_cancelled': 'Canceló la bajada de plan',
  'billing.cancelled': 'Canceló la suscripción',
  'billing.reactivated': 'Reactivó la suscripción',
  'billing.addon_bought': 'Compró un complemento',
  'tenant.updated': 'Modificó los datos de la empresa',
  'audit.export': 'Exportó el registro de actividad',
};
const adminLabel = (a: string) => (a.startsWith('admin.') ? `Soporte de Maya: ${a.slice(6).replace(/[._]/g, ' ')}` : a);
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? adminLabel(a);

/** Configuración → Registro de actividad (HU63): solo el administrador de la empresa. */
@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <a class="back" routerLink="/settings"><lucide-icon [img]="ArrowLeft" [size]="16" /> Configuración</a>
          <h1 class="page-title">Registro de actividad</h1>
          <p class="page-subtitle">Quién hizo qué y cuándo en tu cuenta. Se guarda 12 meses.</p>
        </div>
        <button class="btn btn-secondary" (click)="exportCsv()" [disabled]="exporting()">
          <lucide-icon [img]="Download" [size]="16" /> Exportar CSV
        </button>
      </div>

      <div class="filters card">
        <div class="field"><label for="f-user">Usuario (correo)</label>
          <input id="f-user" class="input" [(ngModel)]="email" placeholder="Todos" (keyup.enter)="search()" /></div>
        <div class="field"><label for="f-action">Acción</label>
          <select id="f-action" class="select" [(ngModel)]="action" (ngModelChange)="search()">
            <option value="">Todas</option>
            @for (a of actions(); track a) { <option [value]="a">{{ label(a) }}</option> }
          </select></div>
        <div class="field"><label for="f-from">Desde</label><input id="f-from" class="input" type="date" [(ngModel)]="from" (ngModelChange)="search()" /></div>
        <div class="field"><label for="f-to">Hasta</label><input id="f-to" class="input" type="date" [(ngModel)]="to" (ngModelChange)="search()" /></div>
      </div>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (!shown().length) {
        <div class="empty card"><lucide-icon [img]="ScrollText" [size]="28" /><p>No hay actividad con estos filtros.</p></div>
      } @else {
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
            <tbody>
              @for (e of shown(); track e._id) {
                <tr>
                  <td data-label="Fecha">{{ e.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td data-label="Usuario">{{ e.actorEmail || '—' }}</td>
                  <td data-label="Acción">
                    <span [class]="e.success ? 'badge-neutral' : 'badge-danger'">{{ label(e.action) }}</span>
                  </td>
                  <td data-label="Detalle" class="detail">{{ detail(e) }}</td>
                  <td data-label="IP" class="mono">{{ e.ip || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span class="muted">{{ total() }} registros</span>
          <button class="btn btn-ghost btn-sm" (click)="go(page() - 1)" [disabled]="page() <= 1">Anterior</button>
          <span class="muted">Página {{ page() }}</span>
          <button class="btn btn-ghost btn-sm" (click)="go(page() + 1)" [disabled]="page() * limit >= total()">Siguiente</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
    .back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-text-muted); text-decoration: none; margin-bottom: 6px; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 16px 20px; margin-bottom: 16px; }
    .field label { display: block; font-size: 12px; font-weight: 500; color: var(--color-text-muted); margin-bottom: 4px; }
    .field .input, .field .select { width: 100%; box-sizing: border-box; }
    .detail { font-size: 13px; color: var(--color-text-muted); max-width: 360px; }
    .mono { font-family: monospace; font-size: 12px; }
    .muted { color: var(--color-text-muted); font-size: 13px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px; color: var(--color-text-muted); }
    .pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
    @media (max-width: 768px) { .page { padding: 20px 16px; } }
  `],
})
export class ActivityLogComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = `${environment.apiUrl}/audit`;
  readonly ArrowLeft = ArrowLeft;
  readonly Download = Download;
  readonly ScrollText = ScrollText;
  readonly limit = 50;

  items = signal<AuditEntry[]>([]);
  actions = signal<string[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(true);
  exporting = signal(false);
  email = '';
  action = '';
  from = '';
  to = '';

  label = actionLabel;

  ngOnInit() {
    this.http.get<string[]>(`${this.base}/actions`).subscribe({ next: (a) => this.actions.set(a), error: () => undefined });
    this.load();
  }

  shown() { return this.items(); }

  private params(): Record<string, string> {
    const p: Record<string, string> = {};
    if (this.email.trim()) p['email'] = this.email.trim();
    if (this.action) p['action'] = this.action;
    if (this.from) p['from'] = this.from;
    if (this.to) p['to'] = this.to;
    return p;
  }

  search() { this.page.set(1); this.load(); }

  go(page: number) { this.page.set(page); this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<Page>(this.base, { params: { ...this.params(), page: String(this.page()), limit: String(this.limit) } }).subscribe({
      next: (r) => { this.items.set(r.items); this.total.set(r.total); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudo cargar la actividad'); },
    });
  }

  detail(e: AuditEntry): string {
    const parts: string[] = [];
    if (e.resource) parts.push(e.resource);
    for (const [k, v] of Object.entries(e.details ?? {})) {
      if (v === null || v === undefined || v === '') continue;
      parts.push(`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
    }
    return parts.join(' · ') || '—';
  }

  exportCsv() {
    this.exporting.set(true);
    this.http.get(`${this.base}/export.csv`, { params: this.params(), responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'actividad.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('Registro exportado');
      },
      error: () => { this.exporting.set(false); this.toast.error('No se pudo exportar el registro'); },
    });
  }
}
