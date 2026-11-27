import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule, Search, TrendingUp, Users, AlertTriangle, ClipboardCheck } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';
import { SubscriptionDetailComponent } from './subscription-detail';
import { CouponsAdminComponent } from './coupons-admin';
import { BillingQueuesComponent } from './billing-queues';
import { PERIOD_LABEL, PLAN_OPTIONS, SUB_STATUS, money, planName } from './billing-admin.shared';

export interface BillingSummary {
  mrr: { PEN: number; USD: number };
  byPlan: { plan: string; planName: string; count: number; mrr: { PEN: number; USD: number } }[];
  active: number;
  newThisMonth: number;
  canceledThisMonth: number;
  cancelScheduled: number;
  churnPct: number;
  pastDue: number;
  revenueThisMonth: { PEN: number; USD: number };
}

export interface SubscriptionRow {
  _id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  period?: string;
  currency?: string;
  amount?: number;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
}

type Tab = 'summary' | 'subscriptions' | 'coupons' | 'receipts' | 'emails';

/** Superadmin: suscripciones, ingresos, cupones y comprobantes (HU57). */
@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, LucideAngularModule, SubscriptionDetailComponent, CouponsAdminComponent, BillingQueuesComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Suscripciones e ingresos</h1>
          <p class="subtitle">Cuánto factura Maya, quién paga y qué hay que resolver.</p>
        </div>
        <a class="btn btn-secondary btn-sm" routerLink="/admin/onboarding">
          <lucide-icon [img]="ClipboardCheck" [size]="16" /> Implementaciones
        </a>
      </div>

      <div class="tabs-row" role="tablist" aria-label="Secciones">
        @for (t of tabs; track t.id) {
          <button type="button" class="tab-btn" role="tab" [attr.aria-selected]="tab() === t.id" [class.active]="tab() === t.id" (click)="setTab(t.id)">{{ t.label }}</button>
        }
      </div>

      @switch (tab()) {
        @case ('summary') {
          @if (summary(); as s) {
            <div class="kpis">
              <div class="card kpi" data-testid="mrr">
                <span class="kpi-label"><lucide-icon [img]="TrendingUp" [size]="15" /> MRR</span>
                <strong>{{ money(s.mrr.PEN) }}</strong>
                @if (s.mrr.USD) { <span class="kpi-sub">+ {{ money(s.mrr.USD, 'USD') }}</span> }
                <span class="kpi-sub">Mensual equivalente, sin IGV</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label"><lucide-icon [img]="Users" [size]="15" /> Clientes que pagan</span>
                <strong>{{ s.active }}</strong>
                <span class="kpi-sub">{{ s.newThisMonth }} nuevos este mes</span>
              </div>
              <div class="card kpi">
                <span class="kpi-label">Bajas del mes</span>
                <strong>{{ s.canceledThisMonth }}</strong>
                <span class="kpi-sub">Churn {{ s.churnPct }} % · {{ s.cancelScheduled }} se cancelan al vencer</span>
              </div>
              <button type="button" class="card kpi kpi-link" (click)="filterPastDue()">
                <span class="kpi-label"><lucide-icon [img]="AlertTriangle" [size]="15" /> Pago pendiente</span>
                <strong>{{ s.pastDue }}</strong>
                <span class="kpi-sub">Ver cuentas</span>
              </button>
              <div class="card kpi">
                <span class="kpi-label">Cobrado este mes</span>
                <strong>{{ money(s.revenueThisMonth.PEN) }}</strong>
                @if (s.revenueThisMonth.USD) { <span class="kpi-sub">+ {{ money(s.revenueThisMonth.USD, 'USD') }}</span> }
                <span class="kpi-sub">Con IGV</span>
              </div>
            </div>
            <h2 class="section-title">Ingresos por plan</h2>
            <div class="table-card table-cards card">
              <table>
                <thead><tr><th>Plan</th><th>Cuentas</th><th>MRR soles</th><th>MRR dólares</th></tr></thead>
                <tbody>
                  @for (p of s.byPlan; track p.plan) {
                    <tr>
                      <td data-label="">{{ p.planName }}</td>
                      <td data-label="Cuentas">{{ p.count }}</td>
                      <td data-label="MRR soles">{{ money(p.mrr.PEN) }}</td>
                      <td data-label="MRR dólares">{{ money(p.mrr.USD, 'USD') }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="muted">Aún no hay suscripciones activas.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="muted">Cargando…</p>
          }
        }

        @case ('subscriptions') {
          <div class="filters">
            <div class="search">
              <lucide-icon [img]="Search" [size]="16" />
              <input class="input" type="search" placeholder="Empresa, email o RUC" aria-label="Buscar empresa"
                [ngModel]="q()" (ngModelChange)="q.set($event)" (keyup.enter)="loadList(1)" />
            </div>
            <select class="select" aria-label="Estado" [ngModel]="status()" (ngModelChange)="status.set($event); loadList(1)">
              <option value="">Todos los estados</option>
              @for (s of statusOptions; track s.id) { <option [value]="s.id">{{ s.label }}</option> }
            </select>
            <select class="select" aria-label="Plan" [ngModel]="plan()" (ngModelChange)="plan.set($event); loadList(1)">
              <option value="">Todos los planes</option>
              @for (p of plans; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
            <select class="select" aria-label="Periodo" [ngModel]="period()" (ngModelChange)="period.set($event); loadList(1)">
              <option value="">Todos los periodos</option>
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          @if (loadingList()) {
            <p class="muted">Cargando…</p>
          } @else if (!rows().length) {
            <div class="card empty"><p>Ninguna cuenta coincide con los filtros.</p></div>
          } @else {
            <div class="table-card table-cards card">
              <table>
                <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Periodo</th><th>Precio pactado</th><th>Vence</th></tr></thead>
                <tbody>
                  @for (r of rows(); track r._id) {
                    <tr>
                      <td data-label="">
                        <button type="button" class="link" [attr.data-open]="r._id" (click)="open(r._id)">{{ r.name }}</button>
                        <div class="muted small">{{ r.email }}</div>
                      </td>
                      <td data-label="Plan">{{ planName(r.plan) }}</td>
                      <td data-label="Estado">
                        <span class="badge" [class]="statusOf(r.status).badge">{{ statusOf(r.status).label }}</span>
                        @if (r.cancelAtPeriodEnd) { <span class="badge badge-neutral">Se cancela</span> }
                      </td>
                      <td data-label="Periodo">{{ r.period ? periodLabel[r.period] : '—' }}</td>
                      <td data-label="Precio pactado">{{ r.amount != null ? money(r.amount, r.currency) : '—' }}</td>
                      <td data-label="Vence">{{ (r.status === 'trialing' ? r.trialEndsAt : r.currentPeriodEnd) | date: 'd MMM y' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (total() > pageSize) {
              <div class="pager">
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() === 1" (click)="loadList(page() - 1)">Anterior</button>
                <span class="muted small">Página {{ page() }} de {{ pages() }}</span>
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() >= pages()" (click)="loadList(page() + 1)">Siguiente</button>
              </div>
            }
          }
        }

        @case ('coupons') { <app-coupons-admin /> }
        @case ('receipts') { <app-billing-queues mode="receipts" /> }
        @case ('emails') { <app-billing-queues mode="emails" /> }
      }
    </div>

    @if (detailId(); as id) {
      <app-subscription-detail [tenantId]="id" (closed)="closeDetail()" (changed)="refresh()" />
    }
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .page-header h1 { margin: 0 0 4px; font-size: 26px; font-family: var(--font-heading); }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .tabs-row { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .tab-btn { padding: 8px 18px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border);
      background: var(--color-white); font-size: 14px; font-weight: 600; color: var(--color-text-muted); cursor: pointer; }
    .tab-btn.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .kpi { padding: 24px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: inherit; }
    .kpi strong { font-family: var(--font-heading); font-size: 26px; }
    .kpi-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .kpi-sub { font-size: 12px; color: var(--color-text-muted); }
    .kpi-link { cursor: pointer; border: 1px solid var(--color-border); }
    .kpi-link:hover { border-color: var(--color-brand); }
    .section-title { font-size: 17px; font-family: var(--font-heading); margin: 0 0 12px; }
    .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    .filters .select { width: auto; min-width: 170px; }
    .search { position: relative; display: flex; align-items: center; flex: 1; min-width: 220px; max-width: 420px; }
    .search lucide-icon { position: absolute; left: 14px; color: var(--color-text-muted); pointer-events: none; }
    .search .input { padding-left: 38px; }
    .link { background: none; border: none; padding: 0; font: inherit; font-weight: 600; color: var(--color-text); cursor: pointer; text-align: left; }
    .link:hover { color: var(--color-brand); text-decoration: underline; }
    .muted { color: var(--color-text-muted); }
    .small { font-size: 12px; }
    .empty { padding: 40px; text-align: center; color: var(--color-text-muted); }
    .pager { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 16px; }
    @media (max-width: 640px) { .page { padding: 20px 16px; } .filters .select { flex: 1; } }
  `],
})
export class AdminBillingComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = `${environment.apiUrl}/billing/admin/subscriptions`;
  readonly Search = Search;
  readonly TrendingUp = TrendingUp;
  readonly Users = Users;
  readonly AlertTriangle = AlertTriangle;
  readonly ClipboardCheck = ClipboardCheck;
  readonly money = money;
  readonly planName = planName;
  readonly periodLabel = PERIOD_LABEL;
  readonly plans = PLAN_OPTIONS;
  readonly statusOptions = Object.entries(SUB_STATUS).filter(([k]) => k !== 'legacy' && k !== 'trialing').map(([id, v]) => ({ id, label: v.label }));
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Resumen' },
    { id: 'subscriptions', label: 'Suscripciones' },
    { id: 'coupons', label: 'Cupones' },
    { id: 'receipts', label: 'Comprobantes' },
    { id: 'emails', label: 'Correos' },
  ];
  readonly pageSize = 50;

  tab = signal<Tab>('summary');
  summary = signal<BillingSummary | null>(null);
  rows = signal<SubscriptionRow[]>([]);
  total = signal(0);
  page = signal(1);
  loadingList = signal(false);
  q = signal('');
  status = signal('');
  plan = signal('');
  period = signal('');
  detailId = signal<string | null>(null);

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (t && this.tabs.some(x => x.id === t)) this.tab.set(t);
    this.loadTab();
  }

  pages() { return Math.max(1, Math.ceil(this.total() / this.pageSize)); }

  statusOf(s: string) { return SUB_STATUS[s] ?? { label: s, badge: 'badge-neutral' }; }

  setTab(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t }, queryParamsHandling: 'merge', replaceUrl: true });
    this.loadTab();
  }

  private loadTab() {
    if (this.tab() === 'summary') this.loadSummary();
    if (this.tab() === 'subscriptions') this.loadList(1);
  }

  loadSummary() {
    this.http.get<BillingSummary>(`${this.api}/summary`).subscribe({
      next: s => this.summary.set(s),
      error: err => this.toast.error(err.error?.message || 'No se pudo cargar el resumen'),
    });
  }

  loadList(page = this.page()) {
    this.loadingList.set(true);
    const params: Record<string, string> = { page: String(page) };
    for (const [k, v] of [['q', this.q()], ['status', this.status()], ['plan', this.plan()], ['period', this.period()]] as const)
      if (v) params[k] = v;
    this.http.get<{ rows: SubscriptionRow[]; total: number; page: number }>(this.api, { params }).subscribe({
      next: r => { this.rows.set(r.rows); this.total.set(r.total); this.page.set(r.page); this.loadingList.set(false); },
      error: err => { this.loadingList.set(false); this.toast.error(err.error?.message || 'No se pudieron cargar las suscripciones'); },
    });
  }

  filterPastDue() {
    this.status.set('past_due');
    this.setTab('subscriptions');
  }

  open(id: string) { this.detailId.set(id); }
  closeDetail() { this.detailId.set(null); }

  refresh() {
    if (this.tab() === 'subscriptions') this.loadList();
    else this.loadSummary();
  }
}
