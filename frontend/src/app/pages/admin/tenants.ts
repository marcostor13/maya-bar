import { Component, HostListener, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../shared/toast';
import { LucideAngularModule, Building2, Pencil, Trash2 } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

@Component({
  selector: 'app-admin-tenants',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Empresas</h1>
          <p class="subtitle">Gestión de todos los tenants registrados en la plataforma.</p>
        </div>
        <button class="btn btn-primary" (click)="openForm(null)">+ Nueva empresa</button>
      </div>

      <!-- Form modal -->
      @if (showForm()) {
        <div class="overlay" (click)="closeForm()">
          <div class="modal card animate-fade-in" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ editing() ? 'Editar empresa' : 'Nueva empresa' }}</h3>
              <button class="close-btn" (click)="closeForm()" aria-label="Cerrar formulario">✕</button>
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
              @if (!editing()) {
                <div class="form-group">
                  <label>Nombre del administrador *</label>
                  <input class="input" formControlName="ownerName" placeholder="Juan García" />
                  @if (showFieldError('ownerName')) {
                    <span class="field-hint-error">El nombre del administrador es obligatorio.</span>
                  }
                </div>
              }
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
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
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
          <div class="modal card animate-fade-in">
            <div class="modal-header">
              <h3>✓ Empresa creada</h3>
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
          <button class="btn btn-primary" (click)="openForm(null)">Crear empresa</button>
        </div>
      } @else {
        <div class="table-card card">
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
              @for (t of tenants(); track t._id) {
                <tr>
                  <td>
                    <div class="tenant-name">{{ t.name }}</div>
                    <div class="tenant-slug">{{ t.slug }}</div>
                  </td>
                  <td class="td-muted">{{ t.email }}</td>
                  <td class="td-muted">{{ t.ruc || '—' }}</td>
                  <td>
                    <span class="badge" [class]="'badge-plan-' + t.plan">{{ t.plan }}</span>
                  </td>
                  <td class="td-muted">{{ t.trialEndsAt ? (t.trialEndsAt | date:'dd/MM/yyyy') : '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-active]="t.isActive" [class.badge-inactive]="!t.isActive">
                      {{ t.isActive ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn-icon" aria-label="Editar" (click)="openForm(t)"><lucide-icon [img]="Pencil" [size]="16"></lucide-icon></button>
                      <button class="btn-icon btn-icon-danger" aria-label="Desactivar" (click)="toggleActive(t)"><lucide-icon [img]="Trash2" [size]="16"></lucide-icon></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .modal-header h3 { margin: 0; font-size: 18px; }
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
    .badge-plan-starter { background: #F8FAFC; color: var(--color-text-muted); }
    .badge-plan-pro { background: #EFF6FF; color: var(--color-ai); }
    .badge-plan-enterprise { background: #FFF7ED; color: #D97706; }
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
      table { min-width: 640px; }
      th, td { font-size: 12px; padding: 8px 10px; }
    }
  `],
})
export class AdminTenantsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  tenants = signal<any[]>([]);
  loading = signal(true);
  showForm = signal(false);
  
  // Icons
  readonly Building2 = Building2;
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;

  editing = signal<any>(null);
  saving = signal(false);
  newCredentials = signal<{ email: string; password: string } | null>(null);
  copied = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    ownerName: [''],
    ruc: [''],
    phone: [''],
    plan: ['starter'],
  });

  ngOnInit() { this.load(); }

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
    this.http.get<any[]>(`${API}/tenants`).subscribe({
      next: (data) => { this.tenants.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openForm(tenant: any) {
    this.editing.set(tenant);
    if (tenant) {
      this.form.patchValue({ name: tenant.name, email: tenant.email, ruc: tenant.ruc || '', phone: tenant.phone || '', plan: tenant.plan });
      this.form.get('ownerName')?.clearValidators();
    } else {
      this.form.reset({ plan: 'starter' });
      this.form.get('ownerName')?.setValidators(Validators.required);
    }
    this.form.get('ownerName')?.updateValueAndValidity();
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editing.set(null);
    this.form.reset({ plan: 'starter' });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    const ed = this.editing();
    const req = ed
      ? this.http.patch(`${API}/tenants/${ed._id}`, this.form.value)
      : this.http.post<any>(`${API}/tenants`, this.form.value);

    req.subscribe({
      next: (res: any) => {
        this.closeForm();
        this.load();
        this.saving.set(false);
        if (!ed && res.credentials) {
          this.newCredentials.set(res.credentials);
          this.copied.set(false);
          this.toast.success('Empresa creada', 'Credenciales generadas');
        } else if (ed) {
          this.toast.success('Empresa actualizada');
        }
      },
      error: (err: any) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  toggleActive(tenant: any) {
    const next = !tenant.isActive;
    this.http.patch(`${API}/tenants/${tenant._id}`, { isActive: next }).subscribe({
      next: () => {
        this.toast.success(next ? 'Empresa activada' : 'Empresa desactivada');
        this.load();
      },
      error: () => this.toast.error('Error al cambiar estado'),
    });
  }

  copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
