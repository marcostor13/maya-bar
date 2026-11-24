import { Component, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule, FileText, Plus } from 'lucide-angular';
import { Quote, QUOTE_STATUS, QuotesApiService } from '../../core/api/quotes-api.service';

/** Cotizaciones de la oportunidad, en su ficha (HU68). */
@Component({
  selector: 'app-lead-quotes',
  standalone: true,
  imports: [LucideAngularModule, DecimalPipe],
  template: `
    <div class="lq">
      <div class="lq-head">
        <h3><lucide-icon [img]="FileText" [size]="16"></lucide-icon> Cotizaciones</h3>
        @if (canWork()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="create()">
            <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Nueva
          </button>
        }
      </div>
      @if (quotes().length === 0) {
        <p class="muted">Arma una cotización y mándala por WhatsApp o email con un link para aceptarla.</p>
      }
      @for (q of quotes(); track q._id) {
        <button type="button" class="lq-row" (click)="open(q)">
          <span class="lq-num">{{ q.number }}</span>
          <span class="badge" [class]="'badge ' + status[q.status].badge">{{ status[q.status].label }}</span>
          <span class="lq-total">S/ {{ q.total | number:'1.2-2' }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .lq { display: flex; flex-direction: column; gap: 8px; }
    .lq-head { display: flex; justify-content: space-between; align-items: center; }
    h3 { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; font-weight: 700; }
    .muted { color: var(--color-text-muted); font-size: 13px; margin: 0; }
    .lq-row { display: grid; grid-template-columns: auto auto 1fr; gap: 10px; align-items: center; width: 100%; text-align: left;
      background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px 14px; cursor: pointer;
      font: inherit; color: inherit; transition: border-color .15s; }
    .lq-row:hover { border-color: var(--color-brand); }
    .lq-num { font-weight: 700; }
    .lq-total { text-align: right; font-weight: 700; }
  `],
})
export class LeadQuotesComponent {
  private api = inject(QuotesApiService);
  private router = inject(Router);
  readonly FileText = FileText; readonly Plus = Plus;
  readonly status = QUOTE_STATUS;

  leadId = input.required<string>();
  canWork = input(false);
  quotes = signal<Quote[]>([]);

  constructor() {
    effect(() => {
      const id = this.leadId();
      this.api.byLead(id).subscribe({ next: (q) => this.quotes.set(q), error: () => this.quotes.set([]) });
    });
  }

  create() { void this.router.navigate(['/cotizaciones', 'nueva'], { queryParams: { lead: this.leadId() } }); }

  open(q: Quote) { void this.router.navigate(['/cotizaciones', q._id]); }
}
