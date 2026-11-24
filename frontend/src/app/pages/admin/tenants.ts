import { Component, HostListener, computed, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../shared/toast';
import { LucideAngularModule, Building2, X, CircleCheckBig, Search, ChevronRight } from 'lucide-angular';
import { TenantDetailComponent, type TenantRow } from './tenant-detail';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

@Component({
  selector: 'app-admin-tenants',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, LucideAngularModule, DatePipe, TenantDetailComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Empresas</h1>
          <p class="subtitle">Gestión de todos los tenants registrados en la plataforma.</p>
        </div>
        <button class="btn btn-primary" (click)="openForm()">+ Nueva empresa</button>
      </div>

      @if (!loading() && tenants().length > 0) {
        <div class="filters">
          <label class="search">
            <lucide-icon [img]="Search" [size]="16"></lucide-icon>
            <input class="input" type="search" name="q" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Buscar por nombre, correo o RUC" aria-label="Buscar empresas" />
          </label>
          <select class="select" name="plan" [ngModel]="planFilter()" (ngModelChange)="planFilter.set($event)" aria-label="Filtrar por plan">
            <option value="">Todos los planes</option>
            <option value="inicia">Inicia</option>
            <option value="crece">Crece</option>
            <option value="escala">Escala</option>
            <option value="empresa">Empresa</option>
          </select>
          <select class="select" name="status" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" aria-label="Filtrar por estado">
            <option value="">Todas</option>
            <option value="active">Activas</option>
            <option value="suspended">Suspendidas</option>
          </select>
        </div>
      }

      <!-- Form modal -->
      @if (showForm()) {
        <div class="overlay" (click)="closeForm()">
          <div class="modal card animate-fade-in" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Nueva empresa</h3>
              <button class="close-btn" (click)="closeForm()" aria-label="Cerrar formulario"><lucide-icon [img]="X" [size]="18"></lucide-icon></button>
            </div>
            <form [formGroup]="form" (ngSubmit)="save()">
              <div class="form-group">
                <label>Razón social *</label>
                <input class="input" formControlName="name" placeholder="ej. Restaurantes del Pacífico S.A.C." autofocus />
                @if (showFieldError('name')) {
                  <span class="field-hint-error">La razón social es obligatoria.</span>
                }
              </div>
              <div class="form-group">
                <label>Email de acceso *</label>
                <input class="input" type="email" formControlName="email" placeholder="admin@empresa.com" />
                @if (showFieldError('email')) {
                  <span class="field-hint-error">Ingresa un email válido.</span>
                }
              </div>
              <div class="form-group">
                <label>Nombre del administrador *</label>
                <input class="input" formControlName="ownerName" placeholder="Juan García" />
                @if (showFieldError('ownerName')) {
                  <span class="field-hint-error">El nombre del administrador es obligatorio.</span>
                }
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>RUC / NIF</label>
                  <input class="input" formControlName="ruc" placeholder="20123456789" />
                </div>
                <div class="form-group">
                  <label>Teléfono</label>
                  <input class="input" formControlName="phone" placeholder="+51 999 999 999" />
                </div>
              </div>
              <div class="form-group">
                <label>Plan</label>
                <select class="input" formControlName="plan">
                  <option value="inicia">Inicia</option>
                  <option value="crece">Crece</option>
                  <option value="escala">Escala</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" (click)="closeForm()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving() || form.invalid">
                  {{ saving() ? 'Guardando...' : 'Guardar' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Credentials modal (post-creation) -->
      @if (newCredentials()) {
        <div class="overlay">
          <div class="modal card animate-fade-in" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="modal-title-icon"><lucide-icon [img]="CircleCheckBig" [size]="20"></lucide-icon> Empresa creada</h3>
            </div>
            <p class="cred-intro">Comparte estas credenciales con el administrador de la empresa. <strong>Solo se muestran una vez.</strong></p>
            <div class="cred-box">
              <div class="cred-row">
                <span class="cred-label">Email</span>
                <span class="cred-value">{{ newCredentials()!.email }}</span>
                <button class="copy-btn" (click)="copy(newCredentials()!.email)">Copiar</button>
              </div>
              <div class="cred-row">
                <span class="cred-label">Contraseña</span>
                <span class="cred-value cred-password">{{ newCredentials()!.password }}</span>
                <button class="copy-btn" (click)="copy(newCredentials()!.password)">Copiar</button>
              </div>
            </div>
            @if (copied()) {
              <p class="copied-msg">¡Copiado!</p>
            }
            <div class="form-actions" style="margin-top:24px">
              <button class="btn btn-primary" (click)="newCredentials.set(null)">Entendido</button>
            </div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="loading-state">Cargando...</div>
      } @else if (tenants().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="Building2" [size]="48" [strokeWidth]="2"></lucide-icon></div>
          <h3>Sin empresas registradas</h3>
          <p>Crea la primera empresa para comenzar.</p>
          <button class="btn btn-primary" (click)="openForm()">Crear empresa</button>
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty-state card">
          <h3>Ninguna empresa coincide</h3>
          <p>Cambia la búsqueda o los filtros.</p>
        </div>
      } @else {
        <div class="table-card table-cards card">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Email</th>
                <th>RUC</th>
                <th>Plan</th>
                <th>Trial hasta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (t of filtered(); track t._id) {
                <tr>
                  <td>
                    <button type="button" class="tenant-name link" (click)="openDetail(t)">{{ t.name }}</button>
                    <div class="tenant-slug">{{ t.slug }}</div>
                  </td>
                  <td class="td-muted" data-label="Email">{{ t.email }}</td>
                  <td class="td-muted" data-label="RUC">{{ t.ruc || '—' }}</td>
                  <td data-label="Plan">
                    <span class="badge" [class]="'badge-plan-' + t.plan">{{ t.plan }}</span>
                  </td>
                  <td class="td-muted" data-label="Trial hasta">{{ t.trialEndsAt ? (t.trialEndsAt | date:'dd/MM/yyyy') : '—' }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class.badge-active]="t.isActive" [class.badge-inactive]="!t.isActive">
                      {{ t.isActive ? 'Activa' : 'Suspendida' }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-sm btn-secondary" [attr.aria-label]="'Abrir ficha de ' + t.name" (click)="openDetail(t)">Ficha <lucide-icon [img]="ChevronRight" [size]="15"></lucide-icon></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (detailId(); as id) {
      <app-tenant-detail [tenantId]="id" (closed)="detailId.set(null)" (changed)="load()" />
    }
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .search { position: relative; flex: 1; min-width: 220px; }
    .search lucide-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
    .search .input { padding-left: 40px; width: 100%; box-sizing: border-box; }
    .filters .select { width: auto; min-width: 170px; }
    .link { background: none; border: none; padding: 0; font: inherit; font-weight: 500; color: var(--color-text-main); cursor: pointer; text-align: left; }
    .link:hover { color: var(--color-brand); text-decoration: underline; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .modal-header h3 { margin: 0; font-size: 18px; }
    .modal-title-icon { display: flex; align-items: center; gap: 8px; color: var(--color-success); }
    .close-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--color-text-muted); padding: 4px 8px; border-radius: 4px; }
    .close-btn:hover { background: var(--color-bg-light); }

    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 13px; font-weight: 500; color: var(--color-text-muted); margin-bottom: 6px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }

    .field-hint-error {
      display: block; margin-top: 6px;
      font-size: 12px; color: var(--color-error);
    }

    /* Credentials modal */
    .cred-intro { font-size: 14px; color: var(--color-text-muted); margin-bottom: 20px; line-height: 1.5; }
    .cred-box {
      background: var(--color-bg-light); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;
    }
    .cred-row { display: flex; align-items: center; gap: 10px; }
    .cred-label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); width: 80px; flex-shrink: 0; }
    .cred-value { flex: 1; font-size: 14px; font-weight: 500; word-break: break-all; }
    .cred-password { font-family: monospace; font-size: 15px; letter-spacing: 0.05em; color: var(--color-brand); }
    .copy-btn {
      background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      padding: 4px 10px; font-size: 12px; cursor: pointer; color: var(--color-text-muted);
      transition: all var(--transition-fast); white-space: nowrap;
    }
    .copy-btn:hover { background: var(--color-brand); color: white; border-color: var(--color-brand); }
    .copied-msg { font-size: 12px; color: var(--color-success); margin-top: 8px; text-align: center; }

    .table-card { padding: 0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th {
      text-align: left; padding: 12px 16px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted);
      background: var(--color-bg-light); border-bottom: 1px solid var(--color-border);
    }
    td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--color-bg-light); }

    .tenant-name { font-weight: 500; }
    .tenant-slug { font-size: 11px; color: var(--color-text-muted); }
    .td-muted { color: var(--color-text-muted); }

    .badge { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-plan-inicia { background: var(--color-bg-light); color: var(--color-text-muted); text-transform: capitalize; }
    .badge-plan-crece { background: var(--color-bg-light); color: var(--color-ai); text-transform: capitalize; }
    .badge-plan-escala, .badge-plan-empresa { background: var(--color-brand-light); color: var(--color-warning); text-transform: capitalize; }
    .badge-active { background: #F0FDF4; color: var(--color-success); }
    .badge-inactive { background: #FEF2F2; color: var(--color-error); }

    .row-actions { display: flex; gap: 4px; }
    .btn-icon {
      background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      padding: 5px 9px; font-size: 13px; cursor: pointer; color: var(--color-text-muted);
      transition: all var(--transition-fast);
      display: inline-flex; align-items: center; justify-content: center;
    }
    .btn-icon:hover { background: var(--color-bg-light); color: var(--color-text-main); }
    .btn-icon-danger:hover { background: #FEF2F2; color: var(--color-error); border-color: #FECACA; }

    .loading-state { padding: 60px; text-align: center; color: var(--color-text-muted); }
    .empty-state { text-align: center; padding: 60px 40px; }
    .empty-icon { font-size: 40px; margin-bottom: 16px; color: var(--color-text-muted); }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 24px; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 24px; }
      .page-header .btn { width: 100%; }

      .form-row { grid-template-columns: 1fr; }
      .cred-row { flex-wrap: wrap; }
      .cred-label { width: 100%; }

      th, td { padding: 10px 12px; }
      .empty-state { padding: 48px 24px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .page-header h1 { font-size: 22px; }
      .modal { padding: 20px; }
      /* Ya no hace falta arrastrar la tabla: cada empresa es una tarjeta. */
      .row-actions { width: 100%; padding-top: 12px; margin-top: 6px; border-top: 1px solid var(--color-border); }
      th, td { font-size: 12px; padding: 8px 10px; }
    }
  `],
})
export class AdminTenantsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  tenants = signal<TenantRow[]>([]);
  loading = signal(true);
  showForm = signal(false);

  // Icons
  readonly Building2 = Building2;
  readonly X = X;
  readonly CircleCheckBig = CircleCheckBig;
  readonly Search = Search;
  readonly ChevronRight = ChevronRight;

  query = signal('');
  planFilter = signal('');
  statusFilter = signal('');
  detailId = signal<string | null>(null);

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const plan = this.planFilter();
    const status = this.statusFilter();
    return this.tenants().filter((t: TenantRow) =>
      (!q || [t.name, t.email, t.ruc ?? '', t.slug].some(v => v.toLowerCase().includes(q))) &&
      (!plan || t.plan === plan) &&
      (!status || (status === 'active' ? t.isActive : !t.isActive)));
  });

  saving = signal(false);
  newCredentials = signal<{ email: string; password: string } | null>(null);
  copied = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    ownerName: ['', Validators.required],
    ruc: [''],
    phone: [''],
    plan: ['inicia'],
  });

  ngOnInit() { this.load(); }

  openDetail(t: TenantRow) { this.detailId.set(t._id); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.newCredentials()) { this.newCredentials.set(null); return; }
    if (this.showForm()) this.closeForm();
  }

  showFieldError(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  load() {
    this.http.get<TenantRow[]>(`${API}/tenants`).subscribe({
      next: (data) => { this.tenants.set(data); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar las empresas');
      },
    });
  }

  openForm() {
    this.form.reset({ plan: 'inicia' });
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.form.reset({ plan: 'inicia' });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.http.post<{ credentials?: { email: string; password: string } }>(`${API}/tenants`, this.form.value).subscribe({
      next: res => {
        this.closeForm();
        this.load();
        this.saving.set(false);
        if (res.credentials) {
          this.newCredentials.set(res.credentials);
          this.copied.set(false);
          this.toast.success('Empresa creada', 'Credenciales generadas');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
