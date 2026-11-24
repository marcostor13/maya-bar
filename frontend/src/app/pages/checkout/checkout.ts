import { Component, OnInit, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { TitleCasePipe, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Lock, ShieldCheck } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { TurnstileComponent } from '../../shared/turnstile';
import { AuthService } from '../../auth/auth.service';
import { isValidRuc } from './ruc';

export type Period = 'mensual' | 'trimestral' | 'anual';
type PlanKey = 'inicia' | 'crece' | 'escala';

export interface Quote {
  plan: string; planName: string; period: string; currency: 'PEN' | 'USD';
  subtotal: number; igv: number; total: number; mode: 'subscription' | 'one_time';
  /** Cupón aplicado (HU54): precio de lista y descuento, ambos sin IGV. */
  listSubtotal?: number; discount?: number; couponCode?: string; couponLabel?: string;
  /** Add-ons mensuales de la cuenta que entran en el periodo (HU53). */
  addonsSubtotal?: number;
  /** Implementación (HU55); `dueToday` = plan + implementación si van juntos. */
  setup?: { id: string; name: string; price: number; discount: number; subtotal: number; igv: number; total: number; separate?: boolean };
  dueToday?: number;
}

const PLANS: PlanKey[] = ['inicia', 'crece', 'escala'];
const PERIODS: Period[] = ['mensual', 'trimestral', 'anual'];

/** DNI de 8 dígitos para boleta; RUC con dígito verificador para factura. */
export function docValidator(group: AbstractControl): ValidationErrors | null {
  const type = group.get('docType')?.value;
  const num = String(group.get('docNumber')?.value ?? '').trim();
  if (type === 'factura') {
    if (!isValidRuc(num)) return { ruc: true };
    if (!String(group.get('address')?.value ?? '').trim()) return { address: true };
    return null;
  }
  return /^\d{8}$/.test(num) ? null : { dni: true };
}

/** Checkout de planes (HU46): resumen con IGV, datos y salto a Mercado Pago. */
@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TitleCasePipe, LucideAngularModule, TurnstileComponent],
  template: `
    <div class="checkout-page">
      <header class="top">
        <a routerLink="/" class="brand"><img src="/logo.png?v=2" alt="Maya CRM" /></a>
        <span class="secure"><lucide-icon [img]="Lock" [size]="14" /> Pago seguro con Mercado Pago</span>
      </header>

      <div class="layout">
        <!-- Resumen -->
        <aside class="card summary">
          <h1 class="title">Tu plan</h1>
          <div class="pills" role="radiogroup" aria-label="Plan">
            @for (p of plans; track p) {
              <button type="button" class="pill" [class.active]="plan() === p" (click)="setPlan(p)" [attr.aria-pressed]="plan() === p">{{ p | titlecase }}</button>
            }
          </div>
          <div class="pills" role="radiogroup" aria-label="Periodo">
            @for (p of periods; track p) {
              <button type="button" class="pill" [class.active]="period() === p" (click)="setPeriod(p)" [attr.aria-pressed]="period() === p">{{ periodLabel(p) }}</button>
            }
          </div>
          <div class="pills small" role="radiogroup" aria-label="Moneda">
            <button type="button" class="pill" [class.active]="currency() === 'PEN'" (click)="setCurrency('PEN')">Soles (Perú)</button>
            <button type="button" class="pill" [class.active]="currency() === 'USD'" (click)="setCurrency('USD')">Dólares</button>
          </div>

          <div class="pills small setup-pick" role="radiogroup" aria-label="Implementación">
            @for (o of setupOptions; track o.id) {
              <button type="button" class="pill" role="radio" [attr.aria-checked]="setup() === o.id" [class.active]="setup() === o.id" (click)="setSetup(o.id)">{{ o.label }}</button>
            }
          </div>

          @if (quote(); as q) {
            <dl class="lines">
              <div><dt>Plan {{ q.planName }} · {{ periodLabel(period()) }}</dt><dd>{{ money(q.listSubtotal ?? q.subtotal - (q.addonsSubtotal ?? 0)) }}</dd></div>
              @if (q.addonsSubtotal) {
                <div><dt>Extras contratados</dt><dd data-testid="addons">{{ money(q.addonsSubtotal) }}</dd></div>
              }
              @if (q.discount) {
                <div class="discount"><dt>Cupón {{ q.couponCode }}{{ q.couponLabel ? ' · ' + q.couponLabel : '' }}</dt><dd data-testid="discount">−{{ money(q.discount) }}</dd></div>
              }
              @if (q.currency === 'PEN') {
                <div><dt>IGV (18 %)</dt><dd data-testid="igv">{{ money(q.igv) }}</dd></div>
              }
              <div class="total"><dt>{{ q.setup ? 'Total del plan' : 'Total' }}</dt><dd data-testid="total">{{ money(q.total) }}</dd></div>
            </dl>
            @if (q.setup; as st) {
              <dl class="lines setup-lines">
                <div><dt>{{ st.name }}</dt><dd>{{ money(st.price) }}</dd></div>
                @if (st.discount) {
                  <div class="discount"><dt>Descuento por plan anual</dt><dd data-testid="setup-discount">−{{ money(st.discount) }}</dd></div>
                }
                @if (q.currency === 'PEN') { <div><dt>IGV (18 %)</dt><dd>{{ money(st.igv) }}</dd></div> }
                <div class="total"><dt>{{ st.separate ? 'Implementación (pago aparte)' : 'Hoy pagas' }}</dt>
                  <dd data-testid="due-today">{{ money(st.separate ? st.total : q.dueToday ?? q.total) }}</dd></div>
              </dl>
              @if (st.separate) {
                <p class="note">La implementación se paga aparte, justo después de activar tu suscripción mensual.</p>
              }
            }
            <p class="note">
              @if (q.mode === 'subscription') { Cobro automático cada mes con tarjeta. Cancela cuando quieras. }
              @else { Pago único con tarjeta, Yape o PagoEfectivo. Te avisamos antes de renovar. }
            </p>
          } @else {
            <p class="note">Calculando…</p>
          }

          <div class="coupon">
            @if (appliedCoupon()) {
              <p class="note">Cupón <strong>{{ appliedCoupon() }}</strong> aplicado.
                <button type="button" class="btn btn-ghost btn-sm" (click)="removeCoupon()">Quitar</button>
              </p>
            } @else {
              <label class="field">
                <span>¿Tienes un cupón?</span>
                <span class="coupon-row">
                  <input class="input" [value]="couponInput()" (input)="couponInput.set($any($event.target).value)"
                    (keydown.enter)="$event.preventDefault(); applyCoupon()" autocomplete="off" aria-describedby="coupon-error" />
                  <button type="button" class="btn btn-secondary btn-sm" (click)="applyCoupon()" [disabled]="!couponInput().trim()">Aplicar</button>
                </span>
              </label>
              @if (couponError()) { <p class="coupon-error" id="coupon-error" role="alert">{{ couponError() }}</p> }
            }
          </div>
        </aside>

        <!-- Datos -->
        <form class="card form" [formGroup]="form" (ngSubmit)="submit()">
          <h2 class="title">Tus datos</h2>
          <div formGroupName="buyer" class="grid">
            <label class="field"><span>Empresa</span><input class="input" formControlName="company" autocomplete="organization" /></label>
            <label class="field"><span>Tu nombre</span><input class="input" formControlName="name" autocomplete="name" /></label>
            <label class="field"><span>Correo</span><input class="input" type="email" formControlName="email" autocomplete="email" /></label>
            <label class="field"><span>Teléfono</span><input class="input" type="tel" formControlName="phone" autocomplete="tel" /></label>
          </div>

          <h2 class="title">Comprobante</h2>
          <div formGroupName="billing" class="grid">
            <label class="field">
              <span>Tipo</span>
              <select class="select" formControlName="docType">
                <option value="boleta">Boleta (DNI)</option>
                <option value="factura">Factura (RUC)</option>
              </select>
            </label>
            <label class="field">
              <span>{{ isFactura() ? 'RUC' : 'DNI' }}</span>
              <input class="input" formControlName="docNumber" inputmode="numeric" [attr.maxlength]="isFactura() ? 11 : 8" />
            </label>
            <label class="field"><span>{{ isFactura() ? 'Razón social' : 'Nombre completo' }}</span><input class="input" formControlName="legalName" /></label>
            @if (isFactura()) {
              <label class="field"><span>Dirección fiscal</span><input class="input" formControlName="address" /></label>
            }
          </div>
          @if (docError(); as e) { <p class="form-error" data-testid="doc-error">{{ e }}</p> }

          <label class="check-row">
            <input type="checkbox" formControlName="acceptTerms" />
            <span>Acepto los <a routerLink="/terminos" target="_blank">términos del servicio</a> y la <a routerLink="/privacidad" target="_blank">política de privacidad</a>.</span>
          </label>

          @if (!loggedIn() && siteKey) {
            <app-turnstile [siteKey]="siteKey" (token)="captchaToken.set($event)" />
          }
          @if (error()) { <p class="form-error">{{ error() }}</p> }

          <button type="submit" class="btn btn-primary btn-lg pay" [disabled]="!canSubmit()">
            <lucide-icon [img]="ShieldCheck" [size]="18" />
            {{ loading() ? 'Conectando con Mercado Pago…' : 'Pagar ' + (quote() ? money(quote()!.setup && !quote()!.setup!.separate ? quote()!.dueToday! : quote()!.total) : '') }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .checkout-page { min-height: 100vh; background: var(--color-bg-app); padding: 24px 16px 48px; box-sizing: border-box; }
    .top { max-width: 1040px; margin: 0 auto 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .brand img { height: 36px; }
    .secure { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--color-text-muted); }
    .layout { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); gap: 24px; align-items: start; }
    .card { padding: 24px; min-width: 0; }
    .title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0 0 14px; }
    .form .title:not(:first-child) { margin-top: 24px; }
    .pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .pill { min-height: 36px; padding: 0 14px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); color: var(--color-text-main); font: 600 13px var(--font-base); cursor: pointer; }
    .pill.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .pills.small .pill { min-height: 30px; font-size: 12px; }
    .lines { margin: 16px 0 8px; display: grid; gap: 8px; }
    .lines div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .lines dt { color: var(--color-text-muted); margin: 0; }
    .lines dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
    .lines .discount dd { color: var(--color-success); }
    .coupon { margin-top: 16px; }
    .setup-pick { margin-top: 12px; flex-wrap: wrap; }
    .setup-lines { margin-top: 12px; }
    .coupon-row { display: flex; gap: 8px; align-items: center; }
    .coupon-row .input { flex: 1; min-width: 0; text-transform: uppercase; }
    .coupon-error { color: var(--color-danger); margin: 6px 0 0; font-size: 13px; }
    .lines .total { border-top: 1px solid var(--color-border); padding-top: 10px; font-size: 17px; }
    .lines .total dt { color: var(--color-text-main); font-weight: 700; }
    .note { font-size: 13px; color: var(--color-text-muted); margin: 8px 0 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; min-width: 0; }
    .check-row { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; margin: 20px 0 12px; }
    .check-row a { color: var(--color-brand); }
    .form-error { color: var(--color-error); font-size: 13px; margin: 10px 0 0; }
    .pay { width: 100%; justify-content: center; margin-top: 12px; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .card { padding: 20px 16px; }
    }
  `],
})
export class CheckoutComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private browser = isPlatformBrowser(inject(PLATFORM_ID));
  private turnstile = viewChild(TurnstileComponent);

  readonly Lock = Lock;
  readonly ShieldCheck = ShieldCheck;
  readonly plans = PLANS;
  readonly periods = PERIODS;
  readonly siteKey = environment.turnstileSiteKey;

  plan = signal<PlanKey>('crece');
  period = signal<Period>('mensual');
  currency = signal<'PEN' | 'USD'>('PEN');
  quote = signal<Quote | null>(null);
  /** Cupón (HU54): lo escrito, lo aplicado y el motivo si no aplica. */
  /** Implementación (HU55): '' = autoservicio. */
  setup = signal<'' | 'puesta' | 'pro'>('');
  readonly setupOptions = [
    { id: '' as const, label: 'Lo configuro yo' },
    { id: 'puesta' as const, label: 'Puesta en marcha' },
    { id: 'pro' as const, label: 'Implementación Pro' },
  ];
  couponInput = signal('');
  appliedCoupon = signal('');
  couponError = signal('');
  loading = signal(false);
  error = signal('');
  captchaToken = signal<string | null>(null);
  /** El formulario cambia sin Zone.js: esta señal fuerza el repintado. */
  private formTick = signal(0);

  /** Compra desde la cuenta: activa el plan en la empresa actual (HU46 §4). */
  loggedIn = computed(() => this.auth.currentUser()?.role === 'TENANT_ADMIN');

  form = this.fb.nonNullable.group({
    buyer: this.fb.nonNullable.group({
      company: ['', [Validators.required, Validators.minLength(2)]],
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
    }),
    billing: this.fb.nonNullable.group(
      {
        docType: ['boleta' as 'boleta' | 'factura'],
        docNumber: ['', Validators.required],
        legalName: ['', Validators.required],
        address: [''],
      },
      { validators: docValidator },
    ),
    acceptTerms: [false, Validators.requiredTrue],
  });

  isFactura = computed(() => (this.formTick(), this.form.controls.billing.controls.docType.value === 'factura'));

  docError = computed(() => {
    this.formTick();
    const g = this.form.controls.billing;
    if (!g.controls.docNumber.value || !g.errors) return '';
    if (g.errors['ruc']) return 'El RUC no es válido: revisa los 11 dígitos.';
    if (g.errors['dni']) return 'El DNI debe tener 8 dígitos.';
    if (g.errors['address'] && g.controls.docNumber.dirty) return 'Para factura escribe la dirección fiscal.';
    return '';
  });

  canSubmit = computed(() => {
    this.formTick();
    if (this.loading() || !this.quote() || this.form.invalid) return false;
    return this.loggedIn() || !this.siteKey || !!this.captchaToken();
  });

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => this.formTick.update(n => n + 1));
    const q = this.route.snapshot.queryParamMap;
    const plan = q.get('plan') as PlanKey | null;
    const period = q.get('periodo') as Period | null;
    if (plan && PLANS.includes(plan)) this.plan.set(plan);
    if (period && PERIODS.includes(period)) this.period.set(period);
    if (q.get('moneda') === 'USD') this.currency.set('USD');
    const impl = q.get('implementacion');
    if (impl === 'puesta' || impl === 'pro') this.setup.set(impl);
    const cupon = q.get('cupon');
    if (cupon) { this.couponInput.set(cupon); this.appliedCoupon.set(cupon.trim().toUpperCase()); }
    this.loadQuote();
    if (this.loggedIn()) this.prefill();
  }

  private prefill() {
    const u = this.auth.currentUser() as { name?: string; email?: string } | null;
    this.form.controls.buyer.patchValue({ name: u?.name ?? '', email: u?.email ?? '' });
    this.http.get<{ docType: 'boleta' | 'factura'; docNumber: string; legalName: string; address?: string } | null>(
      `${environment.apiUrl}/billing/info`,
    ).subscribe({ next: i => {
      if (!i) return;
      this.form.controls.billing.patchValue({ ...i, address: i.address ?? '' });
      // La empresa ya existe: se precarga con su razón social.
      if (!this.form.controls.buyer.controls.company.value) this.form.controls.buyer.patchValue({ company: i.legalName });
    } });
  }

  setSetup(id: '' | 'puesta' | 'pro') { this.setup.set(id); this.loadQuote(); }

  setPlan(p: PlanKey) { this.plan.set(p); this.retryCoupon(); }
  setPeriod(p: Period) { this.period.set(p); this.retryCoupon(); }
  setCurrency(c: 'PEN' | 'USD') { this.currency.set(c); this.retryCoupon(); }

  /** Al cambiar plan, periodo o moneda se vuelve a probar el cupón escrito, sin repetir avisos. */
  private retryCoupon() {
    const typed = this.couponInput().trim().toUpperCase();
    if (typed && !this.appliedCoupon()) { this.appliedCoupon.set(typed); this.loadQuote(true); return; }
    this.loadQuote();
  }

  periodLabel(p: string) { return ({ mensual: 'Mensual', trimestral: 'Trimestral (−5 %)', anual: 'Anual (2 meses gratis)' } as Record<string, string>)[p] ?? p; }

  money(n: number) {
    const sym = this.currency() === 'USD' ? 'US$' : 'S/';
    return `${sym} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  applyCoupon() {
    const c = this.couponInput().trim().toUpperCase();
    if (!c) return;
    this.appliedCoupon.set(c);
    this.loadQuote();
  }

  removeCoupon() {
    this.appliedCoupon.set('');
    this.couponError.set('');
    this.loadQuote();
  }

  private quoteSeq = 0;

  private loadQuote(silent = false) {
    this.quote.set(null);
    // Solo vale la respuesta de la última cotización pedida.
    const seq = ++this.quoteSeq;
    const coupon = this.appliedCoupon();
    const params: Record<string, string> = {
      plan: this.plan(), period: this.period(), currency: this.currency(),
      ...(coupon ? { coupon } : {}), ...(this.setup() ? { setup: this.setup() } : {}),
    };
    // Desde la cuenta, la cotización incluye los add-ons ya contratados (HU53).
    const url = this.loggedIn() ? `${environment.apiUrl}/billing/checkout/quote` : `${environment.apiUrl}/public/checkout/quote`;
    this.http.get<Quote>(url, { params }).subscribe({
      next: q => { if (seq !== this.quoteSeq) return; this.quote.set(q); if (coupon) this.couponError.set(''); },
      error: err => {
        if (seq !== this.quoteSeq) return;
        const msg: string = err.error?.message || 'No se pudo calcular el precio';
        if (coupon && silent) { this.appliedCoupon.set(''); this.loadQuote(); return; }
        if (coupon) {
          // El cupón no aplica (p. ej. FUNDADOR en mensual): se muestra el motivo y se cotiza sin él.
          this.couponError.set(msg);
          this.toast.error(msg);
          this.appliedCoupon.set('');
          this.loadQuote();
          return;
        }
        this.toast.error(msg);
      },
    });
  }

  submit() {
    if (!this.canSubmit()) return;
    this.loading.set(true);
    this.error.set('');
    const v = this.form.getRawValue();
    const body = {
      plan: this.plan(),
      period: this.period(),
      currency: this.currency(),
      buyer: { ...v.buyer, phone: v.buyer.phone || undefined },
      billing: { ...v.billing, address: v.billing.docType === 'factura' ? v.billing.address : undefined },
      acceptTerms: v.acceptTerms,
      ...(this.appliedCoupon() ? { coupon: this.appliedCoupon() } : {}),
      ...(this.setup() ? { setup: this.setup() } : {}),
      ...(this.captchaToken() ? { captchaToken: this.captchaToken() } : {}),
    };
    const url = this.loggedIn() ? `${environment.apiUrl}/billing/checkout` : `${environment.apiUrl}/public/checkout`;
    this.http.post<{ redirectUrl: string }>(url, body).subscribe({
      next: res => {
        if (this.browser) window.location.href = res.redirectUrl;
      },
      error: err => {
        this.loading.set(false);
        const raw = err.error?.message;
        const msg = Array.isArray(raw) ? raw[0] : raw || 'No se pudo iniciar el pago';
        this.error.set(msg);
        this.toast.error(msg);
        this.turnstile()?.reset();
      },
    });
  }
}
