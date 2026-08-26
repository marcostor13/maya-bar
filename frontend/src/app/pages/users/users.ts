import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RolesMatrixComponent } from './roles-matrix';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

interface TenantUser {
  _id: string;
  name?: string;
  email: string;
  role: string;
  isActive: boolean;
  localIds?: string[];
  mustChangePassword: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  HOST: 'Hostess',
  SERVER: 'Mesero',
  KITCHEN: 'Cocina',
  BAR: 'Bar',
  MARKETING: 'Marketing',
  IMPULSADOR: 'Impulsador',
};

/** Lo que devuelve `GET /users/:id/impact`. */
interface DeletionImpact {
  userId: string;
  name: string;
  email: string;
  role: string;
  items: { collection: string; label: string; count: number }[];
  total: number;
}

const STAFF_ROLES = ['TENANT_ADMIN', 'MANAGER', 'HOST', 'SERVER', 'KITCHEN', 'BAR', 'MARKETING', 'IMPULSADOR'];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, RolesMatrixComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Usuarios</h1>
          <p class="page-sub">Gestiona el equipo de tu empresa y lo que ve cada rol</p>
        </div>
        @if (tab() === 'users') {
          <button class="btn btn-primary" (click)="openCreate()">+ Nuevo usuario</button>
        }
      </div>

      <div class="tabs-row">
        <button class="tab-btn" [class.active]="tab() === 'users'" (click)="tab.set('users')">
          Equipo
        </button>
        <button class="tab-btn" [class.active]="tab() === 'roles'" (click)="tab.set('roles')">
          Roles y accesos
        </button>
      </div>

      @if (tab() === 'roles') {
        <app-roles-matrix />
      } @else if (loading()) {
        <p class="loading-msg">Cargando…</p>
      } @else if (users().length === 0) {
        <div class="empty-state card">
          <p>No hay usuarios registrados aún.</p>
          <button class="btn btn-primary" (click)="openCreate()">Crear primer usuario</button>
        </div>
      } @else {
        <div class="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Locales</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u._id) {
                <tr [class.row-inactive]="!u.isActive">
                  <td class="td-name">
                    {{ u.name || '—' }}
                    @if (u.mustChangePassword) {
                      <span class="badge-warning" title="Contraseña temporal">Temp</span>
                    }
                  </td>
                  <td data-label="Email">{{ u.email }}</td>
                  <td data-label="Rol">{{ roleLabel(u.role) }}</td>
                  <td data-label="Locales" class="td-locals">{{ localsLabel(u) }}</td>
                  <td data-label="Estado">
                    <span [class]="u.isActive ? 'badge-success' : 'badge-neutral'">
                      {{ u.isActive ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="actions">
                    @if (u.role !== 'TENANT_ADMIN') {
                      <button class="btn btn-ghost btn-sm" (click)="openEdit(u)">Editar</button>
                      @if (u.isActive) {
                        <button class="btn btn-danger btn-sm" (click)="deactivate(u)">Desactivar</button>
                        <button class="btn btn-ghost btn-sm danger-text" (click)="openDelete(u)"
                          title="Eliminar definitivamente">Eliminar</button>
                      } @else {
                        <button class="btn btn-secondary btn-sm" (click)="activate(u)">Activar</button>
                        <button class="btn btn-ghost btn-sm danger-text" (click)="openDelete(u)"
                          title="Eliminar definitivamente">Eliminar</button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Drawer: create / edit -->
    @if (showDrawer()) {
      <div class="overlay" (click)="closeDrawer()">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2>{{ editingUser() ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
            <button class="btn btn-ghost btn-icon" (click)="closeDrawer()">✕</button>
          </div>

          <form (ngSubmit)="save()" #f="ngForm" class="drawer-form">
            <div class="field">
              <label>Nombre</label>
              <input class="input" name="name" [(ngModel)]="form.name" placeholder="Nombre completo" />
            </div>

            @if (!editingUser()) {
              <div class="field">
                <label>Email *</label>
                <input class="input" name="email" [(ngModel)]="form.email" type="email" required placeholder="correo@empresa.com" />
              </div>
            }

            <div class="field">
              <label>Rol *</label>
              <select class="input" name="role" [(ngModel)]="form.role" required>
                @for (r of availableRoles(); track r.key) {
                  <option [value]="r.key">{{ r.label }}</option>
                }
              </select>
            </div>

            @if (locals().length > 0) {
              <div class="field">
                <label>Locales</label>
                <p class="field-hint">
                  Sin ninguno marcado, el usuario accede a todos los locales de la
                  empresa. Marca alguno para limitarlo.
                </p>
                <div class="locals-grid">
                  @for (l of locals(); track l._id) {
                    <label class="local-chip" [class.on]="form.localIds.includes(l._id)">
                      <input type="checkbox" [checked]="form.localIds.includes(l._id)"
                        (change)="toggleLocal(l._id)" />
                      <span>{{ l.name }}</span>
                    </label>
                  }
                </div>
              </div>
            }

            @if (formError()) {
              <p class="form-error">{{ formError() }}</p>
            }

            <div class="drawer-actions">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()">Cancelar</button>
              <button class="btn btn-primary" type="submit" [disabled]="saving() || !f.valid">
                {{ saving() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: temp password revealed after creation -->
    @if (createdCredentials()) {
      <div class="overlay">
        <div class="modal card">
          <h2>Usuario creado</h2>
          <p class="modal-sub">Comparte estas credenciales con el usuario. La contraseña solo se muestra una vez.</p>

          <div class="cred-block">
            <div class="cred-row">
              <span class="cred-label">Email</span>
              <span class="cred-val">{{ createdCredentials()!.email }}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Contraseña temporal</span>
              <span class="cred-val cred-pass">{{ createdCredentials()!.tempPassword }}</span>
            </div>
          </div>

          <p class="cred-note">El usuario deberá cambiar la contraseña al iniciar sesión por primera vez.</p>

          <button class="btn btn-primary" (click)="createdCredentials.set(null)">Entendido</button>
        </div>
      </div>
    }

    <!-- ── Eliminar definitivamente ── -->
    @if (deleting(); as target) {
      <div class="overlay" (click)="closeDelete()" role="dialog" aria-modal="true"
        aria-label="Eliminar usuario">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Eliminar a {{ target.name || target.email }}</h3>
              <p class="modal-sub">
                Esta acción no se puede deshacer. Desactivar, en cambio, conserva
                el usuario y todo su contenido.
              </p>
            </div>
          </div>

          <div class="modal-body">
            @if (impactLoading()) {
              <p class="muted">Calculando qué tiene asociado…</p>
            } @else if (impact(); as imp) {
              @if (imp.total === 0) {
                <p class="muted">Este usuario no tiene contenido asociado.</p>
              } @else {
                <p class="impact-lead">
                  Tiene <strong>{{ imp.total }}</strong> registro(s) asociados:
                </p>
                <ul class="impact-list">
                  @for (item of imp.items; track item.collection) {
                    <li><span>{{ item.label }}</span><strong>{{ item.count }}</strong></li>
                  }
                </ul>

                <label class="field-label" for="reassign">¿Qué hacemos con ellos?</label>
                <select id="reassign" class="select" [(ngModel)]="reassignTo" name="reassign">
                  <option value="">Dejarlos a nivel de empresa (los verán los administradores)</option>
                  @for (c of candidates(); track c._id) {
                    <option [value]="c._id">Reasignar a {{ c.name || c.email }}</option>
                  }
                </select>
              }
            }
            @if (deleteError()) { <p class="form-error">{{ deleteError() }}</p> }
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeDelete()">Cancelar</button>
            <button class="btn btn-danger" (click)="confirmDelete()"
              [disabled]="impactLoading() || deletingBusy()">
              {{ deletingBusy() ? 'Eliminando…' : 'Eliminar definitivamente' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .locals-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .local-chip { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-pill);
      font-size: 13px; font-weight: 600; color: var(--color-text-muted); cursor: pointer;
      transition: all .2s; }
    .local-chip:hover { border-color: var(--color-brand); }
    .local-chip.on { background: var(--color-brand-light); border-color: var(--color-brand);
      color: var(--color-brand); }
    .local-chip input { accent-color: var(--color-brand); cursor: pointer; }
    .field-hint { font-size: 12px; color: var(--color-text-muted); margin: 0 0 8px; line-height: 1.5; }
    .td-locals { font-size: 13px; color: var(--color-text-muted); }

    .danger-text { color: var(--color-error); }
    .danger-text:hover { background: #FEF2F2; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); display: flex; align-items: center;
      justify-content: center; z-index: 120; }
    .modal-card { background: #fff; border-radius: var(--radius-lg);
      width: calc(100% - 48px); max-width: 520px; box-shadow: var(--shadow-lg); overflow: hidden; }
    .modal-header { padding: 24px 28px 14px; border-bottom: 1px solid var(--color-border); }
    .modal-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 6px; }
    .modal-sub { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.55; }
    .modal-body { padding: 20px 28px; }
    .impact-lead { margin: 0 0 10px; font-size: 14px; }
    .impact-list { list-style: none; margin: 0 0 20px; padding: 0;
      border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
    .impact-list li { display: flex; justify-content: space-between; gap: 12px;
      padding: 9px 14px; font-size: 13.5px; border-bottom: 1px solid var(--color-border); }
    .impact-list li:last-child { border-bottom: none; }
    .impact-list li:nth-child(odd) { background: var(--color-bg-app); }
    .impact-list strong { font-variant-numeric: tabular-nums; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 28px 22px; }
    .muted { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .tabs-row { display: flex; gap: 8px; margin-bottom: 20px; }
    .tab-btn { padding: 8px 18px; border-radius: var(--radius-pill);
      border: 1px solid var(--color-border); background: #fff; font-size: 13px;
      font-weight: 600; color: var(--color-text-muted); cursor: pointer;
      transition: all .2s; }
    .tab-btn:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .tab-btn.active { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }

    :host { display: block; width: 100%; }
    .page {
      width: 100%;
      box-sizing: border-box;
      padding: 32px 40px;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 28px;
    }

    h1 {
      font-family: var(--font-heading);
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-main);
      margin: 0 0 4px;
    }

    .page-sub {
      font-size: 14px;
      color: var(--color-text-muted);
      margin: 0;
    }

    .loading-msg {
      color: var(--color-text-muted);
      font-size: 14px;
    }

    .empty-state {
      padding: 48px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      color: var(--color-text-muted);
    }

    table { width: 100%; border-collapse: collapse; }

    th {
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
      padding: 10px 14px;
      border-bottom: 1px solid var(--color-border);
    }

    td {
      padding: 12px 14px;
      font-size: 14px;
      color: var(--color-text-main);
      border-bottom: 1px solid var(--color-border);
      vertical-align: middle;
    }

    tr:last-child td { border-bottom: none; }

    .row-inactive td { opacity: 0.5; }

    .actions { display: flex; gap: 8px; justify-content: flex-end; }

    .badge-warning {
      display: inline-block;
      margin-left: 6px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: #FEF3C7;
      color: #92400E;
    }

    /* Overlay / Drawer */
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      height: 100%;
      width: 400px;
      background: var(--color-white);
      box-shadow: -4px 0 24px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      animation: slideIn var(--transition-spring) both;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--color-border);
    }

    .drawer-header h2 {
      font-family: var(--font-heading);
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      color: var(--color-text-main);
    }

    .drawer-form {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      flex: 1;
      overflow-y: auto;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-main);
    }

    .form-error {
      font-size: 13px;
      color: var(--color-error);
      margin: 0;
    }

    .drawer-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: auto;
      padding-top: 16px;
    }

    /* Modal */
    .modal {
      width: calc(100% - 48px);
      max-width: 440px;
      padding: 28px 32px;
    }

    .modal h2 {
      font-family: var(--font-heading);
      font-size: 20px;
      font-weight: 700;
      color: var(--color-text-main);
      margin: 0 0 8px;
    }

    .modal-sub {
      font-size: 13px;
      color: var(--color-text-muted);
      margin: 0 0 20px;
    }

    .cred-block {
      background: var(--color-bg-light);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cred-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .cred-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }

    .cred-val {
      font-size: 15px;
      color: var(--color-text-main);
      font-weight: 500;
    }

    .cred-pass {
      font-family: monospace;
      font-size: 18px;
      color: var(--color-brand);
      letter-spacing: 0.08em;
    }

    .cred-note {
      font-size: 12px;
      color: var(--color-text-muted);
      margin: 0 0 20px;
    }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 24px; }
      .page-header .btn { width: 100%; }

      table thead { display: none; }
      table, tbody { display: block; width: 100%; }
      tr { display: block; padding: 14px; border-bottom: 1px solid var(--color-border); }
      tr:last-child { border-bottom: none; }
      td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: none; }
      td.td-name { display: block; font-size: 15px; font-weight: 600; padding: 0 0 8px; }
      td:not(.td-name)::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
      .actions { justify-content: flex-end; flex-wrap: wrap; padding-top: 10px; }

      .drawer { width: 100%; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      h1 { font-size: 22px; }
      .modal { padding: 20px; }
      .cred-val { word-break: break-all; }
    }
  `],
})
export class UsersComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  private readonly api = environment.apiUrl + '/users';

  users = signal<TenantUser[]>([]);
  tab = signal<'users' | 'roles'>('users');
  loading = signal(true);
  showDrawer = signal(false);
  saving = signal(false);
  formError = signal('');
  editingUser = signal<TenantUser | null>(null);
  createdCredentials = signal<{ email: string; tempPassword: string } | null>(null);

  staffRoles = STAFF_ROLES;

  /** Roles configurados por la empresa; incluye los propios que haya creado. */
  availableRoles = signal<{ key: string; label: string }[]>(
    STAFF_ROLES.map((key) => ({ key, label: ROLE_LABELS[key] ?? key })),
  );
  locals = signal<{ _id: string; name: string }[]>([]);

  private loadRolesAndLocals() {
    this.http.get<{ key: string; label: string }[]>(`${environment.apiUrl}/roles`).subscribe({
      next: (roles) => {
        if (roles.length) {
          this.availableRoles.set(roles.map((r) => ({ key: r.key, label: r.label })));
        }
      },
      // Con la lista del sistema se puede seguir trabajando.
      error: () => undefined,
    });
    this.http.get<{ _id: string; name: string }[]>(`${environment.apiUrl}/locals`).subscribe({
      next: (list) => this.locals.set(list),
      error: () => this.locals.set([]),
    });
  }

  toggleLocal(id: string) {
    const i = this.form.localIds.indexOf(id);
    if (i >= 0) this.form.localIds.splice(i, 1);
    else this.form.localIds.push(id);
  }

  /** Vacío significa todos: es como estaban todos los usuarios hasta ahora. */
  localsLabel(u: TenantUser): string {
    const ids = u.localIds ?? [];
    if (!ids.length) return 'Todos';
    const names = ids
      .map((id) => this.locals().find((l) => l._id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : `${ids.length} local(es)`;
  }

  /** `localIds` vacío significa "todos los locales de la empresa". */
  form: { name: string; email: string; role: string; localIds: string[] } = {
    name: '',
    email: '',
    role: 'SERVER',
    localIds: [],
  };

  roleLabel(role: string) {
    return ROLE_LABELS[role] ?? role;
  }

  ngOnInit() {
    this.loadRolesAndLocals();
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.http.get<TenantUser[]>(this.api).subscribe({
      next: (users) => { this.users.set(users); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Error al cargar usuarios'); },
    });
  }

  openCreate() {
    this.editingUser.set(null);
    this.form = { name: '', email: '', role: 'SERVER', localIds: [] as string[] };
    this.formError.set('');
    this.showDrawer.set(true);
  }

  openEdit(u: TenantUser) {
    this.editingUser.set(u);
    this.form = { name: u.name || '', email: u.email, role: u.role, localIds: [...(u.localIds ?? [])] };
    this.formError.set('');
    this.showDrawer.set(true);
  }

  closeDrawer() {
    this.showDrawer.set(false);
  }

  save() {
    this.formError.set('');
    this.saving.set(true);
    const editing = this.editingUser();

    if (editing) {
      this.http.patch<TenantUser>(`${this.api}/${editing._id}`, {
        name: this.form.name,
        role: this.form.role,
        localIds: this.form.localIds,
      }).subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.users.update((list) => list.map((u) => (u._id === editing._id ? { ...u, ...updated } : u)));
          this.showDrawer.set(false);
          this.toast.success('Usuario actualizado');
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.error?.message || 'Error al actualizar');
          this.toast.error(err.error?.message || 'Error al actualizar');
        },
      });
    } else {
      this.http.post<{ user: TenantUser; tempPassword: string }>(this.api, this.form).subscribe({
        next: (res) => {
          this.saving.set(false);
          this.users.update((list) => [res.user, ...list]);
          this.showDrawer.set(false);
          this.createdCredentials.set({ email: res.user.email, tempPassword: res.tempPassword });
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.error?.message || 'Error al crear usuario');
          this.toast.error(err.error?.message || 'Error al crear usuario');
        },
      });
    }
  }

  // ── Eliminar definitivamente ──

  deleting = signal<TenantUser | null>(null);
  impact = signal<DeletionImpact | null>(null);
  impactLoading = signal(false);
  candidates = signal<TenantUser[]>([]);
  deletingBusy = signal(false);
  deleteError = signal('');
  reassignTo = '';

  openDelete(u: TenantUser) {
    this.deleting.set(u);
    this.impact.set(null);
    this.deleteError.set('');
    this.reassignTo = '';
    this.impactLoading.set(true);

    this.http.get<DeletionImpact>(`${this.api}/${u._id}/impact`).subscribe({
      next: (imp) => {
        this.impact.set(imp);
        this.impactLoading.set(false);
      },
      error: (err) => {
        this.impactLoading.set(false);
        this.deleteError.set(err.error?.message || 'No se pudo calcular el impacto');
      },
    });

    this.http.get<TenantUser[]>(`${this.api}/${u._id}/reassign-candidates`).subscribe({
      next: (list) => this.candidates.set(list),
      error: () => this.candidates.set([]),
    });
  }

  closeDelete() {
    this.deleting.set(null);
  }

  confirmDelete() {
    const target = this.deleting();
    if (!target) return;

    this.deletingBusy.set(true);
    this.deleteError.set('');
    const params = new URLSearchParams({ mode: 'delete' });
    if (this.reassignTo) params.set('reassignTo', this.reassignTo);

    this.http.delete<{ reassigned: number }>(`${this.api}/${target._id}?${params}`).subscribe({
      next: (res) => {
        this.deletingBusy.set(false);
        this.deleting.set(null);
        this.users.update((list) => list.filter((x) => x._id !== target._id));
        this.toast.success(
          res.reassigned > 0
            ? `Usuario eliminado; ${res.reassigned} registro(s) ${this.reassignTo ? 'reasignados' : 'liberados'}`
            : 'Usuario eliminado',
        );
      },
      error: (err) => {
        this.deletingBusy.set(false);
        const msg = err.error?.message || 'No se pudo eliminar el usuario';
        this.deleteError.set(msg);
        this.toast.error(msg);
      },
    });
  }

  async deactivate(u: TenantUser) {
    const ok = await this.confirm.confirm({
      title: 'Desactivar usuario',
      message: `¿Desactivar a ${u.name || u.email}? El usuario no podrá iniciar sesión.`,
      confirmText: 'Desactivar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${this.api}/${u._id}`).subscribe({
      next: () => {
        this.users.update((list) => list.map((x) => (x._id === u._id ? { ...x, isActive: false } : x)));
        this.toast.success('Usuario desactivado');
      },
      error: () => this.toast.error('Error al desactivar usuario'),
    });
  }

  activate(u: TenantUser) {
    this.http.patch<TenantUser>(`${this.api}/${u._id}`, { isActive: true }).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((x) => (x._id === u._id ? { ...x, ...updated } : x)));
        this.toast.success('Usuario activado');
      },
      error: () => this.toast.error('Error al activar usuario'),
    });
  }
}
