import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, KeyRound, Users, RotateCw } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { ResetAccessDialogComponent } from '../users/reset-access-dialog';
import { UserDeleteDialogComponent } from '../users/user-delete-dialog';
import { UserAuditComponent } from '../users/user-audit';
import { ROLE_LABELS } from '../users/role-labels';
import { environment } from '../../../environments/environment';

interface PlatformUser {
  _id: string;
  name?: string;
  email: string;
  role: string;
  isActive: boolean;
  tenantId: string;
  tenantName?: string;
  lastAccessAt?: string;
}


/** Superadmin: buscar a cualquier usuario de la plataforma y gestionar su acceso. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule, ResetAccessDialogComponent, UserDeleteDialogComponent, UserAuditComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Usuarios</h1>
          <p class="subtitle">Busca a cualquier usuario de la plataforma para gestionar su acceso.</p>
        </div>
      </div>

      <div class="tabs-row">
        <button class="tab-btn" [class.active]="tab() === 'search'" (click)="tab.set('search')">Buscar</button>
        <button class="tab-btn" [class.active]="tab() === 'audit'" (click)="tab.set('audit')">Registro</button>
      </div>

      @if (tab() === 'audit') {
        <app-user-audit [url]="api + '/audit'" [roleLabels]="roleLabels" />
      } @else {
        <form class="search" (ngSubmit)="search()">
          <lucide-icon [img]="Search" [size]="16" [strokeWidth]="2.2"></lucide-icon>
          <input class="input" type="search" name="q" [(ngModel)]="q" placeholder="Correo o nombre (mínimo 2 letras)"
            aria-label="Buscar usuarios de la plataforma" />
          <button class="btn btn-primary" type="submit" [disabled]="q.trim().length < 2 || loading()">Buscar</button>
        </form>

        @if (loading()) {
          <p class="muted">Buscando…</p>
        } @else if (searchError()) {
          <div class="card empty" role="alert">
            <p>No se pudo completar la búsqueda.</p>
            <button class="btn btn-secondary btn-sm" (click)="search()">
              <lucide-icon [img]="RotateCw" [size]="14"></lucide-icon> Reintentar
            </button>
          </div>
        } @else if (searched() && results().length === 0) {
          <div class="card empty">
            <lucide-icon [img]="Users" [size]="28" [strokeWidth]="1.8"></lucide-icon>
            <p>Ningún usuario coincide con "{{ lastQuery() }}".</p>
          </div>
        } @else if (results().length) {
          <div class="table-wrap card">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Email</th><th>Empresa</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                @for (u of results(); track u._id) {
                  <tr [class.row-inactive]="!u.isActive">
                    <td data-label="Nombre">{{ u.name || '—' }}</td>
                    <td data-label="Email">{{ u.email }}</td>
                    <td data-label="Empresa" class="td-tenant">{{ u.tenantName || '—' }}</td>
                    <td data-label="Rol">{{ roleLabels[u.role] || u.role }}</td>
                    <td data-label="Último acceso" class="td-access">
                      {{ u.lastAccessAt ? (u.lastAccessAt | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}
                    </td>
                    <td data-label="Estado">
                      <span [class]="u.isActive ? 'badge-success' : 'badge-neutral'">{{ u.isActive ? 'Activo' : 'Inactivo' }}</span>
                    </td>
                    <td class="actions">
                      <button class="btn btn-ghost btn-sm" (click)="resetting.set(u)">
                        <lucide-icon [img]="KeyRound" [size]="14" [strokeWidth]="2.3"></lucide-icon> Restablecer
                      </button>
                      @if (u.isActive) {
                        <button class="btn btn-danger btn-sm" (click)="setActive(u, false)">Desactivar</button>
                      } @else {
                        <button class="btn btn-secondary btn-sm" (click)="setActive(u, true)">Activar</button>
                      }
                      <button class="btn btn-ghost btn-sm danger-text" (click)="deleting.set(u)">Eliminar</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    @if (resetting(); as target) {
      <app-reset-access-dialog [user]="target" [apiBase]="api" (closed)="resetting.set(null)" />
    }
    @if (deleting(); as target) {
      <app-user-delete-dialog [user]="target" [apiBase]="api" (deleted)="onDeleted($event)" (closed)="deleting.set(null)" />
    }
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .tabs-row { display: flex; gap: 8px; margin-bottom: 20px; }
    .tab-btn { padding: 8px 18px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border);
      background: var(--color-white); font-size: 14px; font-weight: 600; color: var(--color-text-muted); cursor: pointer; }
    .tab-btn.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .search { position: relative; display: flex; gap: 10px; align-items: center; margin-bottom: 20px; max-width: 640px; }
    .search lucide-icon { position: absolute; left: 14px; color: var(--color-text-muted); pointer-events: none; }
    .search .input { padding-left: 38px; flex: 1; }
    .muted { color: var(--color-text-muted); font-size: 14px; }
    .empty { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px;
      color: var(--color-text-muted); text-align: center; }
    .empty p { margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
      color: var(--color-text-muted); padding: 10px 14px; border-bottom: 1px solid var(--color-border); }
    td { padding: 12px 14px; font-size: 14px; color: var(--color-text-main); border-bottom: 1px solid var(--color-border); }
    tr:last-child td { border-bottom: none; }
    .row-inactive td { opacity: .6; }
    .td-tenant { font-weight: 600; }
    .td-access { font-size: 13px; color: var(--color-text-muted); white-space: nowrap; }
    .actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .actions .btn { display: inline-flex; align-items: center; gap: 4px; }
    .danger-text { color: var(--color-error); }
    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .search { flex-wrap: wrap; }
      .search .btn { width: 100%; }
      table thead { display: none; }
      table, tbody { display: block; width: 100%; }
      tr { display: block; padding: 12px 14px; border-bottom: 1px solid var(--color-border); }
      td { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: none; }
      td[data-label]::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .06em; color: var(--color-text-muted); }
      .actions { justify-content: flex-start; padding-top: 8px; }
    }
  `],
})
export class AdminUsersComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly api = environment.apiUrl + '/admin/users';
  readonly Search = Search;
  readonly KeyRound = KeyRound;
  readonly Users = Users;
  readonly RotateCw = RotateCw;
  searchError = signal(false);
  readonly roleLabels = ROLE_LABELS;

  tab = signal<'search' | 'audit'>('search');
  q = '';
  lastQuery = signal('');
  results = signal<PlatformUser[]>([]);
  loading = signal(false);
  searched = signal(false);
  resetting = signal<PlatformUser | null>(null);
  deleting = signal<PlatformUser | null>(null);

  search() {
    const q = this.q.trim();
    if (q.length < 2) return;
    this.loading.set(true);
    this.searchError.set(false);
    this.http.get<PlatformUser[]>(this.api, { params: { q } }).subscribe({
      next: (list) => {
        this.results.set(list);
        this.lastQuery.set(q);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.searchError.set(true);
        this.toast.error(err.error?.message || 'No se pudo buscar');
      },
    });
  }

  async setActive(u: PlatformUser, isActive: boolean) {
    if (!isActive) {
      const ok = await this.confirm.confirm({
        title: 'Desactivar usuario',
        message: `${u.name || u.email} (${u.tenantName ?? 'sin empresa'}) no podrá entrar y se cerrarán sus sesiones.`,
        confirmText: 'Desactivar',
        danger: true,
      });
      if (!ok) return;
    }
    this.http.patch<PlatformUser>(`${this.api}/${u._id}/active`, { isActive }).subscribe({
      next: () => {
        this.results.update((list) => list.map((x) => (x._id === u._id ? { ...x, isActive } : x)));
        this.toast.success(isActive ? 'Usuario activado' : 'Usuario desactivado');
      },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo cambiar el estado'),
    });
  }

  onDeleted(id: string) {
    this.deleting.set(null);
    this.results.update((list) => list.filter((x) => x._id !== id));
  }
}
