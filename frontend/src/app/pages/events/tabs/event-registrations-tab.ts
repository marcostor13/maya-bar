import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  LucideAngularModule,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  Search,
  Ticket,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { downloadCsv } from '../../../shared/csv';
import { EventDetailStore } from '../event-detail.store';

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
          <input type="text" class="regs-search-input" placeholder="Buscar por nombre, email o ticket..."
            [value]="regSearch()" (input)="onRegSearchChange($any($event.target).value)" />
        </div>
        <select class="input regs-filter-select"
          [value]="regStatusFilter()"
          (change)="regStatusFilter.set($any($event.target).value); onRegFilterChange()">
          <option value="all">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="cancelled">Cancelados</option>
        </select>
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
    .regs-search-input { width:100%; padding:9px 14px 9px 36px; border:1px solid var(--color-border); border-radius:10px; font-size:14px; outline:none; background:var(--color-bg-app); transition:all 0.2s; }
    .regs-search-input:focus { border-color:var(--color-brand); background:#fff; box-shadow:0 0 0 3px var(--color-brand-light); }
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
    .checkin-pill.yes { background:#dcfce7; color:#16a34a; }
    .checkin-pill.no { background:var(--color-bg-app); color:var(--color-text-muted); }
    .ticket-code { font-family:monospace; font-size:12px; font-weight:700; background:var(--color-bg-app); padding:3px 7px; border-radius:6px; color:var(--color-brand); letter-spacing:0.05em; }
    .custom-fields-row td { padding:8px 14px 12px; background:#f8faff; }
    .custom-fields-answers { display:flex; flex-wrap:wrap; gap:8px; }
    .custom-answer-item { font-size:12px; color:var(--color-text-muted); background:#fff; border:1px solid var(--color-border); padding:3px 10px; border-radius:8px; }
    .custom-answer-item strong { color:var(--color-text-main); }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .regs-toolbar { flex-direction: column; align-items: stretch; }
      .regs-search-wrap, .regs-filter-select { width: 100%; min-width: 0; }
      .regs-toolbar .btn { width: 100%; justify-content: center; }

      .regs-table-wrap { border: none; overflow: visible; }
      .regs-table thead { display: none; }
      .regs-table, .regs-table tbody, .regs-table tr { display: block; width: 100%; }
      .regs-table tr.reg-row { background: #fff; border: 1px solid var(--color-border); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; }
      .regs-table tr.custom-fields-row { border: none; margin-top: -12px; margin-bottom: 12px; padding: 0 4px; }
      .regs-table td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 2px; border-bottom: 1px dashed var(--color-border); text-align: right; }
      .regs-table td:last-child { border-bottom: none; }
      .regs-table td::before { content: attr(data-label); font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; text-align: left; }
      .regs-table td.td-name { display: block; text-align: left; font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--color-border); padding: 0 2px 10px; margin-bottom: 6px; }
      .regs-table td.td-name::before { content: none; }
      .regs-table td.td-expand { display: flex; justify-content: flex-end; border-bottom: none; padding: 0 0 6px; width: 100%; }
      .regs-table td.td-expand::before { content: none; }
      .regs-table tr.custom-fields-row td { display: block; text-align: left; border-bottom: none; padding: 0 4px; }
      .regs-table tr.custom-fields-row td::before { content: none; }
      .regs-table .custom-fields-answers { justify-content: flex-start; }
    }
  `],
})
export class EventRegistrationsTabComponent {
  private store = inject(EventDetailStore);
  private toast = inject(ToastService);

  readonly ArrowDown = ArrowDown; readonly ArrowUp = ArrowUp; readonly ArrowUpDown = ArrowUpDown;
  readonly Check = Check; readonly ChevronDown = ChevronDown; readonly Download = Download;
  readonly Search = Search; readonly Ticket = Ticket;

  registrations = this.store.registrations;
  regsLoading = this.store.regsLoading;
  formFields = this.store.formFields;
  regSearch = this.store.regSearch;
  regStatusFilter = this.store.regStatusFilter;
  regSortBy = this.store.regSortBy;
  regSortOrder = this.store.regSortOrder;

  expandedRegIds = signal<Set<string>>(new Set());
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
