import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  Download,
  MessageCircle,
  Phone,
  Search,
  Ticket,
  Users,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { downloadCsv } from '../../../shared/csv';
import { EventDetailStore } from '../event-detail.store';
import { SORT_OPTIONS, telLink, waLink } from './registrations-logic';

@Component({
  selector: 'app-event-registrations-tab',
  standalone: true,
  imports: [LucideAngularModule, DatePipe],
  template: `
    <div class="p-6 animate-fade-in">

      <!-- Filter bar -->
      <div class="regs-toolbar">
        <div class="regs-search-wrap">
          <lucide-icon [img]="Search" [size]="16"></lucide-icon>
          <input type="search" class="input regs-search-input" placeholder="Buscar por nombre, email o ticket..."
            aria-label="Buscar asistentes" enterkeyhint="search"
            [value]="regSearch()" (input)="onRegSearchChange($any($event.target).value)" />
        </div>
        <select class="input regs-filter-select"
          [value]="regStatusFilter()"
          (change)="regStatusFilter.set($any($event.target).value); onRegFilterChange()">
          <option value="all">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="cancelled">Cancelados</option>
        </select>
        @if (isMobile()) {
          <select class="select regs-filter-select" aria-label="Ordenar por"
            [value]="sortKey()" (change)="onSortKey($any($event.target).value)">
            @for (o of SORT_OPTIONS; track o.key) {
              <option [value]="o.key" [selected]="o.key === sortKey()">Ordenar: {{ o.label }}</option>
            }
          </select>
        }
        <button class="btn btn-secondary btn-sm" (click)="downloadExcel()" [disabled]="registrations().length === 0">
          <lucide-icon [img]="Download" [size]="15"></lucide-icon>
          Excel
        </button>
      </div>

      <div class="regs-meta">
        <span class="badge badge-neutral">{{ registrations().length }} registros</span>
        @if (regsLoading()) { <span class="text-muted-xs">Cargando...</span> }
      </div>

      @if (!regsLoading() && registrations().length === 0) {
        <div class="regs-empty">
          <lucide-icon [img]="Ticket" [size]="48" [strokeWidth]="1.5"></lucide-icon>
          <p>Sin registros para este filtro.</p>
        </div>
      } @else if (isMobile()) {
        <!-- Móvil: tarjeta compacta que se despliega al tocar (HU31) -->
        <ul class="reg-list">
          @for (r of registrations(); track r._id) {
            <li class="reg-item" [class.open]="expandedRegIds().has(r._id)">
              <button type="button" class="reg-head" (click)="toggleExpandReg(r._id)"
                [attr.aria-expanded]="expandedRegIds().has(r._id)">
                <span class="reg-line1">
                  <strong class="reg-name">{{ r.name }}</strong>
                  <lucide-icon class="reg-chevron" [img]="ChevronDown" [size]="18"></lucide-icon>
                </span>
                <span class="reg-chips">
                  <span class="chip"><lucide-icon [img]="Users" [size]="12"></lucide-icon> {{ r.partySize }}</span>
                  <span class="badge" [class.badge-success]="r.status === 'confirmed'" [class.badge-danger]="r.status === 'cancelled'">
                    {{ r.status === 'confirmed' ? 'Confirmado' : 'Cancelado' }}
                  </span>
                  @if (r.checkedIn) {
                    <span class="checkin-pill yes"><lucide-icon [img]="Check" [size]="12" [strokeWidth]="3"></lucide-icon> Ingresó</span>
                  }
                </span>
                <span class="reg-line2">{{ r.impulsadorName || 'Directo' }} · {{ r.createdAt | date:'dd/MM/yy' }}</span>
              </button>
              @if (expandedRegIds().has(r._id)) {
                <div class="reg-detail">
                  <dl>
                    <dt>Email</dt><dd>{{ r.email }}</dd>
                    <dt>Teléfono</dt><dd>{{ r.phone || '—' }}</dd>
                    <dt>Ticket</dt><dd><code class="ticket-code">{{ r.ticketCode }}</code></dd>
                    @for (field of formFields(); track field.id) {
                      @if (r.customFields?.[field.id]) {
                        <dt>{{ field.label }}</dt><dd>{{ r.customFields![field.id] }}</dd>
                      }
                    }
                  </dl>
                  <div class="reg-actions">
                    @if (telLink(r.phone)) {
                      <a class="btn btn-secondary btn-sm" [href]="telLink(r.phone)">
                        <lucide-icon [img]="Phone" [size]="15"></lucide-icon> Llamar
                      </a>
                    }
                    @if (waLink(r.phone)) {
                      <a class="btn btn-secondary btn-sm" [href]="waLink(r.phone)" target="_blank" rel="noopener">
                        <lucide-icon [img]="MessageCircle" [size]="15"></lucide-icon> WhatsApp
                      </a>
                    }
                    <button type="button" class="btn btn-ghost btn-sm" (click)="copyEmail(r.email)">
                      <lucide-icon [img]="Copy" [size]="15"></lucide-icon> Copiar email
                    </button>
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <div class="regs-table-wrap">
          <table class="regs-table">
            <thead>
              <tr>
                @if (formFields().length > 0) { <th class="th-expand"></th> }
                <th class="th-sortable" (click)="setSortBy('name')">
                  Nombre
                  <lucide-icon [img]="regSortBy()==='name' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                </th>
                <th class="th-sortable" (click)="setSortBy('email')">
                  Email
                  <lucide-icon [img]="regSortBy()==='email' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                </th>
                <th>Teléfono</th>
                <th class="th-sortable" (click)="setSortBy('partySize')">
                  Pers.
                  <lucide-icon [img]="regSortBy()==='partySize' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                </th>
                <th>Ticket</th>
                <th>Impulsador</th>
                <th>Check-in</th>
                <th>Estado</th>
                <th class="th-sortable" (click)="setSortBy('createdAt')">
                  Fecha
                  <lucide-icon [img]="regSortBy()==='createdAt' ? (regSortOrder()==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown" [size]="13"></lucide-icon>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (r of registrations(); track r._id) {
                <tr class="reg-row" [class.reg-row-expanded]="expandedRegIds().has(r._id)">
                  @if (formFields().length > 0) {
                    <td class="td-expand" data-label="Detalle">
                      @if (r.customFields && hasCustomFields(r.customFields)) {
                        <button class="expand-btn" (click)="toggleExpandReg(r._id)"
                          [class.expanded]="expandedRegIds().has(r._id)" title="Ver campos personalizados">
                          <lucide-icon [img]="ChevronDown" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                        </button>
                      }
                    </td>
                  }
                  <td class="td-name" data-label="Nombre">{{ r.name }}</td>
                  <td class="td-muted" data-label="Email">{{ r.email }}</td>
                  <td class="td-muted" data-label="Teléfono">{{ r.phone || '—' }}</td>
                  <td class="td-center" data-label="Personas">{{ r.partySize }}</td>
                  <td data-label="Ticket"><code class="ticket-code">{{ r.ticketCode }}</code></td>
                  <td data-label="Impulsador">
                    @if (r.impulsadorName) {
                      <span class="badge badge-neutral">{{ r.impulsadorName }}</span>
                    } @else {
                      <span class="td-muted">Directo</span>
                    }
                  </td>
                  <td class="td-center" data-label="Check-in">
                    @if (r.checkedIn) {
                      <span class="checkin-pill yes">
                        <lucide-icon [img]="Check" [size]="12" [strokeWidth]="3"></lucide-icon> Sí
                      </span>
                    } @else {
                      <span class="checkin-pill no">—</span>
                    }
                  </td>
                  <td data-label="Estado">
                    <span class="badge" [class.badge-success]="r.status === 'confirmed'"
                      [class.badge-danger]="r.status === 'cancelled'">
                      {{ r.status === 'confirmed' ? 'Confirmado' : 'Cancelado' }}
                    </span>
                  </td>
                  <td class="td-muted td-date" data-label="Fecha">{{ r.createdAt | date:'dd/MM/yy' }}</td>
                </tr>
                @if (expandedRegIds().has(r._id) && r.customFields && hasCustomFields(r.customFields)) {
                  <tr class="custom-fields-row">
                    <td [colSpan]="formFields().length > 0 ? 10 : 9">
                      <div class="custom-fields-answers">
                        @for (field of formFields(); track field.id) {
                          @if (r.customFields && r.customFields[field.id]) {
                            <span class="custom-answer-item">
                              <strong>{{ field.label }}:</strong> {{ r.customFields[field.id] }}
                            </span>
                          }
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .text-muted-xs { font-size: 12px; color: var(--color-text-muted); }

    /* ── Registrations ── */
    .regs-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
    .regs-search-wrap { flex:1; min-width:180px; position:relative; display:flex; align-items:center; }
    .regs-search-wrap lucide-icon { position:absolute; left:12px; color:var(--color-text-muted); pointer-events:none; }
    .regs-search-input { width:100%; padding-left:38px; }
    .regs-filter-select { width:auto; min-width:160px; padding:9px 14px; font-size:14px; }
    .regs-meta { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .regs-empty { padding:64px 40px; text-align:center; color:var(--color-text-muted); display:flex; flex-direction:column; align-items:center; gap:16px; background:var(--color-bg-app); border-radius:16px; border:1px dashed var(--color-border); }
    .regs-table-wrap { overflow-x:auto; border-radius:14px; border:1px solid var(--color-border); }
    .regs-table { width:100%; border-collapse:collapse; }
    .regs-table thead { background:var(--color-bg-app); }
    .regs-table th { padding:11px 14px; text-align:left; font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:0.04em; border-bottom:1px solid var(--color-border); white-space:nowrap; }
    .th-sortable { cursor:pointer; user-select:none; }
    .th-sortable:hover { color:var(--color-text-main); background:rgba(0,0,0,0.02); }
    .th-sortable lucide-icon { vertical-align:middle; margin-left:4px; }
    .th-expand { width:36px; padding:0 4px; }
    .regs-table td { padding:12px 14px; font-size:14px; color:var(--color-text-main); border-bottom:1px solid var(--color-border); vertical-align:middle; }
    .regs-table tbody tr:last-child td { border-bottom:none; }
    .regs-table tbody tr:last-child.custom-fields-row td { border-bottom:none; }
    .reg-row:hover td { background:var(--color-bg-app); }
    .reg-row-expanded td { background:var(--color-brand-light); }
    .td-muted { color:var(--color-text-muted); font-size:13px; }
    .td-center { text-align:center; }
    .td-name { font-weight:600; }
    .td-expand { width:36px; padding:0 4px 0 8px; }
    .td-date { font-size:12px; white-space:nowrap; }
    .expand-btn { width:26px; height:26px; border:none; background:transparent; border-radius:6px; cursor:pointer; color:var(--color-text-muted); display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
    .expand-btn:hover { background:var(--color-brand-light); color:var(--color-brand); }
    .expand-btn.expanded { color:var(--color-brand); transform:rotate(180deg); }
    .checkin-pill { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:700; padding:3px 8px; border-radius:20px; }
    .checkin-pill.yes { background:var(--color-bg-light); color:var(--color-success); }
    .checkin-pill.no { background:var(--color-bg-app); color:var(--color-text-muted); }
    .ticket-code { font-family:monospace; font-size:12px; font-weight:700; background:var(--color-bg-app); padding:3px 7px; border-radius:6px; color:var(--color-brand); letter-spacing:0.05em; }
    .custom-fields-row td { padding:8px 14px 12px; background:var(--color-bg-light); }
    .custom-fields-answers { display:flex; flex-wrap:wrap; gap:8px; }
    .custom-answer-item { font-size:12px; color:var(--color-text-muted); background:var(--color-white); border:1px solid var(--color-border); padding:3px 10px; border-radius:8px; }
    .custom-answer-item strong { color:var(--color-text-main); }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .regs-toolbar { flex-direction: column; align-items: stretch; }
      .regs-search-wrap, .regs-filter-select { width: 100%; min-width: 0; }
      .regs-toolbar .btn { width: 100%; justify-content: center; }


      /* ── Lista compacta (HU31) ── */
      .reg-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
      .reg-item { background:var(--color-white); border:1px solid var(--color-border); border-radius:16px; overflow:hidden; }
      .reg-item.open { border-color:var(--color-brand); }
      .reg-head { width:100%; min-height:56px; display:flex; flex-direction:column; gap:6px; padding:12px 14px; border:none; background:none; text-align:left; cursor:pointer; font:inherit; color:inherit; }
      .reg-line1 { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .reg-name { font-size:16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .reg-chevron { color:var(--color-text-muted); transition:transform .2s; flex-shrink:0; }
      .reg-item.open .reg-chevron { transform:rotate(180deg); }
      .reg-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
      .chip { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:700; padding:3px 8px; border-radius:var(--radius-pill); background:var(--color-bg-app); border:1px solid var(--color-border); }
      .reg-line2 { font-size:13px; color:var(--color-text-muted); }
      .reg-detail { padding:0 14px 14px; border-top:1px dashed var(--color-border); }
      .reg-detail dl { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; margin:12px 0; font-size:14px; }
      .reg-detail dt { color:var(--color-text-muted); font-weight:600; }
      .reg-detail dd { margin:0; word-break:break-word; }
      .reg-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .reg-actions .btn { flex:1 1 auto; justify-content:center; min-height:44px; }
    }
  `],
})
export class EventRegistrationsTabComponent implements OnDestroy {
  private store = inject(EventDetailStore);
  private toast = inject(ToastService);

