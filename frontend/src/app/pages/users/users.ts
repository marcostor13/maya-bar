import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, KeyRound, Crown, RotateCw } from 'lucide-angular';
import { RolesMatrixComponent } from './roles-matrix';
import { ROLE_LABELS } from './role-labels';
import { ResetAccessDialogComponent } from './reset-access-dialog';
import { UserDeleteDialogComponent } from './user-delete-dialog';
import { TransferAdminDialogComponent } from './transfer-admin-dialog';
import { UserAuditComponent } from './user-audit';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';

interface TenantUser {
  _id: string;
  name?: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  localIds?: string[];
  mustChangePassword: boolean;
  createdAt: string;
  lastAccessAt?: string;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const STAFF_ROLES = ['TENANT_ADMIN', 'MANAGER', 'HOST', 'SERVER', 'KITCHEN', 'BAR', 'MARKETING', 'IMPULSADOR'];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    FormsModule, DatePipe, LucideAngularModule, RolesMatrixComponent, ResetAccessDialogComponent,
    UserDeleteDialogComponent, TransferAdminDialogComponent, UserAuditComponent, FormPageComponent,
  ],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Usuarios</h1>
          <p class="page-sub">Gestiona el equipo de tu empresa y lo que ve cada rol</p>
        </div>
        @if (tab() === 'users') {
          <div class="header-actions">
            <button class="btn btn-secondary" (click)="transferOpen.set(true)">
              <lucide-icon [img]="Crown" [size]="16" [strokeWidth]="2.3"></lucide-icon> Traspasar administración
            </button>
            <button class="btn btn-primary" (click)="openCreate()">+ Nuevo usuario</button>
          </div>
        }
      </div>

      <div class="tabs-row">
        <button class="tab-btn" [class.active]="tab() === 'users'" (click)="tab.set('users')">
          Equipo
        </button>
        <button class="tab-btn" [class.active]="tab() === 'roles'" (click)="tab.set('roles')">
          Roles y accesos
        </button>
        <button class="tab-btn" [class.active]="tab() === 'audit'" (click)="tab.set('audit')">
          Registro
        </button>
      </div>

      @if (tab() === 'roles') {
        <app-roles-matrix />
      } @else if (tab() === 'audit') {
        <app-user-audit [url]="api + '/audit'" [roleLabels]="roleLabels()" />
      } @else if (loading()) {
        <p class="loading-msg">Cargando…</p>
      } @else if (loadError()) {
        <div class="empty-state card" role="alert">
          <p>No se pudo cargar el equipo.</p>
          <button class="btn btn-secondary" (click)="loadUsers()">
            <lucide-icon [img]="RotateCw" [size]="16"></lucide-icon> Reintentar
          </button>
        </div>
      } @else if (users().length === 0) {
        <div class="empty-state card">
          <p>No hay usuarios registrados aún.</p>
          <button class="btn btn-primary" (click)="openCreate()">Crear primer usuario</button>
        </div>
      } @else {
        <div class="filters">
          <label class="search">
            <lucide-icon [img]="Search" [size]="16" [strokeWidth]="2.2"></lucide-icon>
            <input class="input" type="search" placeholder="Buscar por nombre o email"
              aria-label="Buscar usuarios" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </label>
          <select class="select" aria-label="Filtrar por rol" [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
            <option value="">Todos los roles</option>
            @for (r of availableRoles(); track r.key) {
              <option [value]="r.key">{{ r.label }}</option>
            }
          </select>
          <select class="select" aria-label="Filtrar por estado" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Desactivados</option>
          </select>
        </div>

        @if (filtered().length === 0) {
          <div class="empty-state card">
            <p>Ningún usuario coincide con la búsqueda.</p>
            <button class="btn btn-secondary btn-sm" (click)="clearFilters()">Quitar filtros</button>
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
                  <th>Último acceso</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (u of filtered(); track u._id) {
                  <tr [class.row-inactive]="!u.isActive">
                    <td class="td-name">
                      {{ u.name || '—' }}
                      @if (isMe(u)) {
                        <span class="badge-me">Tú</span>
                      }
                      @if (u.mustChangePassword) {
                        <span class="badge-warning" title="Contraseña temporal">Temp</span>
                      }
                    </td>
                    <td data-label="Email">{{ u.email }}</td>
                    <td data-label="Rol">{{ roleLabel(u.role) }}</td>
                    <td data-label="Locales" class="td-locals">{{ localsLabel(u) }}</td>
                    <td data-label="Último acceso" class="td-access">
                      {{ u.lastAccessAt ? (u.lastAccessAt | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}
                    </td>
                    <td data-label="Estado">
                      <span [class]="u.isActive ? 'badge-success' : 'badge-neutral'">
                        {{ u.isActive ? 'Activo' : 'Inactivo' }}
                      </span>
                    </td>
                    <td class="actions">
                      <button class="btn btn-ghost btn-sm" (click)="openEdit(u)">Editar</button>
                      @if (!isMe(u)) {
                        <button class="btn btn-ghost btn-sm" (click)="resetting.set(u)"
                          [attr.aria-label]="'Restablecer acceso de ' + (u.name || u.email)">
                          <lucide-icon [img]="KeyRound" [size]="14" [strokeWidth]="2.3"></lucide-icon> Restablecer
                        </button>
                        @if (u.isActive) {
                          <button class="btn btn-danger btn-sm" (click)="deactivate(u)">Desactivar</button>
                        } @else {
                          <button class="btn btn-secondary btn-sm" (click)="activate(u)">Activar</button>
                        }
                        <button class="btn btn-ghost btn-sm danger-text" (click)="deleting.set(u)"
                          title="Eliminar definitivamente">Eliminar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    <!-- Formulario a pantalla completa: alta / edición -->
    @if (showDrawer()) {
      <!-- El form envuelve la pantalla: así el botón Guardar de la cabecera es su submit. -->
      <form (ngSubmit)="save()" #f="ngForm">
        <app-form-page
          [title]="editingUser() ? 'Editar usuario' : 'Nuevo usuario'"
          backLabel="Usuarios"
          [urlKey]="editingUser()?._id || 'nuevo'"
          [dirty]="isDirty()"
          (closed)="closeDrawer()">
          <ng-container formActions>
            <button class="btn btn-primary" type="submit" [disabled]="saving() || !f.valid">
              {{ saving() ? 'Guardando…' : 'Guardar' }}
            </button>
          </ng-container>

          <div class="user-form card">
            <div class="field">
              <label for="u-name">Nombre</label>
              <input id="u-name" class="input" name="name" [(ngModel)]="form.name" placeholder="Nombre completo" #nameInput />
            </div>

            <div class="field">
              <label for="u-email">Email *</label>
              <input id="u-email" class="input" name="email" [(ngModel)]="form.email" type="email" email required
                placeholder="correo@empresa.com" />
              @if (editingUser() && emailChanged()) {
                <p class="field-hint">Con el correo nuevo tendrá que iniciar sesión de nuevo.</p>
              }
            </div>

            <div class="field">
              <label for="u-phone">Teléfono</label>
              <input id="u-phone" class="input" name="phone" [(ngModel)]="form.phone" inputmode="tel" placeholder="51999888777" />
            </div>

            <div class="field">
              <label for="u-role">Rol *</label>
              @if (editingSelf()) {
                <p class="field-hint">No puedes cambiar tu propio rol. Usa "Traspasar administración".</p>
              }
              <select id="u-role" class="input" name="role" [(ngModel)]="form.role" required [disabled]="editingSelf()">
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
              <p class="form-error span-2">{{ formError() }}</p>
            }
          </div>
        </app-form-page>
      </form>
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

    @if (deleting(); as target) {
      <app-user-delete-dialog [user]="target" [apiBase]="api"
        (deleted)="onDeleted($event)" (closed)="deleting.set(null)" />
    }
    @if (resetting(); as target) {
      <app-reset-access-dialog [user]="target" [apiBase]="api" (closed)="onResetClosed()" />
    }
    @if (transferOpen()) {
      <app-transfer-admin-dialog [candidates]="transferCandidates()" [roles]="availableRoles()" [apiBase]="api"
        (done)="onTransferred()" (closed)="transferOpen.set(false)" />
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
    .tabs-row { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .header-actions .btn, .actions .btn { display: inline-flex; align-items: center; gap: 5px; }
    .filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .filters .select { width: auto; min-width: 160px; }
    .search { position: relative; flex: 1; min-width: 220px; display: flex; align-items: center; }
    .search lucide-icon { position: absolute; left: 14px; color: var(--color-text-muted); pointer-events: none; }
    .search .input { padding-left: 38px; width: 100%; }
    .td-access { font-size: 13px; color: var(--color-text-muted); white-space: nowrap; }
    .badge-me { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px;
      border-radius: var(--radius-pill); background: var(--color-brand-light); color: var(--color-brand); }
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

    /* Overlay de los modales (credenciales) */
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

    /* Formulario a pantalla completa: dos columnas, una en móvil */
    .user-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px 24px;
    }
    .span-2 { grid-column: 1 / -1; }

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
      .page-header .btn { width: 100%; justify-content: center; }
      .header-actions { flex-direction: column; }
      .filters .select { flex: 1; }

      table thead { display: none; }
      table, tbody { display: block; width: 100%; }
      tr { display: block; padding: 14px; border-bottom: 1px solid var(--color-border); }
      tr:last-child { border-bottom: none; }
      td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: none; }
      td.td-name { display: block; font-size: 15px; font-weight: 600; padding: 0 0 8px; }
      td:not(.td-name)::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
      .actions { justify-content: flex-end; flex-wrap: wrap; padding-top: 10px; }

      .user-form { grid-template-columns: 1fr; }
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

  private auth = inject(AuthService);

  readonly api = environment.apiUrl + '/users';
  readonly Search = Search;
  readonly KeyRound = KeyRound;
  readonly Crown = Crown;
  readonly RotateCw = RotateCw;
  loadError = signal(false);

  users = signal<TenantUser[]>([]);
  tab = signal<'users' | 'roles' | 'audit'>('users');

  query = signal('');
  roleFilter = signal('');
  statusFilter = signal<StatusFilter>('all');

  /** Lista visible: búsqueda por nombre o email y filtros de rol y estado. */
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.users().filter((u) =>
      (!q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (!role || u.role === role) &&
      (status === 'all' || (status === 'active') === u.isActive),
    );
  });

  deleting = signal<TenantUser | null>(null);
  resetting = signal<TenantUser | null>(null);
  transferOpen = signal(false);

  /** A quién se puede traspasar: activos y que no sean yo. */
  transferCandidates = computed(() => this.users().filter((u) => u.isActive && !this.isMe(u)));
  roleLabels = computed(() => Object.fromEntries(this.availableRoles().map((r) => [r.key, r.label])));

  isMe(u: TenantUser): boolean {
    return u._id === this.auth.currentUser()?.id;
  }

  editingSelf(): boolean {
    const u = this.editingUser();
    return !!u && this.isMe(u);
  }

  emailChanged(): boolean {
    const u = this.editingUser();
    return !!u && this.form.email.trim().toLowerCase() !== u.email;
  }

  clearFilters() {
    this.query.set('');
    this.roleFilter.set('');
    this.statusFilter.set('all');
  }
  loading = signal(true);
  showDrawer = signal(false);
  private injector = inject(Injector);
  private nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  /** Al abrir el panel, el foco va al primer campo. */
  private focusFirstField() {
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }
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
  form: { name: string; email: string; phone: string; role: string; localIds: string[] } = {
    name: '',
    email: '',
    phone: '',
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
    this.loadError.set(false);
    this.http.get<TenantUser[]>(this.api).subscribe({
      next: (users) => { this.users.set(users); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
        this.toast.error('Error al cargar usuarios');
      },
    });
  }

  openCreate() {
    this.editingUser.set(null);
    this.form = { name: '', email: '', phone: '', role: 'SERVER', localIds: [] as string[] };
    this.formError.set('');
    this.formSnapshot = snapshotOf(this.form);
    this.showDrawer.set(true);
    this.focusFirstField();
  }

  openEdit(u: TenantUser) {
    this.editingUser.set(u);
    this.form = {
      name: u.name || '', email: u.email, phone: u.phone || '', role: u.role, localIds: [...(u.localIds ?? [])],
    };
    this.formError.set('');
    this.formSnapshot = snapshotOf(this.form);
    this.showDrawer.set(true);
    this.focusFirstField();
  }

  closeDrawer() {
    this.showDrawer.set(false);
  }

  /** Foto del formulario al abrirlo: si cambia, volver pide confirmación. */
  private formSnapshot = '';
  isDirty() { return snapshotOf(this.form) !== this.formSnapshot; }

  save() {
    this.formError.set('');
    this.saving.set(true);
    const editing = this.editingUser();

    if (editing) {
      this.http.patch<TenantUser>(`${this.api}/${editing._id}`, {
        name: this.form.name,
        email: this.form.email.trim(),
        phone: this.form.phone.trim(),
        // El propio rol no se envía: el servidor lo rechazaría.
        ...(this.isMe(editing) ? {} : { role: this.form.role }),
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
      const { phone, ...rest } = this.form;
      this.http.post<{ user: TenantUser; tempPassword: string }>(this.api, {
        ...rest,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      }).subscribe({
        next: (res) => {
          this.saving.set(false);
          this.users.update((list) => [res.user, ...list]);
          this.showDrawer.set(false);
          this.createdCredentials.set({ email: res.user.email, tempPassword: res.tempPassword });
          this.toast.success('Usuario creado');
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.error?.message || 'Error al crear usuario');
          this.toast.error(err.error?.message || 'Error al crear usuario');
        },
      });
    }
  }

  onDeleted(id: string) {
    this.deleting.set(null);
    this.users.update((list) => list.filter((x) => x._id !== id));
  }

  /** Al restablecer cambia `mustChangePassword`: se recarga la lista. */
  onResetClosed() {
    this.resetting.set(null);
    this.loadUsers();
  }

  /** Tras traspasar ya no soy administrador: al recargar se renueva la sesión con el rol nuevo. */
  onTransferred() {
    this.transferOpen.set(false);
    window.location.assign('/inicio');
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
      error: (err) => this.toast.error(err.error?.message || 'Error al desactivar usuario'),
    });
  }

  activate(u: TenantUser) {
    this.http.patch<TenantUser>(`${this.api}/${u._id}`, { isActive: true }).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((x) => (x._id === u._id ? { ...x, ...updated } : x)));
        this.toast.success('Usuario activado');
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al activar usuario'),
    });
  }
}
