import { Component, HostListener, Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ToastService } from './toast';
import { catchError, throwError } from 'rxjs';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { BillingStatusService } from './billing-status.service';
import { AuthService } from '../auth/auth.service';

/** Códigos 402 del backend que se resuelven pagando (HU41, HU42, HU43). */
export const BILLING_CODES = ['PLAN_LIMIT', 'PLAN_FEATURE', 'AI_CREDITS', 'SUBSCRIPTION_REQUIRED'] as const;
export type BillingCode = (typeof BILLING_CODES)[number];

export interface PlanLimitState {
  code: BillingCode;
  message: string;
  resource?: string;
}

/** Dónde se mejora el plan y se compran add-ons: Mi plan (HU44). */
export const UPGRADE_ROUTE = { path: '/settings/plan', fragment: undefined as string | undefined };

/** Add-on que amplía cada recurso con límite (HU53). */
const ADDON_FOR_RESOURCE: Record<string, string> = {
  users: 'extra_user', whatsappNumbers: 'extra_whatsapp', contacts: 'extra_contacts', campaignEmailsPerMonth: 'emails_10000',
};

/** Solo el administrador de la empresa gestiona el plan (HU44 C3). */
export const PLAN_ADMIN_ROLE = 'TENANT_ADMIN';

@Injectable({ providedIn: 'root' })
export class PlanLimitService {
  readonly state = signal<PlanLimitState | null>(null);

  open(s: PlanLimitState) { this.state.set(s); }
  close() { this.state.set(null); }
}

/** Abre el diálogo de mejora ante un 402 de cobro y deja pasar el error. */
export const planLimitInterceptor: HttpInterceptorFn = (req, next) => {
  const dialog = inject(PlanLimitService);
  const status = inject(BillingStatusService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 402) {
        const body = (err.error ?? {}) as { code?: string; message?: string; resource?: string };
        if ((BILLING_CODES as readonly string[]).includes(body.code ?? ''))
          dialog.open({
            code: body.code as BillingCode,
            message: body.message ?? 'Esta acción no está incluida en tu plan.',
            resource: body.resource,
          });
        // El plan venció durante la sesión: se refresca el aviso del shell.
        if (body.code === 'SUBSCRIPTION_REQUIRED') status.load();
      }
      return throwError(() => err);
    }),
  );
};

const TITLES: Record<BillingCode, string> = {
  PLAN_LIMIT: 'Llegaste al límite de tu plan',
  PLAN_FEATURE: 'Función de un plan superior',
  AI_CREDITS: 'Te quedaste sin créditos de IA',
  SUBSCRIPTION_REQUIRED: 'Tu plan no está activo',
};

@Component({
  selector: 'app-plan-limit',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (service.state(); as s) {
      <div class="overlay" (click)="service.close()">
        <div class="card plan-card animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="pl-title" (click)="$event.stopPropagation()">
          <div class="icon"><lucide-icon [img]="Sparkles" [size]="22" [strokeWidth]="2.2" /></div>
          <h3 id="pl-title">{{ title(s.code) }}</h3>
          <p>{{ s.message }}</p>
          @if (isAdmin()) {
            <div class="actions">
              @if (addonFor(s); as addon) {
                <button type="button" class="btn btn-secondary" (click)="buyAddon(addon)" [disabled]="buying()">Comprar add-on</button>
              }
              <button type="button" class="btn btn-primary" (click)="go()" autofocus>Mejorar plan</button>
            </div>
          } @else {
            <p class="ask-admin">Pídele al administrador de tu empresa que mejore el plan.</p>
          }
          <button type="button" class="btn btn-ghost btn-sm close" (click)="service.close()">Ahora no</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 2100; }
    .plan-card { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: var(--color-brand-light); color: var(--color-brand); }
    h3 { margin: 0; font-family: var(--font-heading); font-size: 18px; color: var(--color-text-main); }
    p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-muted); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
    .close { margin-top: 4px; }
    .ask-admin { font-weight: 600; color: var(--color-text-main); }
  `],
})
export class PlanLimitDialogComponent {
  service = inject(PlanLimitService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  readonly Sparkles = Sparkles;
  buying = signal(false);

  /** Add-on que resuelve el límite (HU53); los demás recursos solo se amplían subiendo de plan. */
  addonFor(s: PlanLimitState): string | null {
    if (s.code === 'AI_CREDITS') return 'credits_1000';
    if (s.code !== 'PLAN_LIMIT') return null;
    return ADDON_FOR_RESOURCE[s.resource ?? ''] ?? null;
  }

  /** Compra en un paso: abre el pago de Mercado Pago directamente. */
  buyAddon(addon: string) {
    this.buying.set(true);
    this.http.post<{ redirectUrl?: string; applied?: boolean }>(`${environment.apiUrl}/billing/addons/buy`, { addon }).subscribe({
      next: r => {
        this.buying.set(false);
        if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
        this.service.close();
        this.toast.success('Listo: ya tienes el extra en tu cuenta');
      },
      error: err => {
        this.buying.set(false);
        this.toast.error((err as { error?: { message?: string } }).error?.message || 'No se pudo iniciar la compra');
        this.go('addons');
      },
    });
  }

  isAdmin() { return this.auth.currentUser()?.role === PLAN_ADMIN_ROLE; }

  title(code: BillingCode) { return TITLES[code]; }

  go(fragment = UPGRADE_ROUTE.fragment) {
    this.service.close();
    void this.router.navigate([UPGRADE_ROUTE.path], { fragment });
  }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.service.state()) this.service.close(); }
}