  readonly ArrowDown = ArrowDown; readonly ArrowUp = ArrowUp; readonly ArrowUpDown = ArrowUpDown;
  readonly Check = Check; readonly ChevronDown = ChevronDown; readonly Download = Download;
  readonly Search = Search; readonly Ticket = Ticket;
  readonly Copy = Copy; readonly MessageCircle = MessageCircle; readonly Phone = Phone; readonly Users = Users;
  readonly SORT_OPTIONS = SORT_OPTIONS;
  readonly telLink = telLink;
  readonly waLink = waLink;

  /** En el móvil, lista compacta en vez de tabla (HU31). */
  isMobile = signal(false);
  private mql: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)')
      : null;
  private onMql = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);

  registrations = this.store.registrations;
  regsLoading = this.store.regsLoading;
  formFields = this.store.formFields;
  regSearch = this.store.regSearch;
  regStatusFilter = this.store.regStatusFilter;
  regSortBy = this.store.regSortBy;
  regSortOrder = this.store.regSortOrder;

  expandedRegIds = signal<Set<string>>(new Set());

  constructor() {
    this.isMobile.set(!!this.mql?.matches);
    this.mql?.addEventListener?.('change', this.onMql);
  }

  ngOnDestroy() {
    this.mql?.removeEventListener?.('change', this.onMql);
  }

  sortKey(): string { return `${this.regSortBy()}:${this.regSortOrder()}`; }

  onSortKey(key: string) {
    const o = SORT_OPTIONS.find(x => x.key === key);
    if (!o) return;
    this.regSortBy.set(o.sortBy);
    this.regSortOrder.set(o.sortOrder);
    this.store.loadRegistrations();
  }

  copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(
      () => this.toast.success('Email copiado'),
      () => this.toast.error('No se pudo copiar el email'),
    );
  }
  private regSearchDebounce: ReturnType<typeof setTimeout> | null = null;

  onRegSearchChange(value: string) {
    this.regSearch.set(value);
    if (this.regSearchDebounce) clearTimeout(this.regSearchDebounce);
    this.regSearchDebounce = setTimeout(() => this.store.loadRegistrations(), 350);
  }

  onRegFilterChange() {
    this.store.loadRegistrations();
  }

  setSortBy(field: string) {
    if (this.regSortBy() === field) {
      this.regSortOrder.set(this.regSortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.regSortBy.set(field);
      this.regSortOrder.set('asc');
    }
    this.store.loadRegistrations();
  }

  toggleExpandReg(id: string) {
    this.expandedRegIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  hasCustomFields(cf: Record<string, string>): boolean {
    return Object.values(cf).some(v => v);
  }

  downloadExcel() {
    const regs = this.registrations();
    const fields = this.formFields();
    const headers = ['Ticket', 'Nombre', 'Email', 'Teléfono', 'Personas', 'Impulsador', 'Estado', 'Check-in', 'Fecha Registro',
      ...fields.map(f => f.label)];

    const rows = regs.map(r => [
      r.ticketCode,
      r.name,
      r.email,
      r.phone ?? '',
      r.partySize,
      r.impulsadorName ?? 'Directo',
      r.status === 'confirmed' ? 'Confirmado' : 'Cancelado',
      r.checkedIn ? 'Sí' : 'No',
      new Date(r.createdAt).toLocaleDateString('es-PE'),
      ...fields.map(f => r.customFields?.[f.id] ?? ''),
    ]);

    downloadCsv(headers, rows, `asistentes_${this.store.event()?.title ?? 'evento'}_${new Date().toISOString().slice(0, 10)}.csv`);
    this.toast.success('Archivo descargado');
  }
}
