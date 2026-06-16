import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import { LucideAngularModule, Calendar } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type ResStatus = 'pending' | 'confirmed' | 'cancelled' | 'no-show';

interface Reservation {
  _id: string; date: string; turno: string; partySize: number;
  guestName: string; guestEmail: string; guestPhone?: string;
  occasion?: string; notes?: string; status: ResStatus;
  confirmationToken: string; createdAt: string;
}
interface ReservationConfig {
  enabled: boolean; turnos: string[]; defaultDuration: number;
  maxPerTurno: number; maxPartySize: number; advanceBookingDays: number;
  welcomeTitle?: string; welcomeMessage?: string; policy?: string;
}
interface Local { _id: string; name: string; }

const STATUS_LABELS: Record<ResStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmada',
  cancelled: 'Cancelada', 'no-show': 'No se presentó',
};
const OCCASION_LABELS: Record<string, string> = {
  birthday: 'Cumpleaños', anniversary: 'Aniversario',
  business: 'Negocio', other: 'Otro',
};

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Reservas</h1>
          <p class="subtitle">Gestión de reservas por local y fecha.</p>
        </div>
        <div class="header-actions">
          <select class="input local-select" (change)="onLocalChange($event)" aria-label="Seleccionar local">
            <option value="">— Selecciona un local —</option>
            @for (l of locals(); track l._id) {
              <option [value]="l._id">{{ l.name }}</option>
            }
          </select>
          @if (selectedLocalId()) {
            <button class="btn" [class.btn-primary]="activeTab() === 'list'"
              [class.btn-secondary]="activeTab() !== 'list'"
              (click)="activeTab.set('list')">Lista</button>
            @if (canManage()) {
              <button class="btn" [class.btn-primary]="activeTab() === 'config'"
                [class.btn-secondary]="activeTab() !== 'config'"
                (click)="openConfig()">Configuración</button>
            }
          }
        </div>
      </div>

      @if (!selectedLocalId()) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="Calendar" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>Selecciona un local</h3>
          <p>Elige un local para gestionar sus reservas.</p>
        </div>
      } @else if (activeTab() === 'list') {
        <!-- Filter row -->
        <div class="filter-row">
          <input type="date" class="input date-input" [value]="selectedDate()"
            (change)="onDateChange($event)" aria-label="Fecha" />
          <select class="input status-select" (change)="onStatusFilter($event)" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmada</option>
            <option value="cancelled">Cancelada</option>
            <option value="no-show">No se presentó</option>
          </select>
          <span class="res-count">{{ reservations().length }} reserva(s)</span>
          @if (selectedLocalId() && config()?.enabled) {
            <a class="btn btn-secondary btn-sm booking-link" [href]="publicBookingUrl()" target="_blank">
              🔗 Link de reserva pública
            </a>
          }
        </div>

        @if (loading()) {
          <div class="card skeleton-list">
            @for (i of [1,2,3]; track i) { <div class="skeleton-row"></div> }
          </div>
        } @else if (reservations().length === 0) {
          <div class="empty-state card">
            <div class="empty-icon"><lucide-icon [img]="Calendar" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
            <h3>Sin reservas</h3>
            <p>No hay reservas para esta fecha y filtros.</p>
          </div>
        } @else {
          <div class="res-table card">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Personas</th>
                  <th>Ocasión</th>
                  <th>Notas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (r of reservations(); track r._id) {
                  <tr>
                    <td class="td-turno">{{ r.turno }}</td>
                    <td>
                      <div class="guest-name">{{ r.guestName }}</div>
                      <div class="guest-contact">{{ r.guestEmail }}@if (r.guestPhone) { · {{ r.guestPhone }} }</div>
                    </td>
                    <td class="td-center">{{ r.partySize }}</td>
                    <td>{{ r.occasion ? occasionLabel(r.occasion) : '—' }}</td>
                    <td class="td-notes">{{ r.notes || '—' }}</td>
                    <td>
                      <span class="badge" [class]="'badge-res-' + r.status">
                        {{ statusLabel(r.status) }}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions">
                        @if (r.status === 'pending' && canManage()) {
                          <button class="btn btn-sm btn-primary" (click)="updateStatus(r, 'confirmed')"
                            aria-label="Confirmar reserva">Confirmar</button>
                        }
                        @if (r.status !== 'cancelled' && r.status !== 'no-show' && canManage()) {
                          <button class="btn btn-sm btn-secondary" (click)="copyConfirmLink(r)"
                            aria-label="Copiar link de confirmación">Link</button>
                          <button class="btn btn-sm btn-danger" (click)="updateStatus(r, 'no-show')"
                            aria-label="Marcar no-show">N/A</button>
                          <button class="btn btn-sm btn-ghost" (click)="cancelReservation(r)"
                            aria-label="Cancelar reserva">Cancelar</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <!-- Config tab -->
        <div class="config-card card">
          <h2>Configuración de reservas</h2>
          <p class="subtitle">Define los turnos, capacidad y duración para este local.</p>

          @if (configForm) {
            <form [formGroup]="configForm" (ngSubmit)="saveConfig()" class="config-form">
              <div class="form-row">
                <label class="toggle-label">
                  <span>Habilitar reservas online</span>
                  <button type="button" class="toggle-btn" [class.on]="configForm.get('enabled')?.value"
                    (click)="configForm.get('enabled')?.setValue(!configForm.get('enabled')?.value)"
                    [attr.aria-pressed]="configForm.get('enabled')?.value">
                    <span class="toggle-thumb"></span>
                  </button>
                </label>
              </div>

              <div class="form-section">
                <label class="form-label">Duración por turno (minutos)</label>
                <input type="number" class="input" formControlName="defaultDuration"
                  min="30" max="360" step="15" />
              </div>

              <div class="form-row-2">
                <div class="form-section">
                  <label class="form-label">Máx. reservas por turno</label>
                  <input type="number" class="input" formControlName="maxPerTurno" min="1" max="50" />
                </div>
                <div class="form-section">
                  <label class="form-label">Máx. personas por reserva</label>
                  <input type="number" class="input" formControlName="maxPartySize" min="1" max="50" />
                </div>
              </div>

              <div class="form-section">
                <label class="form-label">Días de anticipación permitidos</label>
                <input type="number" class="input" formControlName="advanceBookingDays" min="1" max="365" />
              </div>

              <div class="form-section">
                <label class="form-label">Turnos disponibles</label>
                <div class="turnos-wrap">
                  @for (t of turnosList(); track t; let i = $index) {
                    <div class="turno-chip">
                      <span>{{ t }}</span>
                      <button type="button" class="remove-turno" (click)="removeTurno(i)"
                        aria-label="Eliminar turno">×</button>
                    </div>
                  }
                  <div class="add-turno-row">
                    <input type="time" class="input time-input" #newTurnoInput />
                    <button type="button" class="btn btn-secondary btn-sm"
                      (click)="addTurno(newTurnoInput)">+ Agregar turno</button>
                  </div>
                </div>
              </div>

              <div class="form-section">
                <label class="form-label">Título de bienvenida</label>
                <input type="text" class="input" formControlName="welcomeTitle" placeholder="Ej: Reserva en Maya" />
              </div>

              <div class="form-section">
                <label class="form-label">Mensaje de bienvenida</label>
                <textarea class="textarea" formControlName="welcomeMessage" placeholder="Ej: ¡Te esperamos! Completa tus datos..."></textarea>
              </div>

              <div class="form-section">
                <label class="form-label">Política de cancelación</label>
                <textarea class="textarea" formControlName="policy" placeholder="Ej: Cancelaciones permitidas hasta 24h antes..."></textarea>
              </div>

              <div class="form-footer">
                <button type="submit" class="btn btn-primary" [disabled]="savingConfig()">
                  {{ savingConfig() ? 'Guardando...' : 'Guardar configuración' }}
                </button>
              </div>
            </form>
          }
        </div>
      }
    </div>

    <!-- Overlay reservation detail / none needed, actions inline -->
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .local-select { min-width: 200px; }

    .filter-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .date-input { max-width: 180px; }
    .status-select { max-width: 180px; }
    .res-count { font-size: 13px; color: var(--color-text-muted); margin-left: 4px; }
    .booking-link { font-size: 12px; text-decoration: none; margin-left: auto; }

    .res-table { overflow-x: auto; padding: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 12px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase;
      letter-spacing: 0.05em; padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--color-border); }
    td { padding: 14px 16px; font-size: 13px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--color-bg-app); }

    .td-turno { font-size: 15px; font-weight: 700; color: var(--color-brand); }
    .td-center { text-align: center; font-weight: 600; }
    .td-notes { color: var(--color-text-muted); max-width: 180px; }
    .guest-name { font-weight: 600; }
    .guest-contact { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

    .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: var(--radius-pill);
      font-size: 11px; font-weight: 600; }
    .badge-res-pending { background: #FEF3C7; color: #D97706; }
    .badge-res-confirmed { background: #F0FDF4; color: var(--color-success); }
    .badge-res-cancelled { background: #FEF2F2; color: var(--color-error); }
    .badge-res-no-show { background: #F3F4F6; color: var(--color-text-muted); }

    .row-actions { display: flex; gap: 4px; flex-wrap: nowrap; }

    .skeleton-list { padding: 20px; }
    .skeleton-row { height: 48px; background: #f0f0f0; border-radius: var(--radius-sm);
      margin-bottom: 8px; animation: shimmer 1.4s infinite;
      background: linear-gradient(90deg, #f0f0f0 25%, #fff 50%, #f0f0f0 75%);
      background-size: 400% 100%; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    .empty-state { text-align: center; padding: 60px 40px; }
    .empty-icon { font-size: 40px; margin-bottom: 16px; }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 0; }

    /* Config */
    .config-card { max-width: 640px; }
    .config-card h2 { margin-bottom: 6px; }
    .config-form { display: flex; flex-direction: column; gap: 20px; margin-top: 24px; }
    .form-label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-main);
      margin-bottom: 8px; }
    .form-section { display: flex; flex-direction: column; }
    .form-row { display: flex; align-items: center; justify-content: space-between; }
    .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-footer { padding-top: 8px; }

    .toggle-label { display: flex; align-items: center; justify-content: space-between;
      font-size: 14px; font-weight: 600; }
    .toggle-btn { position: relative; width: 48px; height: 28px; border-radius: var(--radius-pill);
      background: var(--color-border); border: none; cursor: pointer;
      transition: background var(--transition-fast); padding: 0; }
    .toggle-btn.on { background: var(--color-brand); }
    .toggle-thumb { position: absolute; top: 4px; left: 4px; width: 20px; height: 20px;
      border-radius: 50%; background: white; transition: transform var(--transition-fast);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .toggle-btn.on .toggle-thumb { transform: translateX(20px); }

    .turnos-wrap { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .turno-chip { display: flex; align-items: center; gap: 6px; padding: 6px 12px;
      background: var(--color-brand-light); border-radius: var(--radius-pill);
      font-size: 13px; font-weight: 600; color: var(--color-brand); }
    .remove-turno { background: none; border: none; cursor: pointer; color: var(--color-brand);
      font-size: 16px; padding: 0; line-height: 1; }
    .add-turno-row { display: flex; gap: 8px; align-items: center; }
    .time-input { max-width: 130px; }
  `],
})
export class ReservationsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  private role = computed(() => this.auth.currentUser()?.role ?? '');
  canManage = computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(this.role()));

  readonly Calendar = Calendar;

  loading = signal(false);
  savingConfig = signal(false);
  locals = signal<Local[]>([]);
  reservations = signal<Reservation[]>([]);
  config = signal<ReservationConfig | null>(null);
  selectedLocalId = signal('');
  selectedDate = signal(this.todayStr());
  statusFilter = signal('');
  activeTab = signal<'list' | 'config'>('list');

  configForm = this.fb.group({
    enabled: [false],
    defaultDuration: [90, Validators.required],
    maxPerTurno: [4, Validators.required],
    maxPartySize: [10, Validators.required],
    advanceBookingDays: [30, Validators.required],
    welcomeTitle: [''],
    welcomeMessage: [''],
    policy: [''],
  });

  turnosList = signal<string[]>([]);

  publicBookingUrl = computed(() =>
    `${window.location.origin}/book/${this.selectedLocalId()}`,
  );

  ngOnInit() {
    this.loadLocals();
  }

  private todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  loadLocals() {
    this.http.get<Local[]>(`${API}/locals`).subscribe({
      next: (data) => {
        this.locals.set(data);
        if (data.length > 0) {
          this.selectedLocalId.set(data[0]._id);
          this.loadReservations();
          if (this.canManage()) this.loadConfig();
        }
      },
      error: () => {},
    });
  }

  onLocalChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedLocalId.set(id);
    this.activeTab.set('list');
    this.config.set(null);
    if (id) {
      this.loadReservations();
      if (this.canManage()) this.loadConfig();
    }
  }

  onDateChange(event: Event) {
    this.selectedDate.set((event.target as HTMLInputElement).value);
    this.loadReservations();
  }

  onStatusFilter(event: Event) {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.loadReservations();
  }

  loadReservations() {
    const localId = this.selectedLocalId();
    if (!localId) return;
    this.loading.set(true);
    const params: Record<string, string> = { localId };
    if (this.selectedDate()) params['date'] = this.selectedDate();
    if (this.statusFilter()) params['status'] = this.statusFilter();
    this.http.get<Reservation[]>(`${API}/reservations`, { params }).subscribe({
      next: (data) => { this.reservations.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadConfig() {
    const localId = this.selectedLocalId();
    if (!localId) return;
    this.http.get<ReservationConfig>(`${API}/reservations/config`, { params: { localId } }).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.configForm.patchValue({
          enabled: cfg.enabled,
          defaultDuration: cfg.defaultDuration,
          maxPerTurno: cfg.maxPerTurno,
          maxPartySize: cfg.maxPartySize,
          advanceBookingDays: cfg.advanceBookingDays,
          welcomeTitle: cfg.welcomeTitle ?? '',
          welcomeMessage: cfg.welcomeMessage ?? '',
          policy: cfg.policy ?? '',
        });
        this.turnosList.set([...(cfg.turnos ?? [])]);
      },
      error: () => {},
    });
  }

  openConfig() {
    this.activeTab.set('config');
    if (!this.config()) this.loadConfig();
  }

  saveConfig() {
    if (this.configForm.invalid) return;
    this.savingConfig.set(true);
    const v = this.configForm.value;
    this.http.put(`${API}/reservations/config`, {
      localId: this.selectedLocalId(),
      enabled: v.enabled,
      turnos: this.turnosList(),
      defaultDuration: v.defaultDuration,
      maxPerTurno: v.maxPerTurno,
      maxPartySize: v.maxPartySize,
      advanceBookingDays: v.advanceBookingDays,
      welcomeTitle: v.welcomeTitle,
      welcomeMessage: v.welcomeMessage,
      policy: v.policy,
    }).subscribe({
      next: (cfg: any) => {
        this.config.set(cfg);
        this.savingConfig.set(false);
        this.toast.success('Configuración guardada');
      },
      error: (err) => {
        this.savingConfig.set(false);
        this.toast.error(err.error?.message || 'Error al guardar');
      },
    });
  }

  addTurno(input: HTMLInputElement) {
    const val = input.value;
    if (!val) return;
    if (!this.turnosList().includes(val)) {
      this.turnosList.update((t) => [...t, val].sort());
    }
    input.value = '';
  }

  removeTurno(i: number) {
    this.turnosList.update((t) => t.filter((_, idx) => idx !== i));
  }

  updateStatus(r: Reservation, status: ResStatus) {
    this.http.patch(`${API}/reservations/${r._id}/status`, { status }).subscribe({
      next: () => {
        this.toast.success('Estado actualizado');
        this.loadReservations();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error'),
    });
  }

  async cancelReservation(r: Reservation) {
    const ok = await this.confirm.confirm({
      title: '¿Cancelar reserva?',
      message: `Reserva de ${r.guestName} — ${r.turno} — ${r.partySize} personas.`,
      confirmText: 'Cancelar reserva',
      danger: true,
    });
    if (!ok) return;
    this.updateStatus(r, 'cancelled');
  }

  copyConfirmLink(r: Reservation) {
    const url = `${window.location.origin}/book/confirm/${r.confirmationToken}`;
    navigator.clipboard.writeText(url).catch(() => undefined);
    this.toast.success('Link copiado al portapapeles');
  }

  statusLabel(s: string): string {
    return STATUS_LABELS[s as ResStatus] ?? s;
  }

  occasionLabel(o: string): string {
    return OCCASION_LABELS[o] ?? o;
  }
}
