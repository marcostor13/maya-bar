import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { PaymentLogosComponent } from '../../shared/payment-logos';

export interface CheckoutStatus {
  status: 'pending' | 'awaiting_payment' | 'paid' | 'rejected' | 'fulfilled';
  plan?: string;
  planName: string;
  kind?: 'plan' | 'upgrade' | 'addon' | 'renewal';
  /** Implementación (HU55); en mensual se paga aparte con `redirectUrl`. */
  setup?: { name: string; total: number; paid: boolean; redirectUrl?: string };
  itemName?: string;
  period: string;
  total: number;
  currency: 'PEN' | 'USD';
  mode: 'subscription' | 'one_time';
  paymentMethod?: string;
  existingAccount: boolean;
}

const POLL_MS = 3000;
const MAX_POLLS = 60;

/**
 * Vuelta de Mercado Pago (HU46 §3). Lo que trae la URL no cuenta: se consulta
 * el estado que confirmó el webhook hasta que haya un resultado.
 */
@Component({
  selector: 'app-checkout-result',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, PaymentLogosComponent],
  template: `
    <div class="result-page">
      <a routerLink="/" class="brand"><img src="/logo.png?v=2" alt="Maya CRM" /></a>
      <div class="card result animate-fade-in" role="status" aria-live="polite">
        @switch (view()) {
          @case ('done') {
            <lucide-icon [img]="CheckCircle2" [size]="44" class="ok" />
            @if (s()?.kind === 'addon') {
              <h1>¡Listo! Tu compra de {{ s()?.itemName }} ya está en tu cuenta</h1>
            } @else {
              <h1>¡Listo! Tu plan {{ s()?.planName }} está activo</h1>
            }
            @if (s()?.setup; as st) {
              @if (st.redirectUrl) {
                <p data-testid="setup-pending">Falta pagar tu <strong>{{ st.name }}</strong> para que el equipo agende la primera sesión.</p>
                <a class="btn btn-primary" [href]="st.redirectUrl">Pagar {{ st.name }}</a>
              } @else if (st.paid) {
                <p>Tu <strong>{{ st.name }}</strong> está pagada: te escribimos para agendar la primera sesión.</p>
              }
            }
            @if (loggedIn()) {
              <p>Ya puedes seguir trabajando con todo lo de tu plan.</p>
              <a class="btn btn-primary" routerLink="/settings/plan">Ir a mi cuenta</a>
            } @else {
              <p>Te enviamos un correo con el enlace para entrar a tu cuenta. Revisa también la carpeta de spam.</p>
              <a class="btn btn-secondary" routerLink="/login">Ir a ingresar</a>
            }
          }
          @case ('awaiting') {
            <lucide-icon [img]="Clock" [size]="44" class="warn" />
            <h1>Tu pago está pendiente</h1>
            @if (s()?.paymentMethod === 'ticket') {
              <p data-testid="pagoefectivo">
                Paga el código de PagoEfectivo en una agencia, agente o tu banca por internet antes de que venza.
                Cuando se confirme, te llega el acceso por correo.
              </p>
            } @else {
              <p>Mercado Pago está revisando el pago. Cuando se confirme, te llega el acceso por correo.</p>
            }
          }
          @case ('rejected') {
            <lucide-icon [img]="XCircle" [size]="44" class="bad" />
            <h1>El pago no se aprobó</h1>
            <p>No se hizo ningún cobro. Prueba con otra tarjeta o con otro medio de pago.</p>
            <a class="btn btn-primary" routerLink="/checkout" [queryParams]="retryParams()">Intentar de nuevo</a>
          }
          @case ('missing') {
            <h1>No encontramos tu compra</h1>
            <p>Si ya pagaste, revisa tu correo o escríbenos.</p>
            <a class="btn btn-secondary" routerLink="/">Volver al inicio</a>
          }
          @case ('slow') {
            <lucide-icon [img]="Clock" [size]="44" class="warn" />
            <h1>Seguimos esperando la confirmación</h1>
            <p>Mercado Pago aún no nos confirmó el pago. Te avisaremos por correo apenas llegue; puedes cerrar esta página.</p>
          }
          @case ('activating') {
            <lucide-icon [img]="Loader2" [size]="44" class="spin" />
            <h1>Pago confirmado. Activando tu cuenta…</h1>
            <p>En unos segundos queda lista.</p>
          }
          @default {
            <lucide-icon [img]="Loader2" [size]="44" class="spin" />
            <h1>Confirmando tu pago…</h1>
            <p>Esto suele tardar unos segundos. No cierres esta página.</p>
          }
        }
        @if (s(); as st) {
          <dl class="recap" data-testid="recap">
            <div><dt>Compra</dt><dd>{{ st.kind === 'addon' ? st.itemName : 'Plan ' + st.planName }}</dd></div>
            <div><dt>Total</dt><dd>{{ money(st.total, st.currency) }}</dd></div>
          </dl>
        }
        <app-payment-logos class="by" [cardsOnly]="s()?.mode === 'subscription'" />
      </div>
    </div>
  `,
  styles: [`
    .result-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
      padding: 24px 16px; box-sizing: border-box; background: var(--color-bg-app); }
    .brand img { height: 32px; display: block; }
    .result { width: 100%; max-width: 480px; padding: 36px 28px 28px; text-align: center; display: flex; flex-direction: column;
      align-items: center; gap: 12px; box-sizing: border-box; }
    .recap { width: 100%; margin: 10px 0 0; padding: 14px 16px; border-radius: 16px; background: var(--color-bg-light); display: grid; gap: 8px; box-sizing: border-box; }
    .recap div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .recap dt { color: var(--color-text-muted); }
    .recap dd { margin: 0; font-weight: 600; text-align: right; }
    .by { margin-top: 10px; padding-top: 16px; border-top: 1px solid var(--color-border); width: 100%; }
    @media (max-width: 480px) { .result { padding: 28px 18px 22px; } h1 { font-size: 19px; } }
    h1 { font-family: var(--font-heading); font-size: 21px; margin: 0; }
    p { margin: 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.6; }
    .ok { color: var(--color-success); } .warn { color: var(--color-warning); } .bad { color: var(--color-error); }
    .spin { color: var(--color-brand); animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class CheckoutResultComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly CheckCircle2 = CheckCircle2; readonly Clock = Clock; readonly XCircle = XCircle; readonly Loader2 = Loader2;

  s = signal<CheckoutStatus | null>(null);

  money(n: number, currency: 'PEN' | 'USD') {
    return `${currency === 'USD' ? 'US$' : 'S/'} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  missing = signal(false);
  polls = signal(0);
  private timer?: ReturnType<typeof setTimeout>;
  loggedIn = computed(() => !!this.auth.currentUser());
  private static readonly PERIOD_KEYS: Record<string, string> = { monthly: 'mensual', quarterly: 'trimestral', annual: 'anual' };
  retryParams = computed(() => {
    const st = this.s();
    return st ? { plan: st.plan, periodo: CheckoutResultComponent.PERIOD_KEYS[st.period] ?? 'mensual', moneda: st.currency } : {};
  });

  view = computed(() => {
    if (this.missing()) return 'missing';
    const st = this.s()?.status;
    // Pagado pero la cuenta aún se está activando: sigue esperando (HU47).
    if (st === 'fulfilled') return 'done';
    if (st === 'paid') return this.polls() >= MAX_POLLS ? 'slow' : 'activating';
    if (st === 'awaiting_payment') return 'awaiting';
    if (st === 'rejected') return 'rejected';
    if (this.polls() >= MAX_POLLS) return 'slow';
    return 'waiting';
  });

  ngOnInit(): void {
    if (this.browser) this.poll();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private poll() {
    const id = this.route.snapshot.queryParamMap.get('session');
    if (!id) { this.missing.set(true); return; }
    this.http.get<CheckoutStatus>(`${environment.apiUrl}/public/checkout/${encodeURIComponent(id)}`).subscribe({
      next: st => {
        this.s.set(st);
        this.polls.update(n => n + 1);
        if (['waiting', 'awaiting', 'activating'].includes(this.view())) this.timer = setTimeout(() => this.poll(), POLL_MS);
      },
      error: err => {
        if (err.status === 404) { this.missing.set(true); return; }
        this.polls.update(n => n + 1);
        if (this.polls() < MAX_POLLS) this.timer = setTimeout(() => this.poll(), POLL_MS);
      },
    });
  }
}
