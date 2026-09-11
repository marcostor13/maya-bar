import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, BanIcon, Search, Plus, Trash2, X, ShieldCheck, MessageSquareOff,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface SuppressionEntry {
  _id: string;
  phone?: string;
  email?: string;
  name?: string;
  reason?: string;
  source: 'inbox' | 'manual' | 'import' | 'reply';
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  inbox: 'Desde un chat',
  manual: 'Alta manual',
  import: 'Importación',
  reply: 'Lo pidió el cliente',
};

@Component({
  selector: 'app-suppression',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>No contactar</h1>
          <p class="page-sub">
            Quien está en esta lista queda fuera de todas las campañas y el agente IA
            deja de responderle. Puedes seguir escribiéndole a mano desde el chat.
          </p>
        </div>
        <button class="btn btn-primary btn-block-mobile" (click)="openForm()">
          <lucide-icon [img]="Plus" [size]="17" [strokeWidth]="2.5"></lucide-icon>
          Añadir persona
        </button>
      </div>

      <div class="toolbar card">
        <div class="search-wrap">
          <lucide-icon class="search-icon" [img]="Search" [size]="17" [strokeWidth]="2.2"></lucide-icon>
          <input
            class="input search-input"
            type="search"
            placeholder="Buscar por nombre, teléfono, email o motivo"
            [ngModel]="search()"
            (ngModelChange)="onSearch($event)"
            aria-label="Buscar en la lista"
          />
        </div>
        <span class="count">{{ entries().length }} {{ entries().length === 1 ? 'persona' : 'personas' }}</span>
      </div>

      @if (loading()) {
        <div class="empty-state card">Cargando…</div>
      } @else if (entries().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="ShieldCheck" [size]="38" [strokeWidth]="1.5"></lucide-icon>
          <p>{{ search() ? 'Nadie coincide con esa búsqueda.' : 'No hay nadie en la lista.' }}</p>
          <span>
            {{ search()
              ? 'Prueba con otro término.'
              : 'Cuando alguien pida dejar de recibir mensajes, añádelo aquí o márcalo desde su conversación.' }}
          </span>
        </div>
      } @else {
        <div class="table-wrap table-cards card">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Motivo</th>
                <th>Origen</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (e of entries(); track e._id) {
                <tr>
                  <td>
                    <div class="who">
                      <span class="who-name">{{ e.name || contactOf(e) }}</span>
                      @if (e.name) { <span class="who-contact">{{ contactOf(e) }}</span> }
                    </div>
                  </td>
                  <td data-label="Motivo">{{ e.reason || '—' }}</td>
                  <td data-label="Origen">
                    <span class="badge badge-neutral">{{ sourceLabel(e.source) }}</span>
                  </td>
                  <td data-label="Desde" class="td-muted">{{ shortDate(e.createdAt) }}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" (click)="restore(e)">
                      <lucide-icon [img]="Trash2" [size]="14" [strokeWidth]="2.4"></lucide-icon>
                      Quitar
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (formOpen()) {
      <div class="overlay" (click)="closeForm()" role="dialog" aria-modal="true">
        <div class="card form-modal" (click)="$event.stopPropagation()">
          <div class="fm-head">
            <div>
              <h2>Añadir a no contactar</h2>
              <p class="fm-sub">Basta con el teléfono o el email.</p>
            </div>
            <button class="btn-icon btn-ghost" (click)="closeForm()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          <div class="fm-body">
            <div class="fm-field">
              <label class="fm-label">Nombre</label>
              <input class="input" [(ngModel)]="form.name" placeholder="Opcional, para reconocerlo" />
            </div>
            <div class="fm-row">
              <div class="fm-field">
                <label class="fm-label">Teléfono</label>
                <input class="input" [(ngModel)]="form.phone" placeholder="51999888777" />
              </div>
              <div class="fm-field">
                <label class="fm-label">Email</label>
                <input class="input" [(ngModel)]="form.email" placeholder="cliente@correo.com" />
              </div>
            </div>
            <div class="fm-field">
              <label class="fm-label">Motivo</label>
              <input class="input" [(ngModel)]="form.reason" placeholder="Pidió no recibir promociones" />
            </div>
            @if (formError()) { <p class="fm-error">{{ formError() }}</p> }
          </div>

          <div class="fm-actions">
            <button class="btn btn-secondary" (click)="closeForm()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Guardando…' : 'Añadir a la lista' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 24px;
    }
    .page-header h1 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 26px; }
    .page-sub { margin: 0; color: var(--color-text-muted); font-size: 13.5px; max-width: 640px; line-height: 1.55; }

    .toolbar {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px; margin-bottom: 18px;
    }
    .toolbar:hover { transform: none; box-shadow: var(--shadow-sm); }
    .search-wrap { position: relative; flex: 1; min-width: 0; }
    .search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--color-text-muted); pointer-events: none;
    }
    .search-input { padding-left: 40px; width: 100%; }
    .count { font-size: 13px; color: var(--color-text-muted); font-weight: 600; white-space: nowrap; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 48px 24px; text-align: center; color: var(--color-text-muted);
    }
    .empty-state:hover { transform: none; box-shadow: var(--shadow-sm); }
    .empty-state p { margin: 0; font-size: 15px; font-weight: 600; color: var(--color-text-main); }
    .empty-state span { font-size: 13.5px; max-width: 420px; line-height: 1.55; }

    .table-wrap { padding: 0; overflow: hidden; }
    .table-wrap:hover { transform: none; box-shadow: var(--shadow-sm); }
    table { width: 100%; border-collapse: collapse; }
    th {
      padding: 13px 18px; text-align: left; font-size: 12px; font-weight: 700;
      color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em;
      background: var(--color-bg-app); border-bottom: 1px solid var(--color-border);
    }
    td { padding: 14px 18px; border-bottom: 1px solid var(--color-border); font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .td-muted { color: var(--color-text-muted); }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .who-name { font-weight: 600; }
    .who-contact { font-size: 12.5px; color: var(--color-text-muted); }
    .actions-cell { text-align: right; }
    .actions-cell .btn { gap: 6px; }

    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .form-modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; }
    .form-modal:hover { transform: none; box-shadow: var(--shadow-lg); }
    .fm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .fm-head h2 { margin: 0 0 3px; font-family: var(--font-heading); font-size: 19px; }
    .fm-sub { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
    .fm-body { display: flex; flex-direction: column; gap: 13px; margin: 18px 0; }
    .fm-field { display: flex; flex-direction: column; gap: 6px; }
    .fm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .fm-label { font-size: 12px; font-weight: 600; }
    .fm-error { margin: 0; font-size: 13px; color: var(--color-error); font-weight: 600; }
    .fm-actions { display: flex; justify-content: flex-end; gap: 10px; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header h1 { font-size: 22px; }
      .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
      .count { text-align: right; }
      .fm-row { grid-template-columns: 1fr; }
      .fm-actions .btn { flex: 1; min-height: 46px; }
      /* La tabla pasa a tarjetas: los botones se separan abajo. */
      .actions-cell {
        padding-top: 12px; margin-top: 6px;
        border-top: 1px solid var(--color-border);
      }
    }
  `],
})
export class SuppressionComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly BanIcon = BanIcon;
  readonly Search = Search;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly ShieldCheck = ShieldCheck;
  readonly MessageSquareOff = MessageSquareOff;

  entries = signal<SuppressionEntry[]>([]);
  loading = signal(true);
  search = signal('');
  formOpen = signal(false);
  saving = signal(false);
  formError = signal('');
  form = { name: '', phone: '', email: '', reason: '' };

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const q = this.search().trim();
    const url = `${API}/suppression${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    this.http.get<SuppressionEntry[]>(url).subscribe({
      next: list => { this.entries.set(list); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudo cargar la lista');
      },
    });
  }

  onSearch(value: string) {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  openForm() {
    this.form = { name: '', phone: '', email: '', reason: '' };
    this.formError.set('');
    this.formOpen.set(true);
  }

  closeForm() { this.formOpen.set(false); }

  save() {
    if (!this.form.phone.trim() && !this.form.email.trim()) {
      this.formError.set('Escribe al menos un teléfono o un email.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.http.post<SuppressionEntry>(`${API}/suppression`, {
      name: this.form.name.trim() || undefined,
      phone: this.form.phone.trim() || undefined,
      email: this.form.email.trim() || undefined,
      reason: this.form.reason.trim() || undefined,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success('Añadido a la lista de no contactar');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        const msg = err.error?.message || 'No se pudo añadir a la lista';
        this.formError.set(Array.isArray(msg) ? msg.join(' ') : msg);
      },
    });
  }

  async restore(entry: SuppressionEntry) {
    const ok = await this.confirm.confirm({
      title: 'Quitar de la lista',
      message: `${entry.name || this.contactOf(entry)} volverá a recibir campañas y respuestas automáticas.`,
      confirmText: 'Quitar',
    });
    if (!ok) return;
    this.http.delete(`${API}/suppression/${entry._id}`).subscribe({
      next: () => {
        this.toast.success('Quitado de la lista');
        this.load();
      },
      error: () => this.toast.error('No se pudo quitar de la lista'),
    });
  }

  /** El dato por el que se le reconoce: teléfono si lo hay, si no el email. */
  contactOf(e: SuppressionEntry): string {
    if (e.phone) return `+${e.phone}`;
    return e.email ?? '—';
  }

  sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
