import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Megaphone, RefreshCw, Settings2, RotateCcw } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

export interface LeadAdForm {
  _id: string;
  formId: string;
  pageId: string;
  name?: string;
  questions: { key: string; label?: string }[];
  mapping: Record<string, string>;
  createLead: boolean;
  active: boolean;
  leadsCount: number;
  lastLeadAt?: string;
}

export interface LeadAdLead {
  _id: string;
  leadgenId: string;
  status: 'pending' | 'processed' | 'failed' | 'skipped';
  error?: string;
  formName?: string;
  adName?: string;
  campaignName?: string;
  receivedAt: string;
  existingContact?: boolean;
  customerId?: { _id: string; name?: string; phone?: string; email?: string };
}

export interface AdReportRow {
  _id: string;
  name?: string;
  contacts: number;
  fromLeadAds: number;
  fromWhatsapp: number;
  opportunities: number;
  won: number;
}

/** Destinos estándar de una pregunta; el resto va a un campo personalizado. */
const STANDARD = ['name', 'first_name', 'last_name', 'email', 'phone', 'ignore'];
const DEFAULTS: Record<string, string> = {
  full_name: 'name', first_name: 'first_name', last_name: 'last_name',
  email: 'email', work_email: 'email', phone_number: 'phone', phone: 'phone',
};

