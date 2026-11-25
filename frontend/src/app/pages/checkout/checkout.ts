import { Component, OnInit, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Lock, ShieldCheck, RefreshCw, CalendarCheck, TicketPercent, FileText, LoaderCircle } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { TurnstileComponent } from '../../shared/turnstile';
import { PaymentLogosComponent } from '../../shared/payment-logos';
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

/** Checkout de planes (HU46; diseño HU76): resumen con IGV, datos, sello de pago seguro y salto a Mercado Pago. */
@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule, TurnstileComponent, PaymentLogosComponent],
  template: `
    <div class="checkout-page animate-fade-in">
      <header class="top">
        <a routerLink="/" class="brand"><img src="/logo.png?v=2" alt="Maya CRM" /></a>
        <span class="secure-badge"><lucide-icon [img]="ShieldCheck" [size]="15" /> Pago seguro</span>
      </header>

      <ol class="steps" aria-label="Pasos de la compra">
        <li class="done"><span>1</span> Tu plan</li>
        <li class="done"><span>2</span> Tus datos</li>
        <li><span>3</span> Pago en Mercado Pago</li>
      </ol>

      <div class="layout">
        <!-- Plan -->
        <section class="card config" aria-labelledby="plan-t">
          <h1 class="title" id="plan-t">Elige tu plan</h1>

          <div class="group">
            <p class="group-label" id="g-plan">Plan</p>
            <div class="plan-opts" role="radiogroup" aria-labelledby="g-plan">
              @for (p of planOptions; track p.id) {
                <button type="button" class="plan-opt" role="radio" [attr.aria-checked]="plan() === p.id" [class.active]="plan() === p.id" (click)="setPlan(p.id)">
                  <span class="plan-opt-name">{{ p.name }}
                    @if (p.featured) { <span class="tag">Más elegido</span> }
                  </span>
                  <span class="plan-opt-desc">{{ p.desc }}</span>
                  <span class="radio-dot" aria-hidden="true"></span>
                </button>
              }
            </div>
          </div>

          <div class="group">
            <p class="group-label" id="g-period">Forma de pago</p>
            <div class="seg" role="radiogroup" aria-labelledby="g-period">
              @for (p of periods; track p) {
                <button type="button" class="seg-btn" role="radio" [attr.aria-checked]="period() === p" [class.active]="period() === p" (click)="setPeriod(p)">
                  {{ periodName(p) }}
                  @if (periodSave(p); as save) { <span class="save">{{ save }}</span> }
                </button>
              }
            </div>
          </div>

          <div class="group-row">
            <div class="group">
              <p class="group-label" id="g-cur">Moneda</p>
              <div class="seg" role="radiogroup" aria-labelledby="g-cur">
                <button type="button" class="seg-btn" role="radio" [attr.aria-checked]="currency() === 'PEN'" [class.active]="currency() === 'PEN'" (click)="setCurrency('PEN')">Soles (S/)</button>
                <button type="button" class="seg-btn" role="radio" [attr.aria-checked]="currency() === 'USD'" [class.active]="currency() === 'USD'" (click)="setCurrency('USD')">Dólares (US$)</button>
              </div>
            </div>
          </div>

          <div class="group">
            <p class="group-label" id="g-setup">Implementación</p>
            <div class="setup-opts" role="radiogroup" aria-labelledby="g-setup">
              @for (o of setupOptions; track o.id) {
                <button type="button" class="setup-opt" role="radio" [attr.aria-checked]="setup() === o.id" [class.active]="setup() === o.id" (click)="setSetup(o.id)">
                  <span class="radio-dot" aria-hidden="true"></span>
                  <span><strong>{{ o.label }}</strong><small>{{ o.desc }}</small></span>
                </button>
              }
            </div>
          </div>
        </section>

        <!-- Resumen -->
        <aside class="summary-col">
          <div class="card summary">
            <h2 class="title">Resumen</h2>
            @if (quote(); as q) {
              <dl class="lines">
                <div><dt>Plan {{ q.planName }} · {{ periodName(period()) }}</dt><dd>{{ money(q.listSubtotal ?? q.subtotal - (q.addonsSubtotal ?? 0)) }}</dd></div>
                @if (q.addonsSubtotal) {
                  <div><dt>Extras contratados</dt><dd data-testid="addons">{{ money(q.addonsSubtotal) }}</dd></div>
                }
                @if (q.discount) {
                  <div class="discount"><dt>Cupón {{ q.couponCode }}{{ q.couponLabel ? ' · ' + q.couponLabel : '' }}</dt><dd data-testid="discount">−{{ money(q.discount) }}</dd></div>
                }
                @if (q.currency === 'PEN') {
                  <div><dt>IGV (18 %)</dt><dd data-testid="igv">{{ money(q.igv) }}</dd></div>
                }
                <div class="total"><dt>{{ q.setup ? 'Total del plan' : 'Total' }}</dt><dd data-testid="total" aria-live="polite">{{ money(q.total) }}</dd></div>
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
              <p class="note renew">
                <lucide-icon [img]="q.mode === 'subscription' ? RefreshCw : CalendarCheck" [size]="14" />
                @if (q.mode === 'subscription') { <span>Cobro automático cada mes con tarjeta. Cancela cuando quieras.</span> }
                @else { <span>Pago único con tarjeta, Yape o PagoEfectivo. Te avisamos antes de renovar.</span> }
              </p>
            } @else {
              <div class="skeleton" role="status" aria-label="Calculando el precio">
                <span></span><span></span><span class="wide"></span>
              </div>
            }

            <div class="coupon">
              @if (appliedCoupon()) {
                <p class="coupon-ok"><lucide-icon [img]="TicketPercent" [size]="15" /> Cupón <strong>{{ appliedCoupon() }}</strong> aplicado
                  <button type="button" class="btn btn-ghost btn-sm" (click)="removeCoupon()">Quitar</button>
                </p>
              } @else if (!couponOpen()) {
                <button type="button" class="coupon-toggle" (click)="couponOpen.set(true)"><lucide-icon [img]="TicketPercent" [size]="15" /> ¿Tienes un cupón?</button>
              } @else {
                <label class="field">
                  <span>Código del cupón</span>
                  <span class="coupon-row">
                    <input class="input" [value]="couponInput()" (input)="couponInput.set($any($event.target).value)"
                      (keydown.enter)="$event.preventDefault(); applyCoupon()" autocomplete="off" aria-describedby="coupon-error" />
                    <button type="button" class="btn btn-secondary btn-sm" (click)="applyCoupon()" [disabled]="!couponInput().trim()">Aplicar</button>
                  </span>
                </label>
              }
              @if (couponError()) { <p class="coupon-error" id="coupon-error" role="alert">{{ couponError() }}</p> }
            </div>

            <ul class="assure">
              <li><lucide-icon [img]="Lock" [size]="15" /> Tus datos de tarjeta los escribes en Mercado Pago: Maya nunca los ve.</li>
              <li><lucide-icon [img]="FileText" [size]="15" /> Boleta o factura electrónica a tu nombre.</li>
              <li><lucide-icon [img]="ShieldCheck" [size]="15" /> Sin permanencia: cancelas cuando quieras.</li>
            </ul>
          </div>
        </aside>

        <!-- Datos -->
        <form id="checkout-form" class="card form" [formGroup]="form" (ngSubmit)="submit()" aria-labelledby="data-t">
          <h2 class="title" id="data-t">Tus datos</h2>
          <div formGroupName="buyer" class="grid">
            <label class="field"><span>Empresa</span><input class="input" formControlName="company" autocomplete="organization" placeholder="Nombre de tu negocio" /></label>
            <label class="field"><span>Tu nombre</span><input class="input" formControlName="name" autocomplete="name" /></label>
            <label class="field"><span>Correo</span><input class="input" type="email" formControlName="email" autocomplete="email" placeholder="tu@empresa.com" /></label>
            <label class="field"><span>Teléfono <em>(opcional)</em></span><input class="input" type="tel" formControlName="phone" autocomplete="tel" placeholder="+51 999 999 999" /></label>
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
              <input class="input" formControlName="docNumber" inputmode="numeric" [attr.maxlength]="isFactura() ? 11 : 8" [attr.aria-invalid]="!!docError()" />
            </label>
            <label class="field"><span>{{ isFactura() ? 'Razón social' : 'Nombre completo' }}</span><input class="input" formControlName="legalName" /></label>
            @if (isFactura()) {
              <label class="field"><span>Dirección fiscal</span><input class="input" formControlName="address" /></label>
            }
          </div>
          @if (docError(); as e) { <p class="form-error" data-testid="doc-error" role="alert">{{ e }}</p> }

          <label class="check-row">
            <input type="checkbox" formControlName="acceptTerms" />
            <span>Acepto los <a routerLink="/terminos" target="_blank">términos del servicio</a> y la <a routerLink="/privacidad" target="_blank">política de privacidad</a>.</span>
          </label>

          @if (!loggedIn() && siteKey) {
            <app-turnstile [siteKey]="siteKey" (token)="captchaToken.set($event)" />
          }
          @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }

          <button type="submit" class="btn btn-primary btn-lg pay pay-main" [disabled]="!canSubmit()">
            @if (loading()) { <lucide-icon [img]="LoaderCircle" [size]="18" class="spin" /> Conectando con Mercado Pago… }
            @else { <lucide-icon [img]="Lock" [size]="17" /> Pagar {{ payAmount() }} }
          </button>
          <p class="pay-hint">Te llevamos a Mercado Pago para completar el pago de forma segura.</p>
          <app-payment-logos [cardsOnly]="quote()?.mode === 'subscription'" />
        </form>
      </div>

      <!-- Barra de pago fija en móvil -->
      <div class="mobile-bar">
        <div class="mb-total">
          <small>{{ quote()?.setup && !quote()!.setup!.separate ? 'Hoy pagas' : 'Total' }}</small>
          <strong>{{ payAmount() || '—' }}</strong>
        </div>
        <button type="submit" form="checkout-form" class="btn btn-primary pay" [disabled]="!canSubmit()">
          @if (loading()) { <lucide-icon [img]="LoaderCircle" [size]="16" class="spin" /> Conectando… }
          @else { <lucide-icon [img]="Lock" [size]="15" /> Pagar }
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .checkout-page { min-height: 100vh; background: var(--color-bg-app); padding: 20px 16px 48px; box-sizing: border-box; }
    .top { max-width: 1080px; margin: 0 auto 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .brand img { height: 34px; display: block; }
    .secure-badge { display: inline-flex; gap: 6px; align-items: center; padding: 6px 12px; border-radius: var(--radius-pill);
      background: var(--color-white); border: 1px solid var(--color-border); font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .secure-badge lucide-icon { color: var(--color-success); }

    .steps { max-width: 1080px; margin: 0 auto 22px; padding: 0; list-style: none; display: flex; gap: 8px; flex-wrap: wrap; }
    .steps li { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .steps li:not(:last-child)::after { content: ''; width: 28px; height: 1px; background: var(--color-border); margin-left: 4px; }
    .steps span { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; background: var(--color-white); border: 1px solid var(--color-border); }
    .steps li.done { color: var(--color-text-main); }
    .steps li.done span { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }

    .layout { max-width: 1080px; margin: 0 auto; display: grid; gap: 20px; align-items: start;
      grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
      grid-template-areas: "config summary" "form summary"; }
    .config { grid-area: config; }
    .form { grid-area: form; }
    .summary-col { grid-area: summary; position: sticky; top: 20px; }
    .card { padding: 24px; min-width: 0; box-sizing: border-box; }
    .title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0 0 16px; }
    .form .title:not(:first-child) { margin-top: 26px; }

    .group { margin-bottom: 18px; min-width: 0; }
    .group:last-child { margin-bottom: 0; }
    .group-row { margin-bottom: 18px; }
    .group-label { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--color-text-muted); }

    .plan-opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .plan-opt, .setup-opt { position: relative; text-align: left; cursor: pointer; font: inherit; color: var(--color-text-main);
      background: var(--color-white); border: 1.5px solid var(--color-border); border-radius: 16px;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast); }
    .plan-opt { display: flex; flex-direction: column; gap: 4px; padding: 14px 40px 14px 14px; min-height: 76px; }
    .plan-opt:hover, .setup-opt:hover { border-color: var(--color-brand); }
    .plan-opt.active, .setup-opt.active { border-color: var(--color-brand); background: var(--color-brand-light); box-shadow: 0 0 0 3px var(--color-brand-light); }
    .plan-opt-name { font-family: var(--font-heading); font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .plan-opt-desc { font-size: 12.5px; line-height: 1.35; color: var(--color-text-muted); }
    .tag { padding: 2px 8px; border-radius: var(--radius-pill); background: var(--color-brand); color: var(--color-white); font: 600 10.5px var(--font-base); }
    .radio-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--color-border); box-sizing: border-box; flex: none; background: var(--color-white); }
    .plan-opt .radio-dot { position: absolute; top: 14px; right: 14px; }
    .active .radio-dot { border: 5px solid var(--color-brand); }

    .seg { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: var(--radius-pill); background: var(--color-bg-light); border: 1px solid var(--color-border); width: fit-content; max-width: 100%; box-sizing: border-box; }
    .seg-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 0; border-radius: var(--radius-pill);
      background: transparent; color: var(--color-text-muted); font: 600 13px var(--font-base); cursor: pointer; }
    .seg-btn.active { background: var(--color-white); color: var(--color-text-main); box-shadow: var(--shadow-md); }
    .save { padding: 2px 8px; border-radius: var(--radius-pill); background: var(--color-brand-light); color: var(--color-brand); font-size: 11px; font-weight: 700; }

    .setup-opts { display: grid; gap: 8px; }
    .setup-opt { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; }
    .setup-opt strong { display: block; font-size: 14px; }
    .setup-opt small { display: block; font-size: 12.5px; color: var(--color-text-muted); margin-top: 2px; }
    .setup-opt .radio-dot { margin-top: 1px; }

    .lines { margin: 0 0 8px; display: grid; gap: 10px; }
    .lines div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .lines dt { color: var(--color-text-muted); margin: 0; }
    .lines dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .lines .discount dd { color: var(--color-success); }
    .lines .total { border-top: 1px dashed var(--color-border); padding-top: 12px; font-size: 15px; }
    .lines .total dt { color: var(--color-text-main); font-weight: 700; }
    .lines .total dd { font-family: var(--font-heading); font-size: 22px; font-weight: 700; }
    .setup-lines { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-border); }
    .note { font-size: 13px; color: var(--color-text-muted); margin: 8px 0 0; }
    .renew { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--color-bg-light); }
    .renew lucide-icon { flex: none; margin-top: 2px; }
    .skeleton { display: grid; gap: 10px; }
    .skeleton span { height: 14px; border-radius: 8px; background: var(--color-bg-light); width: 70%; animation: pulse 1.2s ease-in-out infinite; }
    .skeleton .wide { height: 22px; width: 100%; }
    @keyframes pulse { 50% { opacity: .5; } }

    .coupon { margin-top: 16px; }
    .coupon-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer;
      color: var(--color-brand); font: 600 13px var(--font-base); }
    .coupon-ok { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0; font-size: 13px; color: var(--color-text-main); }
    .coupon-ok lucide-icon { color: var(--color-success); }
    .coupon-row { display: flex; gap: 8px; align-items: center; }
    .coupon-row .input { flex: 1; min-width: 0; text-transform: uppercase; }
    .coupon-error { color: var(--color-error); margin: 6px 0 0; font-size: 13px; }

    .assure { list-style: none; margin: 18px 0 0; padding: 16px 0 0; border-top: 1px solid var(--color-border); display: grid; gap: 10px; }
    .assure li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--color-text-muted); line-height: 1.4; }
    .assure lucide-icon { color: var(--color-success); flex: none; margin-top: 1px; }

    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; min-width: 0; }
    .field em { font-style: normal; font-weight: 500; color: var(--color-text-muted); }
    .check-row { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; margin: 22px 0 14px; cursor: pointer; }
    .check-row input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--color-brand); flex: none; }
    .check-row a { color: var(--color-brand); }
    .form-error { color: var(--color-error); font-size: 13px; margin: 10px 0 0; }
    .pay { width: 100%; justify-content: center; gap: 8px; }
    .pay-main { margin-top: 14px; }
    .pay-hint { margin: 10px 0 16px; text-align: center; font-size: 12.5px; color: var(--color-text-muted); }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .mobile-bar { display: none; }
    .pay:focus-visible, .plan-opt:focus-visible, .setup-opt:focus-visible, .seg-btn:focus-visible, .coupon-toggle:focus-visible {
      outline: 2px solid var(--color-brand); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .spin, .skeleton span { animation: none; } }

    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "config" "summary" "form"; }
      .summary-col { position: static; }
    }
    @media (max-width: 640px) {
      .checkout-page { padding: 14px 12px 112px; }
      .card { padding: 20px 16px; }
      .steps { flex-wrap: nowrap; gap: 6px; }
      .steps li { font-size: 11.5px; gap: 5px; white-space: nowrap; }
      .steps li:not(:last-child)::after { width: 8px; margin-left: 0; }
      .steps span { width: 20px; height: 20px; font-size: 11px; }
      .plan-opts { grid-template-columns: minmax(0, 1fr); }
      .plan-opt { min-height: 0; }
      .seg { width: 100%; }
      .seg { flex-wrap: nowrap; }
      .seg-btn { flex: 1 1 0; flex-direction: column; justify-content: center; gap: 2px; padding: 6px 4px; min-width: 0; }
      .save { padding: 1px 6px; font-size: 10px; }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .pay-main { display: none; }
      .mobile-bar { display: flex; align-items: center; gap: 12px; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
        padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--color-white);
        border-top: 1px solid var(--color-border); box-shadow: var(--shadow-lg); }
      .mb-total { display: flex; flex-direction: column; min-width: 0; }
      .mb-total small { font-size: 11.5px; color: var(--color-text-muted); }
      .mb-total strong { font-family: var(--font-heading); font-size: 18px; white-space: nowrap; }
      .mobile-bar .pay { flex: 1; width: auto; min-height: 46px; }
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
  readonly RefreshCw = RefreshCw;
  readonly CalendarCheck = CalendarCheck;
  readonly TicketPercent = TicketPercent;
  readonly FileText = FileText;
  readonly LoaderCircle = LoaderCircle;
  readonly planOptions: { id: PlanKey; name: string; desc: string; featured?: boolean }[] = [
    { id: 'inicia', name: 'Inicia', desc: 'Ordena tus ventas y no pierdas contactos.' },
    { id: 'crece', name: 'Crece', desc: 'Equipo comercial con campañas y agentes de IA.', featured: true },
    { id: 'escala', name: 'Escala', desc: 'Más usuarios, volumen y automatización.' },
  ];
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
    { id: '' as const, label: 'Lo configuro yo', desc: 'Sin costo extra. Guías paso a paso y soporte.' },
    { id: 'puesta' as const, label: 'Puesta en marcha', desc: 'Conectamos tus canales y dejamos todo listo contigo.' },
    { id: 'pro' as const, label: 'Implementación Pro', desc: 'Lo configuramos por ti: agentes, flujos y capacitación.' },
  ];
  /** El campo del cupón se abre a pedido para no distraer del pago. */
  couponOpen = signal(false);
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
    if (cupon) { this.couponOpen.set(true); this.couponInput.set(cupon); this.appliedCoupon.set(cupon.trim().toUpperCase()); }
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

  periodName(p: string) { return ({ mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual' } as Record<string, string>)[p] ?? p; }
  periodSave(p: string) { return ({ trimestral: '−5 %', anual: '2 meses gratis' } as Record<string, string>)[p] ?? ''; }

  /** Lo que se cobra hoy en Mercado Pago (plan + implementación si van juntos). */
  payAmount = computed(() => {
    const q = this.quote();
    if (!q) return '';
    return this.money(q.setup && !q.setup.separate ? q.dueToday ?? q.total : q.total);
  });


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
