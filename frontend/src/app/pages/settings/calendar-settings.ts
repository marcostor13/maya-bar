import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule, CalendarDays, Video, Loader2, Star, Unplug } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { CalendarConnection, CalendarProvider, CalendarService } from '../../shared/calendar.service';

const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  google: 'Google Meet',
  microsoft: 'Microsoft Teams',
};

@Component({
  selector: 'app-calendar-settings',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon">
          <lucide-icon [img]="CalendarDays" [size]="22"></lucide-icon>
        </div>
        <div>
          <h2 class="section-title">Calendario y videollamadas</h2>
          <p class="section-desc">Conecta un calendario para agendar llamadas desde Conversaciones con enlace de Google Meet o Microsoft Teams.</p>
        </div>
      </div>

      <div class="connect-row">
        <button class="connect-btn" (click)="connect('google')" [disabled]="!available().google || redirecting()">
          <span class="dot google"><lucide-icon [img]="Video" [size]="14"></lucide-icon></span>
          <span class="connect-text">
            <strong>Conectar Google Calendar (Meet)</strong>
            <small>{{ available().google ? 'Google Workspace o Gmail' : 'Falta configurar credenciales OAuth en el servidor' }}</small>
          </span>
        </button>
        <button class="connect-btn" (click)="connect('microsoft')" [disabled]="!available().microsoft || redirecting()">
          <span class="dot microsoft"><lucide-icon [img]="Video" [size]="14"></lucide-icon></span>
          <span class="connect-text">
            <strong>Conectar Microsoft Teams</strong>
            <small>{{ available().microsoft ? 'Calendario de Microsoft 365' : 'Falta configurar credenciales OAuth en el servidor' }}</small>
          </span>
        </button>
      </div>

      @if (loading()) {
        <div class="loading-row"><lucide-icon [img]="Loader2" [size]="18" class="spin"></lucide-icon> Cargando calendarios…</div>
      } @else if (!connections().length) {
        <div class="empty">
          <lucide-icon [img]="CalendarDays" [size]="28" [strokeWidth]="1.5"></lucide-icon>
          <p>Aún no hay calendarios conectados.</p>
        </div>
      } @else {
        <div class="acc-list">
          @for (c of connections(); track c._id) {
            <div class="acc-card">
              <div class="acc-id">
                <span class="acc-label">
                  <span class="badge" [class.badge-info]="c.provider === 'microsoft'" [class.badge-success]="c.provider === 'google'">{{ providerLabel(c.provider) }}</span>
                  @if (c.isDefault) { <span class="badge badge-brand">Predeterminado</span> }
                </span>
                <span class="acc-email">{{ c.email }}</span>
                @if (c.name) { <span class="acc-sub">{{ c.name }}</span> }
              </div>
              <div class="acc-actions">
                @if (!c.isDefault) {
                  <button class="btn btn-sm btn-ghost" (click)="makeDefault(c)" [disabled]="busy() === c._id">
                    <lucide-icon [img]="Star" [size]="14"></lucide-icon> Hacer predeterminado
                  </button>
                }
                <button class="btn btn-sm btn-ghost danger" (click)="disconnect(c)" [disabled]="busy() === c._id">
                  <lucide-icon [img]="Unplug" [size]="14"></lucide-icon> Desconectar
                </button>
              </div>
            </div>
          }
        </div>
        <p class="field-hint">Las reuniones se crean en el calendario predeterminado, salvo que se elija otro al agendar.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0;
      background: color-mix(in srgb, var(--color-brand) 10%, var(--color-white)); color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .connect-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }
    .connect-btn { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-white); cursor: pointer; text-align: left; min-width: 0;
      transition: all var(--transition-fast); font-family: var(--font-base); }
    .connect-btn:hover:not(:disabled) { border-color: var(--color-brand); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .connect-btn:disabled { opacity: .55; cursor: not-allowed; }
    .connect-text { display: flex; flex-direction: column; min-width: 0; }
    .connect-text strong { font-size: 14px; color: var(--color-text-main); }
    .connect-text small { font-size: 12px; color: var(--color-text-muted); }
    .dot { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; color: var(--color-white); }
    /* Colores de marca de cada proveedor, como en email-settings. */
    .dot.google { background: conic-gradient(#EA4335 0 25%, #FBBC05 0 50%, #34A853 0 75%, #4285F4 0); }
    .dot.microsoft { background: linear-gradient(135deg, #4B53BC, #7B83EB); }

    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; padding: 8px 0; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: var(--color-text-muted); font-size: 14px; }
    .empty p { margin: 0; }

    .acc-list { display: flex; flex-direction: column; gap: 12px; }
    .acc-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px 20px;
      display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .acc-id { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .acc-label { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .acc-email { font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
    .acc-sub { font-size: 12.5px; color: var(--color-text-muted); }
    .acc-actions { display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap; }
    .danger { color: var(--color-error) !important; }
    .field-hint { display: block; font-size: 12px; color: var(--color-text-muted); margin-top: 12px; line-height: 1.5; }

    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .connect-row { grid-template-columns: 1fr; }
      .acc-card { flex-direction: column; align-items: stretch; }
      .acc-actions { justify-content: flex-end; }
    }
  `],
})
export class CalendarSettingsComponent implements OnInit {
  private api = inject(CalendarService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly CalendarDays = CalendarDays; readonly Video = Video; readonly Loader2 = Loader2;
  readonly Star = Star; readonly Unplug = Unplug;

  connections = signal<CalendarConnection[]>([]);
  available = signal<Record<CalendarProvider, boolean>>({ google: false, microsoft: false });
  loading = signal(true);
  redirecting = signal(false);
  busy = signal<string | null>(null);

  ngOnInit() {
    this.load();
    this.handleOAuthReturn();
  }

  load() {
    this.api.connections().subscribe({
      next: r => { this.connections.set(r.connections); this.available.set(r.available); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Vuelta del callback de Google/Microsoft (ver calendar.controller.ts). */
  private handleOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('calendar');
    if (!result) return;
    if (result === 'connected') this.toast.success(`Calendario ${params.get('email') ?? ''} conectado`.replace('  ', ' '));
    else this.toast.error(params.get('reason') || 'No se pudo conectar el calendario');
    for (const k of ['calendar', 'email', 'reason']) params.delete(k);
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }

  providerLabel(p: CalendarProvider) { return PROVIDER_LABEL[p]; }

  connect(provider: CalendarProvider) {
    this.redirecting.set(true);
    this.api.startOAuth(provider).subscribe({
      next: r => { window.location.href = r.url; },
      error: (err: { error?: { message?: string } }) => {
        this.redirecting.set(false);
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión');
      },
    });
  }

  makeDefault(c: CalendarConnection) {
    this.busy.set(c._id);
    this.api.setDefault(c._id).subscribe({
      next: () => { this.busy.set(null); this.toast.success(`${c.email} es ahora el calendario predeterminado`); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(null); this.toast.error(err.error?.message || 'No se pudo cambiar'); },
    });
  }

  async disconnect(c: CalendarConnection) {
    const ok = await this.confirm.confirm({
      title: 'Desconectar calendario',
      message: `¿Desconectar ${c.email}? Las reuniones ya agendadas se conservan en el calendario, pero no se podrán crear nuevas con esta cuenta.`,
      confirmText: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(c._id);
    this.api.disconnect(c._id).subscribe({
      next: () => { this.busy.set(null); this.toast.success('Calendario desconectado'); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.busy.set(null); this.toast.error(err.error?.message || 'No se pudo desconectar'); },
    });
  }
}
