import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, ArrowUp, ArrowDown, X, RotateCcw } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

export interface PlanOption {
  plan: string; name: string; direction: 'up' | 'down'; price: number | null;
  dueNow: number; dueNowWithIgv: number;
  excess: { key: string; used: number; limit: number }[];
}
export interface PlanOptions {
  current: string; paid: boolean; pastDue?: boolean; period?: string; currency?: 'PEN' | 'USD';
  currentPeriodEnd?: string; cancelAtPeriodEnd: boolean; pendingPlan?: string;
  plans: PlanOption[];
  users: { id: string; name?: string; email: string; role: string }[];
}

const LABELS: Record<string, string> = {
  users: 'usuarios', whatsappNumbers: 'números de WhatsApp', contacts: 'contactos',
  mailboxes: 'buzones de correo', aiAgents: 'agentes de IA', activeEvents: 'eventos publicados',
};

/** Subir, bajar, cancelar y reactivar el plan (HU52), dentro de Mi plan. */
@Component({
  selector: 'app-plan-change-panel',
  standalone: true,
  host: { '(document:keydown.escape)': 'closeModals()' },
  imports: [FormsModule, DatePipe, LucideAngularModule],
  template: `
    @if (opts(); as o) {
      @if (o.paid) {
        @if (o.pastDue) {
          <button class="btn btn-ghost btn-sm cancel-link" type="button" (click)="cancelOpen.set(true)" [disabled]="busy()">Cancelar mi plan</button>
        } @else if (o.cancelAtPeriodEnd) {
          <p class="note warn">Cancelaste tu plan: sigue activo hasta el <strong>{{ o.currentPeriodEnd | date: 'd MMM y' }}</strong>; luego queda en solo lectura.</p>
          <button class="btn btn-primary btn-sm" type="button" (click)="reactivate()" [disabled]="busy()">
            <lucide-icon [img]="RotateCcw" [size]="14" /> Reactivar mi plan
          </button>
        } @else {
          @if (o.pendingPlan) {
            <p class="note">Pasarás al plan <strong>{{ nameOf(o.pendingPlan) }}</strong> el {{ o.currentPeriodEnd | date: 'd MMM y' }}.
              <button class="btn btn-ghost btn-sm" type="button" (click)="undoDowngrade()" [disabled]="busy()">Deshacer</button>
            </p>
          }
          <div class="options">
            @for (p of o.plans; track p.plan) {
              <div class="option">
                <div>
                  <p class="opt-name">{{ p.name }}</p>
                  <p class="muted small">
                    @if (p.price !== null) { {{ money(p.price) }} por periodo · }
                    @if (p.direction === 'up') { Hoy pagas {{ money(p.dueNowWithIgv) }} por los días que quedan }
                    @else { Entra el {{ o.currentPeriodEnd | date: 'd MMM y' }} }
                  </p>
                </div>
                @if (p.direction === 'up') {
                  <button class="btn btn-primary btn-sm" type="button" (click)="upgrade(p)" [disabled]="busy()">
                    <lucide-icon [img]="ArrowUp" [size]="14" /> Subir a {{ p.name }}
                  </button>
                } @else if (o.pendingPlan !== p.plan) {
                  <button class="btn btn-secondary btn-sm" type="button" (click)="startDowngrade(p)" [disabled]="busy()">
                    <lucide-icon [img]="ArrowDown" [size]="14" /> Bajar a {{ p.name }}
                  </button>
                }
              </div>
            }
          </div>
          <button class="btn btn-ghost btn-sm cancel-link" type="button" (click)="cancelOpen.set(true)" [disabled]="busy()">Cancelar mi plan</button>
        }
      }
    }

    @if (downgradeTo(); as d) {
      <div class="overlay" (click)="downgradeTo.set(null)">
        <div class="card modal" role="dialog" aria-modal="true" aria-labelledby="down-title" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3 id="down-title">Bajar al plan {{ d.name }}</h3>
            <button class="btn btn-ghost btn-icon" type="button" aria-label="Cerrar" (click)="downgradeTo.set(null)"><lucide-icon [img]="X" [size]="18" /></button>
          </div>
          @for (e of otherExcess(); track e.key) {
            <p class="muted small">Tienes {{ e.used }} {{ label(e.key) }} y el plan permite {{ e.limit }}: los que ya tienes siguen funcionando, pero no podrás añadir más hasta bajar de ese número.</p>
          }
          @if (userLimit(); as limit) {
            <p class="small">Elige los <strong>{{ limit }}</strong> usuarios que seguirán activos. El resto queda sin acceso, pero no se borra.</p>
            <ul class="users">
              @for (u of opts()!.users; track u.id) {
                <li>
                  <label>
                    <input type="checkbox" [checked]="keep().has(u.id)" (change)="toggle(u.id)"
                      [disabled]="!keep().has(u.id) && keep().size >= limit" />
                    {{ u.name || u.email }} <span class="muted small">{{ u.role === 'TENANT_ADMIN' ? 'Administrador' : u.email }}</span>
                  </label>
                </li>
              }
            </ul>
          }
          <div class="actions">
            <button class="btn btn-secondary" type="button" (click)="downgradeTo.set(null)">Volver</button>
            <button class="btn btn-primary" type="button" (click)="confirmDowngrade()"
              [disabled]="busy() || (userLimit() !== null && keep().size !== userLimit())">Programar cambio</button>
          </div>
        </div>
      </div>
    }

    @if (cancelOpen()) {
      <div class="overlay" (click)="cancelOpen.set(false)">
        <div class="card modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3 id="cancel-title">Cancelar mi plan</h3>
            <button class="btn btn-ghost btn-icon" type="button" aria-label="Cerrar" (click)="cancelOpen.set(false)"><lucide-icon [img]="X" [size]="18" /></button>
          </div>
          <p class="small">No se te cobrará más. Todo sigue funcionando hasta el {{ opts()?.currentPeriodEnd | date: 'd MMM y' }}; después la cuenta queda en solo lectura y tus datos no se borran.</p>
          <label class="field">
            <span>¿Por qué cancelas? (opcional)</span>
            <textarea class="textarea" rows="3" maxlength="500" [(ngModel)]="reason" name="reason"></textarea>
          </label>
          <div class="actions">
            <button class="btn btn-secondary" type="button" (click)="cancelOpen.set(false)">Volver</button>
            <button class="btn btn-danger" type="button" (click)="cancelPlan()" [disabled]="busy()">Cancelar plan</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .note { font-size: 14px; margin: 12px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .note.warn { color: var(--color-warning); }
    .options { display: grid; gap: 12px; margin-top: 16px; }
    .option { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 14px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
    .opt-name { font-weight: 700; margin: 0 0 2px; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 13px; }
    .cancel-link { margin-top: 12px; color: var(--color-text-muted); }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; box-sizing: border-box;
      max-height: calc(100vh - 48px); overflow: auto; animation: pop .25s var(--transition-spring, ease); }
    .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .modal-head h3 { font-family: var(--font-heading); margin: 0; font-size: 18px; }
    .users { list-style: none; padding: 0; margin: 12px 0; display: grid; gap: 8px; }
    .users label { display: flex; gap: 8px; align-items: center; font-size: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; margin-top: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
    @keyframes pop { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (max-width: 768px) { .modal { padding: 20px 16px; } }
  `],
})
export class PlanChangePanelComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private api = `${environment.apiUrl}/billing/plan`;
  /** Avisa a Mi plan para recargar el estado. */
  changed = output<void>();

  readonly ArrowUp = ArrowUp; readonly ArrowDown = ArrowDown; readonly X = X; readonly RotateCcw = RotateCcw;

  opts = signal<PlanOptions | null>(null);
  busy = signal(false);
  downgradeTo = signal<PlanOption | null>(null);
  keep = signal<Set<string>>(new Set());
  cancelOpen = signal(false);
  reason = '';

  userLimit = computed(() => this.downgradeTo()?.excess.find(e => e.key === 'users')?.limit ?? null);
  otherExcess = computed(() => this.downgradeTo()?.excess.filter(e => e.key !== 'users') ?? []);

  ngOnInit() { this.load(); }

  /** ESC cierra el modal abierto, esté donde esté el foco. */
  closeModals() { this.downgradeTo.set(null); this.cancelOpen.set(false); }

  load() {
    this.http.get<PlanOptions>(`${this.api}/options`).subscribe({
      next: o => this.opts.set(o),
      error: err => this.toast.error(err.error?.message || 'No se pudieron cargar las opciones de plan'),
    });
  }

  label(k: string) { return LABELS[k] ?? k; }
  nameOf(plan: string) { return this.opts()?.plans.find(p => p.plan === plan)?.name ?? plan; }
  money(n: number) {
    const c = this.opts()?.currency === 'USD' ? 'US$' : 'S/';
    return `${c} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private fail(err: { error?: { message?: string | string[] } }, fallback: string) {
    this.busy.set(false);
    const raw = err.error?.message;
    this.toast.error((Array.isArray(raw) ? raw[0] : raw) || fallback);
  }

  private done(msg: string) {
    this.busy.set(false);
    this.toast.success(msg);
    this.load();
    this.changed.emit();
  }

  async upgrade(p: PlanOption) {
    const ok = await this.confirm.confirm({
      title: `Subir al plan ${p.name}`,
      message: `Pagas hoy ${this.money(p.dueNowWithIgv)} por los días que quedan del periodo y el plan cambia al confirmarse el pago.`,
      confirmText: 'Ir a pagar',
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.post<{ redirectUrl?: string; applied?: boolean }>(`${this.api}/upgrade`, { plan: p.plan }).subscribe({
      next: r => {
        if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
        this.done(`Ya estás en el plan ${p.name}`);
      },
      error: err => this.fail(err, 'No se pudo iniciar el cambio de plan'),
    });
  }

  startDowngrade(p: PlanOption) {
    this.keep.set(new Set());
    this.downgradeTo.set(p);
  }

  toggle(id: string) {
    const next = new Set(this.keep());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.keep.set(next);
  }

  confirmDowngrade() {
    const d = this.downgradeTo();
    if (!d) return;
    this.busy.set(true);
    const body = { plan: d.plan, ...(this.userLimit() !== null ? { keepUserIds: [...this.keep()] } : {}) };
    this.http.post(`${this.api}/downgrade`, body).subscribe({
      next: () => { this.downgradeTo.set(null); this.done(`Cambio al plan ${d.name} programado`); },
      error: err => this.fail(err, 'No se pudo programar el cambio'),
    });
  }

  undoDowngrade() {
    this.busy.set(true);
    this.http.delete(`${this.api}/downgrade`).subscribe({
      next: () => this.done('Cambio de plan deshecho'),
      error: err => this.fail(err, 'No se pudo deshacer el cambio'),
    });
  }

  cancelPlan() {
    this.busy.set(true);
    this.http.post(`${this.api}/cancel`, { reason: this.reason.trim() || undefined }).subscribe({
      next: () => { this.cancelOpen.set(false); this.done('Plan cancelado: sigue activo hasta el fin del periodo'); },
      error: err => this.fail(err, 'No se pudo cancelar el plan'),
    });
  }

  reactivate() {
    this.busy.set(true);
    this.http.post(`${this.api}/reactivate`, {}).subscribe({
      next: () => this.done('Tu plan sigue activo'),
      error: err => this.fail(err, 'No se pudo reactivar el plan'),
    });
  }
}
