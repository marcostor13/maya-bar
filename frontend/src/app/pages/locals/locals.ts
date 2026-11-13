import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { LucideAngularModule, Store, Pencil, Copy, Trash2 } from 'lucide-angular';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

@Component({
  selector: 'app-locals',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, FormPageComponent],
  template: `
    <div class="locals-page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Locales</h1>
          <p class="subtitle">Gestiona todas tus sucursales desde aquí.</p>
        </div>
        <button class="btn btn-primary" (click)="openForm(null)">+ Nuevo local</button>
      </div>

      @if (loading()) {
        <div class="skeleton-list card">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton-row"></div>
          }
        </div>
      } @else if (locals().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="Store" [size]="48" [strokeWidth]="2"></lucide-icon></div>
          <h3>Sin locales</h3>
          <p>Crea tu primer local para comenzar.</p>
          <button class="btn btn-primary" (click)="openForm(null)">Crear local</button>
        </div>
      } @else {
        <div class="locals-table card">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Dirección</th>
                <th>Mesas</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (local of locals(); track local._id) {
                <tr>
                  <td class="td-name">{{ local.name }}</td>
                  <td data-label="Tipo">
                    <span class="badge badge-type">{{ typeLabel(local.type) }}</span>
                  </td>
                  <td class="td-muted" data-label="Dirección">{{ local.address || '—' }}</td>
                  <td class="td-muted" data-label="Mesas">{{ local.tableCount || 0 }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class.badge-active]="local.isActive" [class.badge-inactive]="!local.isActive">
                      {{ local.isActive ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn-icon" aria-label="Editar local" (click)="openForm(local)"><lucide-icon [img]="Pencil" [size]="16"></lucide-icon></button>
                      <button class="btn-icon" aria-label="Duplicar local" (click)="clone(local._id)"><lucide-icon [img]="Copy" [size]="16"></lucide-icon></button>
                      <button class="btn-icon btn-icon-danger" aria-label="Archivar local" (click)="archive(local._id)"><lucide-icon [img]="Trash2" [size]="16"></lucide-icon></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- ══ Formulario de local (pantalla completa) ══ -->
    @if (showForm()) {
      <app-form-page
        [title]="editingId() ? 'Editar local' : 'Nuevo local'"
        backLabel="Locales"
        [urlKey]="editingId() || 'nuevo'"
        [dirty]="isDirty()"
        (closed)="closeForm()">
        <ng-container formActions>
          <!-- El botón vive en la cabecera: se asocia al formulario con form="local-form". -->
          <button type="submit" form="local-form" class="btn btn-primary" [disabled]="saving() || localForm.invalid">
            {{ saving() ? 'Guardando...' : (editingId() ? 'Guardar cambios' : 'Crear local') }}
          </button>
        </ng-container>
        <form id="local-form" class="form-card" [formGroup]="localForm" (ngSubmit)="save()">
          <div class="fields-row">
            <div class="field">
              <label>Nombre *</label>
              <input class="input" formControlName="name" placeholder="Nombre del local" autofocus />
              @if (showFieldError('name')) {
                <span class="field-hint-error">El nombre es obligatorio.</span>
              }
            </div>
            <div class="field">
              <label>Tipo</label>
              <select class="input" formControlName="type">
                <option value="restaurant">Restaurante</option>
                <option value="bar">Bar</option>
                <option value="cafe">Café</option>
                <option value="cafeteria">Cafetería</option>
                <option value="fastfood">Fast Food</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Dirección</label>
            <input class="input" formControlName="address" placeholder="Dirección completa" />
          </div>
          <div class="fields-row">
            <div class="field">
              <label>Teléfono</label>
              <input class="input" formControlName="phone" />
            </div>
            <div class="field">
              <label>Mesas</label>
              <input class="input" type="number" formControlName="tableCount" min="1" />
            </div>
          </div>
        </form>
      </app-form-page>
    }
  `,
  styles: [`
    .locals-page { padding: 32px 40px; width: 100%; box-sizing: border-box; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 32px;
    }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    /* ── Skeleton ── */
    .skeleton-list { padding: 0; overflow: hidden; }
    .skeleton-row {
      height: 56px; border-bottom: 1px solid var(--color-border);
      background: linear-gradient(90deg, var(--color-bg-light) 25%, #fff 50%, var(--color-bg-light) 75%);
      background-size: 400% 100%;
      animation: shimmer 1.4s infinite;
    }
    .skeleton-row:last-child { border-bottom: none; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    /* ── Table ── */
    .locals-table { padding: 0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 12px 16px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--color-text-muted);
      background: var(--color-bg-light);
      border-bottom: 1px solid var(--color-border);
    }
    td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--color-bg-light); }

    .td-name { font-weight: 500; }
    .td-muted { color: var(--color-text-muted); }

    .badge {
      display: inline-block; padding: 3px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
    }
    .badge-type { background: #EFF6FF; color: var(--color-ai); }
    .badge-active { background: #F0FDF4; color: var(--color-success); }
    .badge-inactive { background: #F8FAFC; color: var(--color-text-muted); }

    .row-actions { display: flex; gap: 4px; }
    .btn-icon {
      background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      padding: 5px 9px; cursor: pointer; color: var(--color-text-muted);
      transition: all var(--transition-fast);
      display: flex; align-items: center; justify-content: center;
    }
    .btn-icon:hover { background: var(--color-bg-light); color: var(--color-text-main); }
    .btn-icon-danger:hover { background: #FEF2F2; color: var(--color-error); border-color: #FECACA; }

    /* ── Empty state ── */
    .empty-state { text-align: center; padding: 60px 40px; }
    .empty-icon { font-size: 40px; margin-bottom: 16px; color: var(--color-text-muted); }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 24px; }

    /* ── Formulario a pantalla completa ── */
    .form-card {
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); padding: 24px;
    }

    .field { margin-bottom: 16px; }
    .field label {
      display: block; font-size: 13px; font-weight: 500;
      color: var(--color-text-muted); margin-bottom: 6px;
    }
    .field-hint-error {
      display: block; margin-top: 6px;
      font-size: 12px; color: var(--color-error);
    }
    .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    @media (max-width: 768px) {
      .locals-page { padding: 20px 16px; }
      .page-header { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 24px; }
      .page-header .btn { width: 100%; }

      .empty-state { padding: 48px 24px; }

      table thead { display: none; }
      table, tbody { display: block; width: 100%; }
      tr { display: block; padding: 14px 16px; border-bottom: 1px solid var(--color-border); }
      tr:last-child { border-bottom: none; }
      td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: none; }
      td.td-name { display: block; font-size: 15px; font-weight: 600; padding: 0 0 8px; }
      td:not(.td-name)::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
      td:last-child { justify-content: flex-end; padding-top: 10px; }
      .row-actions { justify-content: flex-end; }

      .form-card { padding: 20px 16px; }
      .fields-row { grid-template-columns: 1fr; }
    }

    @media (max-width: 480px) {
      .locals-page { padding: 16px 12px; }
      .page-header h1 { font-size: 22px; }
    }
  `],
})
export class LocalsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Store = Store;
  readonly Pencil = Pencil;
  readonly Copy = Copy;
  readonly Trash2 = Trash2;

  loading = signal(true);
  locals = signal<any[]>([]);
  showForm = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);

  private typeLabels: Record<string, string> = {
    restaurant: 'Restaurante', bar: 'Bar', cafe: 'Café',
    cafeteria: 'Cafetería', fastfood: 'Fast Food',
  };

  localForm = this.fb.group({
    name: ['', Validators.required],
    type: ['restaurant'],
    address: [''],
    phone: [''],
    tableCount: [10],
  });

  ngOnInit() { this.loadLocals(); }

  loadLocals() {
    this.http.get<any[]>(`${API}/locals`).subscribe({
      next: (data) => { this.locals.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openForm(local: any | null) {
    if (local) {
      this.editingId.set(local._id);
      this.localForm.patchValue(local);
    } else {
      this.editingId.set(null);
      this.localForm.reset({ type: 'restaurant', tableCount: 10 });
    }
    this.formSnapshot = snapshotOf(this.localForm.getRawValue());
    this.showForm.set(true);
  }

  /** Foto del formulario al abrirlo, para avisar de cambios sin guardar. */
  private formSnapshot = '';
  isDirty() { return snapshotOf(this.localForm.getRawValue()) !== this.formSnapshot; }

  closeForm() {
    this.showForm.set(false);
    this.editingId.set(null);
    this.localForm.reset({ type: 'restaurant', tableCount: 10 });
  }

  showFieldError(name: string): boolean {
    const c = this.localForm.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  save() {
    if (this.localForm.invalid) {
      this.localForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);

    const id = this.editingId();
    const req = id
      ? this.http.patch(`${API}/locals/${id}`, this.localForm.value)
      : this.http.post(`${API}/locals`, this.localForm.value);

    req.subscribe({
      next: () => {
        this.toast.success(id ? 'Local actualizado' : 'Local creado');
        this.saving.set(false);
        this.closeForm();
        this.loadLocals();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  clone(id: string) {
    this.http.post(`${API}/locals/${id}/clone`, {}).subscribe({
      next: () => { this.toast.success('Local duplicado'); this.loadLocals(); },
      error: () => this.toast.error('Error al duplicar'),
    });
  }

  async archive(id: string) {
    const ok = await this.confirm.confirm({
      title: '¿Archivar este local?',
      message: 'El local quedará inactivo. Podrás reactivarlo más adelante.',
      confirmText: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/locals/${id}`).subscribe({
      next: () => { this.toast.success('Local archivado'); this.loadLocals(); },
      error: () => this.toast.error('Error al archivar'),
    });
  }

  typeLabel(type: string) {
    return this.typeLabels[type] || type;
  }
}
