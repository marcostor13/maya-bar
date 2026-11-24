import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { PLAN_ADMIN_ROLE, UPGRADE_ROUTE } from './plan-limit';
import { AuthService } from '../auth/auth.service';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Clock, Lock, Download } from 'lucide-angular';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ToastService } from './toast';
import { BillingStatusService, daysLeft } from './billing-status.service';

const PERIOD_PARAM: Record<string, string> = { monthly: 'mensual', quarterly: 'trimestral', annual: 'anual' };

/**
 * Aviso de la prueba gratis en el shell (HU41): días restantes, tono de aviso
 * los últimos 3 días y solo lectura al vencer.
 */
@Component({
  selector: 'app-trial-banner',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    @if (view(); as v) {
      <div class="trial" [class.warn]="v.tone === 'warn'" [class.locked]="v.tone === 'locked'" [attr.role]="v.tone === 'locked' ? 'alert' : 'status'" aria-live="polite">
        <lucide-icon [img]="v.tone === 'locked' ? Lock : Clock" [size]="16" [strokeWidth]="2.4" />
        <span class="msg">{{ v.text }}</span>
        @if (isAdmin()) {
          @if (readOnly()) {
            <button type="button" class="btn btn-sm btn-ghost" (click)="exportConversations()" [disabled]="exporting()">
              <lucide-icon [img]="Download" [size]="14" /> Exportar conversaciones
            </button>
          }
          @if (v.pay) {
            <a class="btn btn-sm btn-danger" routerLink="/checkout" [queryParams]="v.pay">Actualizar medio de pago</a>
          } @else {
            <a class="btn btn-sm btn-primary" [routerLink]="planLink()" [fragment]="planFragment()">Elegir plan</a>
          }
        }
      </div>
    }
  `,
  styles: [`
    .trial {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 10px 16px; margin: 0 0 16px;
      border-radius: var(--radius-lg, 24px);
      background: var(--color-bg-light); color: var(--color-text-main);
      border: 1px solid var(--color-border);
      font-size: 13px; font-weight: 500;
    }
    .trial.warn { border-color: var(--color-warning); }
    .trial.warn lucide-icon { color: var(--color-warning); }
    .trial.locked {
      border-color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 8%, var(--color-bg-light));
    }
    .trial.locked lucide-icon { color: var(--color-error); }
    .msg { flex: 1; min-width: 180px; }
  `],
})
export class TrialBannerComponent implements OnInit {
  private billing = inject(BillingStatusService);
  private auth = inject(AuthService);
  isAdmin = computed(() => this.auth.currentUser()?.role === PLAN_ADMIN_ROLE);
  /** Reloj inyectable para pruebas. */
  now = input<() => Date>(() => new Date());
  /** Ruta de "Elegir plan". */
  planLink = signal(UPGRADE_ROUTE.path);
  planFragment = signal(UPGRADE_ROUTE.fragment);

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  readOnly = computed(() => !!this.billing.status()?.readOnly);
  exporting = signal(false);
  readonly Download = Download;

  /** En solo lectura los datos se pueden llevar (HU51). */
  exportConversations() {
    this.exporting.set(true);
    this.http.get(`${environment.apiUrl}/conversations/export.csv`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'conversaciones.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        this.exporting.set(false);
        this.toast.success('Conversaciones exportadas');
      },
      error: err => {
        this.exporting.set(false);
        this.toast.error(err.error?.message || 'No se pudieron exportar las conversaciones');
      },
    });
  }

  readonly Clock = Clock;
  readonly Lock = Lock;

  view = computed((): { tone: 'info' | 'warn' | 'locked'; text: string; pay?: Record<string, string> } | null => {
    const s = this.billing.status();
    if (!s) return null;
    // Cobro fallido (HU51): el pago se rehace con el mismo plan, periodo y moneda.
    const failed = s.status === 'past_due' || (s.readOnly && !!s.subscription?.graceEndsAt);
    const pay = failed
      ? {
          plan: s.plan,
          periodo: PERIOD_PARAM[s.subscription?.period ?? 'monthly'],
          ...(s.subscription?.currency ? { moneda: s.subscription.currency } : {}),
        }
      : undefined;
    if (s.readOnly)
      return {
        tone: 'locked',
        pay,
        text: `${s.reason ?? 'Tu plan no está activo'}. Tus datos están a salvo: puedes verlos y exportarlos.`,
      };
    if (s.status === 'past_due') {
      const until = s.subscription?.graceEndsAt
        ? new Date(s.subscription.graceEndsAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })
        : null;
      return {
        tone: 'locked',
        pay,
        text: until
          ? `No pudimos cobrar tu plan. Todo sigue funcionando hasta el ${until}; después la cuenta queda en solo lectura.`
          : 'No pudimos cobrar tu plan. Actualiza tu medio de pago para no perder el acceso.',
      };
    }
    if (s.status !== 'trialing' || !s.trialEndsAt) return null;
    const left = daysLeft(s.trialEndsAt, this.now()());
    return {
      tone: left <= 3 ? 'warn' : 'info',
      text: left === 1
        ? `Te queda 1 día de prueba gratis del plan ${s.planName}.`
        : `Te quedan ${left} días de prueba gratis del plan ${s.planName}.`,
    };
  });

  ngOnInit() {
    if (!this.billing.status()) this.billing.load();
  }
}
