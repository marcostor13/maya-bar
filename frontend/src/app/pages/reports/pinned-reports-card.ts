import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ReportViewComponent, type ReportChart, type ReportResult } from './report-view';

interface Pinned { report: { _id: string; name: string; chart: ReportChart }; result: ReportResult | null }

/** Reportes fijados en el dashboard de quien mira (HU64). Si no hay, no ocupa espacio. */
@Component({
  selector: 'app-pinned-reports-card',
  standalone: true,
  imports: [RouterLink, ReportViewComponent],
  template: `
    @if (items().length) {
      <h2 class="section">Mis reportes <a routerLink="/reportes">Ver todos</a></h2>
      <div class="grid">
        @for (p of items(); track p.report._id) {
          <div class="card pinned">
            <h3>{{ p.report.name }}</h3>
            @if (p.result) { <app-report-view [result]="p.result" [chart]="p.report.chart" /> }
            @else { <p class="muted">No se pudo calcular.</p> }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .section { font-family: var(--font-heading); font-size: 18px; margin: 28px 0 14px; display: flex; align-items: baseline; gap: 12px; }
    .section a { font-size: 13px; font-weight: 500; color: var(--color-brand); text-decoration: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
    .pinned { padding: 24px; }
    .pinned h3 { font-size: 15px; margin: 0 0 12px; }
    .muted { color: var(--color-text-muted); font-size: 13px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class PinnedReportsCardComponent implements OnInit {
  private http = inject(HttpClient);
  items = signal<Pinned[]>([]);

  ngOnInit() {
    this.http.get<Pinned[]>(`${environment.apiUrl}/reports/pinned`).subscribe({
      next: (r) => this.items.set(Array.isArray(r) ? r : []),
      error: () => this.items.set([]),
    });
  }
}
