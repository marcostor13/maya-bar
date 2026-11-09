import { Component, ElementRef, Injector, OnInit, afterNextRender, inject, input, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Phone, X, Save, TriangleAlert } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/calls/settings`;

type OnOff = 'ENABLED' | 'DISABLED';

export interface MetaCalling {
  status?: OnOff;
  call_icon_visibility?: 'DEFAULT' | 'DISABLE_ALL';
  callback_permission_status?: OnOff;
  call_hours?: {
    status: OnOff;
    timezone_id?: string;
    weekly_operating_hours?: { day_of_week: string; open_time: string; close_time: string }[];
  };
}

export interface LocalCalling {
  ringTimeoutSec: number;
  missedReplyEnabled: boolean;
  missedReplyText?: string;
}

interface SettingsResponse {
  meta: MetaCalling | null;
  metaError?: string;
  local: LocalCalling;
}

export const DAYS: { key: string; label: string }[] = [
  { key: 'MONDAY', label: 'Lunes' },
  { key: 'TUESDAY', label: 'Martes' },
  { key: 'WEDNESDAY', label: 'Miércoles' },
  { key: 'THURSDAY', label: 'Jueves' },
  { key: 'FRIDAY', label: 'Viernes' },
  { key: 'SATURDAY', label: 'Sábado' },
  { key: 'SUNDAY', label: 'Domingo' },
];

interface DayRow { key: string; label: string; open: boolean; from: string; to: string }

/** "0900" ↔ "09:00". */
export const toHHMM = (v: string) => (v?.length === 4 ? `${v.slice(0, 2)}:${v.slice(2)}` : v);
export const fromHHMM = (v: string) => v.replace(':', '');

/** Ajustes de llamadas de una cuenta: los de Meta y los locales de Maya. */
@Component({
  selector: 'app-call-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="cs-overlay" (click)="close()">
      <aside class="cs-drawer" role="dialog" aria-modal="true" aria-labelledby="cs-title"
             (click)="$event.stopPropagation()" (keydown.escape)="close()">
        <div class="cs-head">
          <div>
            <h2 id="cs-title"><lucide-icon [img]="Phone" [size]="18" /> Llamadas · {{ label() }}</h2>
            <p>Lo que configures en "WhatsApp" se guarda en Meta; el resto, en Maya.</p>
          </div>
          <button type="button" class="btn btn-ghost btn-icon" aria-label="Cerrar" (click)="close()">
            <lucide-icon [img]="X" [size]="18" />
          </button>
        </div>

        <div class="cs-body">
          @if (loading()) {
            <p class="muted" aria-busy="true">Cargando la configuración…</p>
          } @else {
            <section>
              <h3>WhatsApp (Meta)</h3>
              @if (metaError()) {
                <p class="warn" role="alert">
                  <lucide-icon [img]="TriangleAlert" [size]="15" />
                  Meta no devolvió la configuración: {{ metaError() }}
                </p>
              }
              <label class="row">
                <input type="checkbox" name="enabled" [(ngModel)]="enabled" />
                <span><strong>Llamadas activadas</strong><small>Los clientes pueden llamar a este número y tú llamarlos.</small></span>
              </label>
              <label class="row">
                <input type="checkbox" name="icon" [(ngModel)]="showIcon" [disabled]="!enabled" />
                <span><strong>Mostrar el botón de llamada</strong><small>El icono de teléfono en el chat del cliente.</small></span>
              </label>
              <label class="row">
                <input type="checkbox" name="callback" [(ngModel)]="callback" [disabled]="!enabled" />
                <span><strong>Pedir permiso de devolución</strong><small>Si pierdes una llamada, WhatsApp le ofrece al cliente que lo llames tú.</small></span>
              </label>

              <label class="row">
                <input type="checkbox" name="hours" [(ngModel)]="hoursOn" [disabled]="!enabled" />
                <span><strong>Horario de atención</strong><small>Fuera de horario WhatsApp no deja llamar.</small></span>
              </label>
              @if (hoursOn && enabled) {
                <div class="hours">
                  <label class="field">
                    <span>Zona horaria</span>
                    <input class="input" name="tz" [(ngModel)]="timezone" placeholder="America/Lima" />
                  </label>
                  @for (d of days(); track d.key) {
                    <div class="day">
                      <label class="day-name"><input type="checkbox" [name]="'o' + d.key" [(ngModel)]="d.open" /> {{ d.label }}</label>
                      <input class="input" type="time" [name]="'f' + d.key" [(ngModel)]="d.from" [disabled]="!d.open" [attr.aria-label]="d.label + ' desde'" />
                      <input class="input" type="time" [name]="'t' + d.key" [(ngModel)]="d.to" [disabled]="!d.open" [attr.aria-label]="d.label + ' hasta'" />
                    </div>
                  }
                </div>
              }
            </section>

            <section>
              <h3>En Maya</h3>
              <label class="field">
                <span>Segundos que suena antes de darla por perdida</span>
                <input class="input" type="number" name="ring" min="15" max="60" [(ngModel)]="ringTimeoutSec" />
              </label>
              <label class="row">
                <input type="checkbox" name="missed" [(ngModel)]="missedReplyEnabled" />
                <span><strong>Responder las llamadas perdidas</strong><small>Se envía este mensaje por WhatsApp al cliente.</small></span>
              </label>
              @if (missedReplyEnabled) {
                <label class="field">
                  <span>Mensaje</span>
                  <textarea class="textarea" name="missedText" rows="3" maxlength="1000" [(ngModel)]="missedReplyText"
                    placeholder="¡Hola! No pudimos atender tu llamada. Escríbenos por aquí y te respondemos enseguida."></textarea>
                </label>
              }
            </section>

            @if (formError()) { <p class="cs-error" role="alert">{{ formError() }}</p> }
          }
        </div>

        <div class="cs-foot">
          <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="loading() || saving()" (click)="save()">
            <lucide-icon [img]="Save" [size]="15" /> {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    .cs-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; justify-content: flex-end; z-index: 110; }
    .cs-drawer { width: min(520px, 100%); height: 100%; background: var(--color-white); display: flex; flex-direction: column;
      box-shadow: var(--shadow-lg); animation: cs-in .3s var(--transition-spring, ease-out); }
    .cs-head { display: flex; justify-content: space-between; gap: 12px; padding: 28px 28px 16px; border-bottom: 1px solid var(--color-border); }
    .cs-head h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-family: var(--font-heading); font-size: 19px; }
    .cs-head p { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .cs-body { flex: 1; overflow-y: auto; padding: 20px 28px; display: flex; flex-direction: column; gap: 22px; }
    section { display: flex; flex-direction: column; gap: 12px; }
    h3 { margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-muted); }
    .row { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
    .row input { margin-top: 3px; accent-color: var(--color-brand); }
    .row strong { display: block; font-size: 14px; color: var(--color-text-main); }
    .row small { display: block; font-size: 12.5px; color: var(--color-text-muted); margin-top: 2px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field > span { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .hours { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--radius-md); background: var(--color-bg-light); }
    .day { display: grid; grid-template-columns: 120px 1fr 1fr; gap: 8px; align-items: center; }
    .day-name { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
    .warn { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: var(--radius-md);
      background: var(--color-bg-light); color: var(--color-warning, var(--color-text-main)); font-size: 13px; }
    .muted { color: var(--color-text-muted); font-size: 14px; }
    .cs-error { margin: 0; color: var(--color-error); font-size: 13px; }
    .cs-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 28px; border-top: 1px solid var(--color-border); }
    .cs-foot .btn { display: inline-flex; align-items: center; gap: 6px; }
    @keyframes cs-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (max-width: 520px) { .cs-head, .cs-body, .cs-foot { padding-left: 18px; padding-right: 18px; } .day { grid-template-columns: 1fr 1fr; } .day-name { grid-column: 1 / -1; } }
  `],
})
export class CallSettingsComponent implements OnInit {
  readonly accountId = input.required<string>();
  readonly label = input('');
  readonly closed = output<void>();

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  readonly Phone = Phone;
  readonly X = X;
  readonly Save = Save;
  readonly TriangleAlert = TriangleAlert;

