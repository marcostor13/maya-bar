import { Component, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, History, RotateCw } from 'lucide-angular';
import { ToastService } from '../../shared/toast';

export interface AuditEntry {
  _id: string;
  at: string;
  action: string;
  actorName?: string;
  actorRole: string;
  targetEmail?: string;
  targetName?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Alta',
  update: 'Edición',
  activate: 'Activación',
  deactivate: 'Desactivación',
  reset_access: 'Acceso restablecido',
  transfer_admin: 'Traspaso de administración',
  delete: 'Eliminación',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  email: 'Email',
  phone: 'Teléfono',
  role: 'Rol',
  localIds: 'Locales',
  mode: 'Modo',
  reassigned: 'Registros reasignados',
  reassignTo: 'Reasignado a',
};

const VALUE_LABELS: Record<string, string> = {
  email: 'código por correo',
  temp: 'contraseña temporal',
};

/** Registro de cambios de usuarios (de una empresa o de toda la plataforma). */
@Component({
  selector: 'app-user-audit',
  standalone: true,
  imports: [DatePipe, LucideAngularModule],
  template: `
    @if (loading()) {
      <p class="au-muted">Cargando registro…</p>
    } @else if (error()) {
      <div class="card au-empty">
        <p>No se pudo cargar el registro.</p>
        <button type="button" class="btn btn-secondary btn-sm" (click)="load()">
          <lucide-icon [img]="RotateCw" [size]="14"></lucide-icon> Reintentar
        </button>
      </div>
    } @else if (entries().length === 0) {
      <div class="card au-empty">
        <lucide-icon [img]="History" [size]="28" [strokeWidth]="1.8"></lucide-icon>
        <p>Todavía no hay cambios registrados.</p>
      </div>
    } @else {
      <div class="table-wrap card">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Hecho por</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            @for (e of entries(); track e._id) {
              <tr>
                <td data-label="Fecha" class="au-date">{{ e.at | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td data-label="Acción"><span class="badge-neutral">{{ actionLabel(e.action) }}</span></td>
                <td data-label="Usuario">{{ e.targetName || e.targetEmail }}</td>
                <td data-label="Hecho por">{{ e.actorName || '—' }}</td>
                <td data-label="Detalle" class="au-detail">{{ detail(e) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .au-muted { color: var(--color-text-muted); font-size: 14px; }
    .au-empty { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px;
      color: var(--color-text-muted); text-align: center; }
    .au-empty p { margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
      color: var(--color-text-muted); padding: 10px 14px; border-bottom: 1px solid var(--color-border); }
    td { padding: 12px 14px; font-size: 14px; color: var(--color-text-main);
      border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .au-date { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
    .au-detail { font-size: 13px; color: var(--color-text-muted); }
    @media (max-width: 768px) {
      table thead { display: none; }
      table, tbody { display: block; width: 100%; }
      tr { display: block; padding: 12px 14px; border-bottom: 1px solid var(--color-border); }
      td { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: none; }
      td::before { content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .06em; color: var(--color-text-muted); }
    }
  `],
})
export class UserAuditComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly History = History;
  readonly RotateCw = RotateCw;

  /** `.../users/audit` o `.../admin/users/audit`. */
  url = input.required<string>();
  /** Etiquetas de rol para mostrar los cambios de rol legibles. */
  roleLabels = input<Record<string, string>>({});

  entries = signal<AuditEntry[]>([]);
  loading = signal(true);
  error = signal(false);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(false);
    this.http.get<AuditEntry[]>(this.url()).subscribe({
      next: (list) => {
        this.entries.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
        this.toast.error('No se pudo cargar el registro');
      },
    });
  }

  actionLabel(a: string) {
    return ACTION_LABELS[a] ?? a;
  }

  detail(e: AuditEntry): string {
    if (!e.changes) return '';
    return Object.entries(e.changes)
      .map(([field, { from, to }]) => {
        const label = FIELD_LABELS[field] ?? field;
        const show = (v: unknown) => {
          if (v === undefined || v === null || v === '') return '—';
          if (Array.isArray(v)) return v.length ? `${v.length}` : 'todos';
          const s = String(v);
          return field === 'role' ? (this.roleLabels()[s] ?? s) : (VALUE_LABELS[s] ?? s);
        };
        return from === undefined ? `${label}: ${show(to)}` : `${label}: ${show(from)} → ${show(to)}`;
      })
      .join(' · ');
  }
}
