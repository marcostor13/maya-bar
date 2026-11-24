import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, TicketPercent } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { FormPageComponent } from '../../shared/form-page';
import { environment } from '../../../environments/environment';
import { PERIOD_LABEL, planName } from './billing-admin.shared';

export interface Coupon {
  _id: string;
  code: string;
  label?: string;
  type: 'percent' | 'fixed';
  value: number;
  currency?: 'PEN' | 'USD';
  plans: string[];
  periods: string[];
  duration: 'once' | 'months' | 'forever';
  durationMonths?: number;
  maxUses?: number;
  used: number;
  validUntil?: string;
  active: boolean;
}

interface CouponForm {
  _id?: string;
  code: string;
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  currency: 'PEN' | 'USD';
  plans: string[];
  periods: string[];
  duration: 'once' | 'months' | 'forever';
  durationMonths: number;
  maxUses: number | null;
  validUntil: string;
}

const EMPTY: CouponForm = {
  code: '', label: '', type: 'percent', value: 10, currency: 'PEN', plans: [], periods: [],
  duration: 'once', durationMonths: 3, maxUses: null, validUntil: '',
};

/** Cupones (HU54) desde el panel del superadmin (HU57). */
@Component({
  selector: 'app-coupons-admin',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule, FormPageComponent],
  template: `
    <div class="bar">
      <p class="muted">Descuentos para el checkout. El código no se cambia una vez creado.</p>
      <button type="button" class="btn btn-primary btn-sm" (click)="openNew()"><lucide-icon [img]="Plus" [size]="15" /> Nuevo cupón</button>
    </div>
    @if (loading()) {
      <p class="muted">Cargando…</p>
    } @else if (!coupons().length) {
      <div class="card empty"><lucide-icon [img]="TicketPercent" [size]="30" /><p>Aún no hay cupones.</p></div>
    } @else {
      <div class="table-card table-cards card">
        <table>
          <thead><tr><th>Código</th><th>Descuento</th><th>Duración</th><th>Aplica a</th><th>Usos</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (c of coupons(); track c._id) {
              <tr [attr.data-coupon]="c.code">
                <td data-label=""><strong>{{ c.code }}</strong>@if (c.label) { <div class="muted small">{{ c.label }}</div> }</td>
                <td data-label="Descuento">{{ c.type === 'percent' ? '−' + c.value + ' %' : '−' + (c.currency === 'USD' ? 'US$' : 'S/') + ' ' + c.value }}</td>
                <td data-label="Duración">{{ durationLabel(c) }}</td>
                <td data-label="Aplica a">{{ scope(c) }}</td>
                <td data-label="Usos">{{ c.used }}{{ c.maxUses ? ' / ' + c.maxUses : '' }}</td>
                <td data-label="Estado">
                  <span class="badge" [class]="c.active ? 'badge-success' : 'badge-neutral'">{{ c.active ? 'Activo' : 'Pausado' }}</span>
                  @if (c.validUntil) { <div class="muted small">hasta {{ c.validUntil | date: 'd MMM y' }}</div> }
                </td>
                <td data-label="" class="actions">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(c)">Editar</button>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="toggle(c)">{{ c.active ? 'Pausar' : 'Activar' }}</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (form(); as f) {
      <app-form-page [title]="f._id ? 'Editar cupón ' + f.code : 'Nuevo cupón'" subtitle="Lo que vale, para qué planes y cuánto dura."
        backLabel="Cupones" [urlKey]="f._id || 'nuevo-cupon'" [dirty]="isDirty()" (closed)="form.set(null)">
        <ng-container formActions>
          <button type="button" class="btn btn-ghost" (click)="form.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">Guardar</button>
        </ng-container>
        <div class="card block grid">
          <div><label for="c-code">Código</label>
            <input id="c-code" class="input" name="code" [(ngModel)]="f.code" [disabled]="!!f._id" maxlength="30" placeholder="LANZAMIENTO" /></div>
          <div><label for="c-label">Nombre interno</label>
            <input id="c-label" class="input" name="label" [(ngModel)]="f.label" maxlength="120" /></div>
          <div><label for="c-type">Tipo</label>
            <select id="c-type" class="select" name="type" [(ngModel)]="f.type">
              <option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option>
            </select></div>
          <div><label for="c-value">{{ f.type === 'percent' ? 'Porcentaje' : 'Monto sin IGV' }}</label>
            <input id="c-value" class="input" type="number" min="0.01" step="0.01" name="value" [(ngModel)]="f.value" /></div>
          @if (f.type === 'fixed') {
            <div><label for="c-cur">Moneda</label>
              <select id="c-cur" class="select" name="currency" [(ngModel)]="f.currency"><option value="PEN">Soles</option><option value="USD">Dólares</option></select></div>
          }
          <div><label for="c-dur">Duración</label>
            <select id="c-dur" class="select" name="duration" [(ngModel)]="f.duration">
              <option value="once">Primer periodo</option><option value="months">Varios meses</option><option value="forever">De por vida</option>
            </select></div>
          @if (f.duration === 'months') {
            <div><label for="c-months">Meses</label>
              <input id="c-months" class="input" type="number" min="1" name="months" [(ngModel)]="f.durationMonths" /></div>
          }
          <div><label for="c-max">Usos máximos (vacío = sin tope)</label>
            <input id="c-max" class="input" type="number" min="1" name="max" [(ngModel)]="f.maxUses" /></div>
          <div><label for="c-until">Válido hasta</label>
            <input id="c-until" class="input" type="date" name="until" [(ngModel)]="f.validUntil" /></div>
        </div>
        <div class="card block">
          <fieldset><legend>Planes (ninguno = todos)</legend>
            @for (p of planIds; track p) {
              <label class="check"><input type="checkbox" [checked]="f.plans.includes(p)" (change)="toggleIn(f.plans, p)" /> {{ planName(p) }}</label>
            }
          </fieldset>
          <fieldset><legend>Periodos (ninguno = todos)</legend>
            @for (p of periodIds; track p) {
              <label class="check"><input type="checkbox" [checked]="f.periods.includes(p)" (change)="toggleIn(f.periods, p)" /> {{ periodLabel[p] }}</label>
            }
          </fieldset>
        </div>
      </app-form-page>
    }
  `,
  styles: [`
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 12px; }
    .empty { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--color-text-muted); }
    .actions { white-space: nowrap; text-align: right; }
    .block { padding: 24px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; }
    fieldset { border: none; padding: 0; margin: 0 0 16px; display: flex; gap: 16px; flex-wrap: wrap; }
    legend { font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 8px; width: 100%; }
    .check { display: inline-flex; align-items: center; gap: 8px; color: var(--color-text); font-weight: 500; margin: 0; }
  `],
})
export class CouponsAdminComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/billing/admin/coupons`;
  readonly Plus = Plus;
  readonly TicketPercent = TicketPercent;
  readonly planName = planName;
  readonly periodLabel = PERIOD_LABEL;
  readonly planIds = ['inicia', 'crece', 'escala'];
  readonly periodIds = ['monthly', 'quarterly', 'annual'];

  coupons = signal<Coupon[]>([]);
  loading = signal(true);
  saving = signal(false);
  form = signal<CouponForm | null>(null);
  private initial = '';

  ngOnInit() { this.load(); }

  load() {
    this.http.get<Coupon[]>(this.api).subscribe({
      next: r => { this.coupons.set(r); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudieron cargar los cupones'); },
    });
  }

  durationLabel(c: Coupon) {
    return c.duration === 'forever' ? 'De por vida' : c.duration === 'months' ? `${c.durationMonths ?? 1} meses` : 'Primer periodo';
  }
  scope(c: Coupon) {
    const plans = c.plans?.length ? c.plans.map(p => planName(p)).join(', ') : 'Todos los planes';
    const periods = c.periods?.length ? ' · ' + c.periods.map(p => PERIOD_LABEL[p]).join(', ') : '';
    return plans + periods;
  }

  toggleIn(list: string[], v: string) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1); else list.push(v);
  }

  private openForm(f: CouponForm) { this.initial = JSON.stringify(f); this.form.set(f); }
  isDirty() { return JSON.stringify(this.form()) !== this.initial; }

  openNew() { this.openForm({ ...EMPTY, plans: [], periods: [] }); }

  openEdit(c: Coupon) {
    this.openForm({
      _id: c._id, code: c.code, label: c.label ?? '', type: c.type, value: c.value, currency: c.currency ?? 'PEN',
      plans: [...(c.plans ?? [])], periods: [...(c.periods ?? [])], duration: c.duration,
      durationMonths: c.durationMonths ?? 3, maxUses: c.maxUses ?? null, validUntil: c.validUntil ? c.validUntil.slice(0, 10) : '',
    });
  }

  save() {
    const f = this.form();
    if (!f) return;
    if (!f._id && !/^[A-Za-z0-9_-]{3,30}$/.test(f.code)) { this.toast.error('El código usa de 3 a 30 letras, números, - o _'); return; }
    if (!(Number(f.value) > 0)) { this.toast.error('Indica el descuento'); return; }
    const body: Record<string, unknown> = {
      type: f.type, value: Number(f.value), duration: f.duration, plans: f.plans, periods: f.periods,
      ...(f.label ? { label: f.label } : {}),
      ...(f.type === 'fixed' ? { currency: f.currency } : {}),
      ...(f.duration === 'months' ? { durationMonths: Number(f.durationMonths) } : {}),
      ...(f.maxUses ? { maxUses: Number(f.maxUses) } : {}),
      ...(f.validUntil ? { validUntil: new Date(`${f.validUntil}T23:59:59`).toISOString() } : {}),
    };
    this.saving.set(true);
    const req = f._id
      ? this.http.patch<Coupon>(`${this.api}/${f._id}`, body)
      : this.http.post<Coupon>(this.api, { ...body, code: f.code.toUpperCase() });
    req.subscribe({
      next: () => { this.saving.set(false); this.toast.success(f._id ? 'Cupón actualizado' : 'Cupón creado'); this.form.set(null); this.load(); },
      error: err => { this.saving.set(false); this.toast.error(this.msg(err) || 'No se pudo guardar el cupón'); },
    });
  }

  toggle(c: Coupon) {
    this.http.patch<Coupon>(`${this.api}/${c._id}`, { active: !c.active }).subscribe({
      next: () => { this.toast.success(c.active ? 'Cupón pausado' : 'Cupón activado'); this.load(); },
      error: err => this.toast.error(this.msg(err) || 'No se pudo cambiar el cupón'),
    });
  }

  private msg(err: { error?: { message?: string | string[] } }) {
    const m = err.error?.message;
    return Array.isArray(m) ? m.join('. ') : m;
  }
}