/** Configuración → Meta Lead Ads (HU60): formularios, mapeo, leads y reporte. */
@Component({
  selector: 'app-lead-ads-settings',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule, FormPageComponent],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Megaphone" [size]="22" class="brand" /></div>
        <div class="grow">
          <h2 class="section-title">Meta Lead Ads</h2>
          <p class="section-desc">Los formularios de tus anuncios de Facebook e Instagram entran solos como contactos y oportunidades. Usa la Página conectada en Messenger.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="sync()">
          <lucide-icon [img]="RefreshCw" [size]="15" /> Traer formularios
        </button>
      </div>

      @if (forms().length === 0) {
        <p class="empty">Aún no hay formularios. Pulsa "Traer formularios" o espera al primer lead: se agrega solo.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Formulario</th><th>Leads</th><th>Último</th><th>Oportunidad</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (f of forms(); track f._id) {
                <tr>
                  <td><strong>{{ f.name || f.formId }}</strong></td>
                  <td>{{ f.leadsCount }}</td>
                  <td>{{ f.lastLeadAt ? (f.lastLeadAt | date: 'dd/MM HH:mm') : '—' }}</td>
                  <td>
                    <label class="check"><input type="checkbox" [checked]="f.createLead" [disabled]="busy()" (change)="patch(f, { createLead: $any($event.target).checked })" /> Crear</label>
                  </td>
                  <td>
                    <button type="button" class="badge" [class.badge-success]="f.active" [class.badge-neutral]="!f.active" [disabled]="busy()" (click)="patch(f, { active: !f.active })">
                      {{ f.active ? 'Activo' : 'En pausa' }}
                    </button>
                  </td>
                  <td class="row-actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openMapping(f)"><lucide-icon [img]="Settings2" [size]="15" /> Campos</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (leads().length) {
        <h3 class="sub-title">Últimos leads recibidos</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cuándo</th><th>Contacto</th><th>Anuncio</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (l of leads(); track l._id) {
                <tr>
                  <td>{{ l.receivedAt | date: 'dd/MM HH:mm' }}</td>
                  <td>{{ l.customerId?.name || l.customerId?.phone || l.customerId?.email || '—' }}@if (l.existingContact) { <span class="muted"> · ya existía</span> }</td>
                  <td>{{ l.adName || '—' }}@if (l.campaignName) { <div class="muted">{{ l.campaignName }}</div> }</td>
                  <td>
                    <span class="badge" [class]="'badge ' + statusClass[l.status]">{{ statusLabel[l.status] }}</span>
                    @if (l.error) { <div class="muted">{{ l.error }}</div> }
                  </td>
                  <td class="row-actions">
                    @if (l.status === 'failed') {
                      <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="retry(l)"><lucide-icon [img]="RotateCcw" [size]="15" /> Reintentar</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (report().length) {
        <h3 class="sub-title">Resultados por anuncio</h3>
        <p class="muted">Contactos que llegaron por Lead Ads y por click-to-WhatsApp del mismo anuncio.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Anuncio</th><th>Lead Ads</th><th>WhatsApp</th><th>Oportunidades</th><th>Ganadas</th></tr></thead>
            <tbody>
              @for (r of report(); track r._id) {
                <tr>
                  <td>{{ r.name || r._id }}</td>
                  <td>{{ r.fromLeadAds }}</td>
                  <td>{{ r.fromWhatsapp }}</td>
                  <td>{{ r.opportunities }}</td>
                  <td>{{ r.won }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (mapping(); as m) {
      <app-form-page [title]="m.form.name || m.form.formId" subtitle="A qué campo de Maya va cada pregunta del formulario."
        backLabel="Configuración" [urlKey]="'lead-ads-' + m.form._id" [dirty]="isDirty()" (closed)="mapping.set(null)">
        <ng-container formActions>
          <button type="button" class="btn btn-ghost" (click)="mapping.set(null)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveMapping()">Guardar</button>
        </ng-container>
        <div class="card form">
          @if (!m.form.questions.length) {
            <p class="muted">Meta no devolvió las preguntas de este formulario. Pulsa "Traer formularios" con el permiso de Lead Ads concedido.</p>
          }
          @for (q of m.form.questions; track q.key) {
            <div class="map-row">
              <div class="q"><strong>{{ q.label || q.key }}</strong><span class="muted">{{ q.key }}</span></div>
              <select class="select" [(ngModel)]="m.targets[q.key]" [attr.aria-label]="'Destino de ' + (q.label || q.key)">
                <option value="name">Nombre completo</option>
                <option value="first_name">Nombre</option>
                <option value="last_name">Apellido</option>
                <option value="email">Email</option>
                <option value="phone">Teléfono</option>
                <option value="custom">Campo personalizado</option>
                <option value="ignore">No guardar</option>
              </select>
              @if (m.targets[q.key] === 'custom') {
                <input class="input" [(ngModel)]="m.custom[q.key]" placeholder="clave_del_campo" [attr.aria-label]="'Clave para ' + (q.label || q.key)" />
              }
            </div>
          }
        </div>
      </app-form-page>
    }
  `,
  styles: [`
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .grow { flex: 1; min-width: 200px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: var(--color-brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand { color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc, .muted { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .empty { color: var(--color-text-muted); font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    .row-actions { white-space: nowrap; text-align: right; }
    .badge { border: none; cursor: pointer; }
    .check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .sub-title { font-family: var(--font-heading); font-size: 15px; margin: 24px 0 8px; }
    .form { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .map-row { display: grid; grid-template-columns: minmax(180px, 1fr) 220px minmax(160px, 1fr); gap: 12px; align-items: center; }
    .q { display: flex; flex-direction: column; }
    @media (max-width: 768px) { .section-card { padding: 20px; } .map-row { grid-template-columns: 1fr; } }
  `],
})
export class LeadAdsSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/lead-ads`;

  readonly Megaphone = Megaphone; readonly RefreshCw = RefreshCw; readonly Settings2 = Settings2; readonly RotateCcw = RotateCcw;
  readonly statusLabel: Record<LeadAdLead['status'], string> = { pending: 'En cola', processed: 'Importado', failed: 'Fallido', skipped: 'Omitido' };
  readonly statusClass: Record<LeadAdLead['status'], string> = { pending: 'badge-info', processed: 'badge-success', failed: 'badge-danger', skipped: 'badge-neutral' };

  forms = signal<LeadAdForm[]>([]);
  leads = signal<LeadAdLead[]>([]);
  report = signal<AdReportRow[]>([]);
  busy = signal(false);
  mapping = signal<{ form: LeadAdForm; targets: Record<string, string>; custom: Record<string, string> } | null>(null);
  private snapshot = '';

  ngOnInit() { this.load(); }

  load() {
    this.http.get<LeadAdForm[]>(`${this.api}/forms`).subscribe({ next: (f) => this.forms.set(f), error: () => undefined });
    this.http.get<LeadAdLead[]>(`${this.api}/leads?limit=20`).subscribe({ next: (l) => this.leads.set(l), error: () => undefined });
    this.http.get<AdReportRow[]>(`${this.api}/report`).subscribe({ next: (r) => this.report.set(r), error: () => undefined });
  }

  sync() {
    this.busy.set(true);
    this.http.post<{ synced: number; errors: string[]; forms: LeadAdForm[] }>(`${this.api}/forms/sync`, {}).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.forms.set(r.forms);
        if (r.errors.length) this.toast.error(`No se pudo leer: ${r.errors.join(' · ')}`);
        else this.toast.success(r.synced ? `${r.synced} formularios al día` : 'Tu Página no tiene formularios de anuncios');
      },
      error: (e: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudieron traer los formularios'); },
    });
  }

  patch(f: LeadAdForm, body: Partial<Pick<LeadAdForm, 'active' | 'createLead' | 'mapping'>>, ok = 'Formulario actualizado') {
    this.busy.set(true);
    this.http.put<LeadAdForm>(`${this.api}/forms/${f._id}`, body).subscribe({
      next: (u) => {
        this.busy.set(false);
        this.forms.update((list) => list.map((x) => (x._id === u._id ? u : x)));
        this.mapping.set(null);
        this.toast.success(ok);
      },
      error: (e: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudo guardar'); },
    });
  }

  openMapping(f: LeadAdForm) {
    const targets: Record<string, string> = {};
    const custom: Record<string, string> = {};
    for (const q of f.questions) {
      const t = f.mapping[q.key] ?? DEFAULTS[q.key] ?? `custom:${this.keyOf(q.key)}`;
      if (STANDARD.includes(t)) targets[q.key] = t;
      else { targets[q.key] = 'custom'; custom[q.key] = t.replace(/^custom:/, ''); }
    }
    const m = { form: f, targets, custom };
    this.snapshot = snapshotOf({ targets, custom });
    this.mapping.set(m);
  }

  isDirty = () => { const m = this.mapping(); return !!m && snapshotOf({ targets: m.targets, custom: m.custom }) !== this.snapshot; };

  saveMapping() {
    const m = this.mapping();
    if (!m) return;
    const out: Record<string, string> = {};
    for (const q of m.form.questions) {
      const t = m.targets[q.key];
      if (t === 'custom') {
        const k = this.keyOf(m.custom[q.key] || q.key);
        out[q.key] = `custom:${k}`;
      } else out[q.key] = t;
    }
    this.patch(m.form, { mapping: out }, 'Campos guardados');
  }

  retry(l: LeadAdLead) {
    this.busy.set(true);
    this.http.post<LeadAdLead>(`${this.api}/leads/${l._id}/retry`, {}).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r?.status === 'processed') this.toast.success('Lead importado');
        else this.toast.error(r?.error || 'Sigue fallando');
        this.load();
      },
      error: (e: { error?: { message?: string } }) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudo reintentar'); },
    });
  }

  /** Misma limpieza que el backend: minúsculas, sin tildes ni símbolos. */
  keyOf(s: string) {
    const k = s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    return k || 'respuesta';
  }
}
