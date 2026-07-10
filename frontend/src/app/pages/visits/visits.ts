import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import { LucideAngularModule, MapPin, Plus, X, Trash2, Navigation } from 'lucide-angular';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface Visit {
  _id: string;
  reference: string;
  location: { lat: number; lng: number; accuracy?: number };
  address?: string;
  createdAt: string;
  impulsadorId?: string;
}

interface Stats {
  today: number;
  week: number;
  month: number;
}

@Component({
  selector: 'app-visits',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Visitas</h1>
          <p class="page-sub">Registro de visitas a campo</p>
        </div>
        <button class="btn btn-primary btn-lg" (click)="openDrawer()" aria-label="Registrar visita">
          <lucide-icon [img]="Plus" [size]="18" [strokeWidth]="2.5"></lucide-icon>
          Registrar visita
        </button>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-pill card">
          <span class="stat-num">{{ stats()?.today ?? '—' }}</span>
          <span class="stat-lbl">Hoy</span>
        </div>
        <div class="stat-pill card">
          <span class="stat-num">{{ stats()?.week ?? '—' }}</span>
          <span class="stat-lbl">Esta semana</span>
        </div>
        <div class="stat-pill card">
          <span class="stat-num">{{ stats()?.month ?? '—' }}</span>
          <span class="stat-lbl">Este mes</span>
        </div>
      </div>

      <!-- List -->
      @if (loading()) {
        <div class="skeleton-list">
          @for (item of [1,2,3,4,5]; track item) {
            <div class="skeleton-row card"></div>
          }
        </div>
      } @else if (visits().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="MapPin" [size]="40" [strokeWidth]="1.5" style="color: var(--color-text-muted); margin-bottom: 12px;"></lucide-icon>
          <p>Sin visitas registradas aún.</p>
          <button class="btn btn-primary" (click)="openDrawer()">Registrar primera visita</button>
        </div>
      } @else {
        <div class="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Ubicación</th>
                <th>Fecha y hora</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (v of visits(); track v._id) {
                <tr>
                  <td class="ref-cell">
                    <lucide-icon [img]="MapPin" [size]="14" [strokeWidth]="2.5" style="color: var(--color-brand); flex-shrink:0"></lucide-icon>
                    {{ v.reference }}
                  </td>
                  <td data-label="Ubicación">
                    <a [href]="mapsLink(v.location)" target="_blank" class="maps-link">
                      <lucide-icon [img]="Navigation" [size]="13" [strokeWidth]="2.5"></lucide-icon>
                      {{ v.location.lat.toFixed(5) }}, {{ v.location.lng.toFixed(5) }}
                    </a>
                  </td>
                  <td class="date-cell" data-label="Fecha y hora">{{ formatDate(v.createdAt) }}</td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-danger" (click)="deleteVisit(v)" aria-label="Eliminar visita">
                      <lucide-icon [img]="Trash2" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Drawer: Registrar Visita -->
    @if (drawerOpen()) {
      <div class="overlay" (click)="closeDrawer()" role="dialog" aria-modal="true" aria-label="Registrar visita">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2>Registrar Visita</h2>
            <button class="btn btn-icon btn-ghost" (click)="closeDrawer()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="drawer-body">
            <div class="form-group">
              <label class="form-label">Referencia *</label>
              <input
                class="input"
                type="text"
                placeholder="Ej: Bar La Esquina — presentación de carta"
                [(ngModel)]="form.reference"
                autofocus
              />
              <span class="field-hint">Describe brevemente el motivo o lugar de la visita.</span>
            </div>

            <div class="location-box" [class.located]="locationOk()">
              @if (geoLoading()) {
                <div class="geo-status">
                  <lucide-icon [img]="Navigation" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  <span>Obteniendo ubicación…</span>
                </div>
              } @else if (locationOk()) {
                <div class="geo-status geo-ok">
                  <lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  <span>Ubicación capturada (precisión {{ form.location?.accuracy?.toFixed(0) ?? '?' }} m)</span>
                </div>
              } @else {
                <div class="geo-status geo-err">
                  <lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  <span>{{ geoError() || 'Ubicación no capturada' }}</span>
                </div>
              }
              <button class="btn btn-sm btn-secondary" type="button" (click)="getLocation()">
                <lucide-icon [img]="Navigation" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                {{ locationOk() ? 'Actualizar ubicación' : 'Capturar ubicación' }}
              </button>
            </div>
          </div>

          <div class="drawer-footer">
            <button class="btn btn-ghost" (click)="closeDrawer()">Cancelar</button>
            <button
              class="btn btn-primary"
              (click)="saveVisit()"
              [disabled]="saving() || !form.reference.trim() || !locationOk()"
            >
              {{ saving() ? 'Guardando…' : 'Registrar visita' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
    .page-header h1 { font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-text-main); margin: 0; }
    .page-sub { color: var(--color-text-muted); font-size: 14px; margin: 4px 0 0; }

    .stats-row { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
    .stat-pill { display: flex; flex-direction: column; align-items: center; padding: 20px 36px; min-width: 120px; }
    .stat-num { font-family: var(--font-heading); font-size: 32px; font-weight: 700; color: var(--color-brand); }
    .stat-lbl { font-size: 12px; color: var(--color-text-muted); font-weight: 500; margin-top: 4px; }

    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 56px 24px; text-align: center; gap: 12px; color: var(--color-text-muted); }
    .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
    .skeleton-row { height: 56px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-app) 25%, var(--color-border) 50%, var(--color-bg-app) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
    td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); font-size: 14px; color: var(--color-text-main); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .ref-cell { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .maps-link { display: flex; align-items: center; gap: 5px; color: var(--color-brand); text-decoration: none; font-size: 13px; font-weight: 500; }
    .maps-link:hover { text-decoration: underline; }
    .date-cell { color: var(--color-text-muted); font-size: 13px; white-space: nowrap; }
    .actions-cell { width: 48px; text-align: right; }

    /* Drawer */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: flex-end; z-index: 100; }
    .drawer { width: 460px; max-width: calc(100vw - 24px); height: 100%; background: var(--color-white); display: flex; flex-direction: column; box-shadow: var(--shadow-lg); animation: slideInRight var(--transition-spring) both; }
    @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); }
    .drawer-header h2 { font-family: var(--font-heading); font-size: 20px; font-weight: 700; color: var(--color-text-main); margin: 0; }
    .drawer-body { flex: 1; padding: 28px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
    .drawer-footer { padding: 20px 28px; border-top: 1px solid var(--color-border); display: flex; gap: 12px; justify-content: flex-end; }

    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .location-box { border: 1.5px dashed var(--color-border); border-radius: var(--radius-lg); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: var(--color-bg-app); transition: border-color var(--transition-fast); }
    .location-box.located { border-color: var(--color-success, #16A34A); background: #F0FDF4; }
    .geo-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-muted); }
    .geo-ok { color: #16A34A; font-weight: 600; }
    .geo-err { color: var(--color-error); }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .stat-pill { flex: 1 1 auto; min-width: 100px; padding: 16px 24px; }

      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tbody tr { border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: 12px; padding: 12px 14px; }
      tbody tr:last-child { margin-bottom: 0; }
      td { border-bottom: none; padding: 6px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      td::before { content: attr(data-label); font-size: 11px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .04em; flex-shrink: 0; }
      td.ref-cell { justify-content: flex-start; padding-bottom: 8px; border-bottom: 1px solid var(--color-border); margin-bottom: 6px; }
      td.ref-cell::before { content: none; }
      td.actions-cell { justify-content: flex-end; padding-top: 6px; }
      td.actions-cell::before { content: none; }

      .drawer-header { padding: 20px; }
      .drawer-body { padding: 20px; }
      .drawer-footer { padding: 16px 20px; }
    }

    @media (max-width: 480px) {
      .drawer { width: 100vw; max-width: 100vw; }
    }
  `],
})
export class VisitsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  readonly Plus = Plus;
  readonly X = X;
  readonly MapPin = MapPin;
  readonly Trash2 = Trash2;
  readonly Navigation = Navigation;

  visits = signal<Visit[]>([]);
  stats = signal<Stats | null>(null);
  loading = signal(true);
  drawerOpen = signal(false);
  saving = signal(false);
  geoLoading = signal(false);
  geoError = signal('');
  locationOk = signal(false);

  form: { reference: string; location: { lat: number; lng: number; accuracy?: number } | null } = {
    reference: '',
    location: null,
  };

  @HostListener('document:keydown.escape')
  onEsc() { this.closeDrawer(); }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.http.get<Visit[]>(`${API}/visits`).subscribe({
      next: v => { this.visits.set(v); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.http.get<Stats>(`${API}/visits/stats`).subscribe({
      next: s => this.stats.set(s),
      error: () => {},
    });
  }

  openDrawer() {
    this.form = { reference: '', location: null };
    this.locationOk.set(false);
    this.geoError.set('');
    this.drawerOpen.set(true);
    setTimeout(() => this.getLocation(), 200);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
  }

  getLocation() {
    if (!navigator.geolocation) {
      this.geoError.set('Geolocalización no disponible en este dispositivo.');
      return;
    }
    this.geoLoading.set(true);
    this.geoError.set('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.form.location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        this.locationOk.set(true);
        this.geoLoading.set(false);
      },
      (err) => {
        this.geoLoading.set(false);
        this.locationOk.set(false);
        if (err.code === err.PERMISSION_DENIED) {
          this.geoError.set('Permiso de ubicación denegado. Actívalo en la configuración del navegador.');
          this.toast.error('Permiso de ubicación denegado');
        } else {
          this.geoError.set('No se pudo obtener la ubicación. Intenta de nuevo.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  saveVisit() {
    if (!this.form.reference.trim() || !this.form.location) return;
    this.saving.set(true);
    this.http.post(`${API}/visits`, {
      reference: this.form.reference.trim(),
      location: this.form.location,
    }).subscribe({
      next: () => {
        this.toast.success('Visita registrada correctamente');
        this.closeDrawer();
        this.load();
        this.saving.set(false);
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Error al registrar visita');
        this.saving.set(false);
      },
    });
  }

  async deleteVisit(v: Visit) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar visita',
      message: `¿Eliminar la visita "${v.reference}"?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/visits/${v._id}`).subscribe({
      next: () => {
        this.toast.success('Visita eliminada');
        this.load();
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Error al eliminar'),
    });
  }

  mapsLink(location: { lat: number; lng: number }) {
    return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