  loading = signal(true);
  saving = signal(false);
  metaError = signal('');
  formError = signal('');
  days = signal<DayRow[]>([]);

  enabled = false;
  showIcon = true;
  callback = false;
  hoursOn = false;
  timezone = '';
  ringTimeoutSec = 30;
  missedReplyEnabled = false;
  missedReplyText = '';
  /** Sin respuesta de Meta no se le manda nada (no pisar lo que haya allí). */
  private metaLoaded = false;

  async ngOnInit() {
    try {
      this.fill(await firstValueFrom(this.http.get<SettingsResponse>(`${API}/${this.accountId()}`)));
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo cargar la configuración de llamadas'));
      this.close();
    } finally {
      this.loading.set(false);
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input, button')?.focus(), {
        injector: this.injector,
      });
    }
  }

  fill(res: SettingsResponse) {
    const m = res.meta ?? {};
    this.metaLoaded = !!res.meta;
    this.metaError.set(res.metaError ?? '');
    this.enabled = m.status === 'ENABLED';
    this.showIcon = m.call_icon_visibility !== 'DISABLE_ALL';
    this.callback = m.callback_permission_status === 'ENABLED';
    this.hoursOn = m.call_hours?.status === 'ENABLED';
    this.timezone = m.call_hours?.timezone_id ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    const weekly = m.call_hours?.weekly_operating_hours ?? [];
    this.days.set(
      DAYS.map((d) => {
        const h = weekly.find((w) => w.day_of_week === d.key);
        return { ...d, open: !!h, from: h ? toHHMM(h.open_time) : '09:00', to: h ? toHHMM(h.close_time) : '18:00' };
      }),
    );
    this.ringTimeoutSec = res.local.ringTimeoutSec;
    this.missedReplyEnabled = res.local.missedReplyEnabled;
    this.missedReplyText = res.local.missedReplyText ?? '';
  }

  /** Arma el cuerpo del PUT; null si algo no es válido (y deja el error). */
  payload(): { meta?: MetaCalling; local: LocalCalling } | null {
    this.formError.set('');
    const ring = Number(this.ringTimeoutSec);
    if (!Number.isInteger(ring) || ring < 15 || ring > 60)
      return this.fail('El tiempo de espera debe estar entre 15 y 60 segundos');
    if (this.missedReplyEnabled && !this.missedReplyText.trim())
      return this.fail('Escribe el mensaje para las llamadas perdidas');
    const local: LocalCalling = {
      ringTimeoutSec: ring,
      missedReplyEnabled: this.missedReplyEnabled,
      missedReplyText: this.missedReplyText.trim() || undefined,
    };
    if (!this.metaLoaded) return { local };

    const meta: MetaCalling = {
      status: this.enabled ? 'ENABLED' : 'DISABLED',
      call_icon_visibility: this.showIcon ? 'DEFAULT' : 'DISABLE_ALL',
      callback_permission_status: this.callback ? 'ENABLED' : 'DISABLED',
    };
    if (this.hoursOn && this.enabled) {
      const open = this.days().filter((d) => d.open);
      if (!this.timezone.trim()) return this.fail('Indica la zona horaria del horario');
      if (!open.length) return this.fail('Marca al menos un día del horario');
      if (open.some((d) => !d.from || !d.to || d.from >= d.to))
        return this.fail('En cada día, la hora de cierre debe ser posterior a la de apertura');
      meta.call_hours = {
        status: 'ENABLED',
        timezone_id: this.timezone.trim(),
        weekly_operating_hours: open.map((d) => ({
          day_of_week: d.key,
          open_time: fromHHMM(d.from),
          close_time: fromHHMM(d.to),
        })),
      };
    } else {
      meta.call_hours = { status: 'DISABLED' };
    }
    return { meta, local };
  }

  async save() {
    const body = this.payload();
    if (!body) {
      this.toast.error(this.formError());
      return;
    }
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.http.put<SettingsResponse>(`${API}/${this.accountId()}`, body));
      this.fill(res);
      this.toast.success('Configuración de llamadas guardada');
      this.close();
    } catch (err) {
      const msg = this.message(err, 'No se pudo guardar la configuración');
      this.formError.set(msg);
      this.toast.error(msg);
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    this.closed.emit();
  }

  private fail(msg: string): null {
    this.formError.set(msg);
    return null;
  }

  private message(err: unknown, fallback: string): string {
    const msg = err instanceof HttpErrorResponse ? (err.error as { message?: unknown })?.message : undefined;
    if (Array.isArray(msg)) return msg.join('. ');
    return typeof msg === 'string' ? msg : fallback;
  }
}
