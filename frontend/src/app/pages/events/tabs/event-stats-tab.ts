import { Component, inject } from '@angular/core';
import { LucideAngularModule, PieChart } from 'lucide-angular';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-stats-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Registros</div>
          <div class="stat-value">{{ registrations().length }}</div>
          <div class="stat-desc">Personas únicas registradas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Asistentes</div>
          <div class="stat-value">{{ totalAttendees() }}</div>
          <div class="stat-desc">Sumatoria de party size</div>
        </div>
        <div class="stat-card brand">
          <div class="stat-label">Asistencia Real</div>
          <div class="stat-value">{{ checkedInCount() }}</div>
          <div class="stat-desc">{{ attendanceRate() }}% de los esperados</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Recaudación Est.</div>
          <div class="stat-value">S/ {{ estimatedRevenue() }}</div>
          <div class="stat-desc">Basado en precio x personas</div>
        </div>
      </div>
      <div class="mt-8">
        <h3 class="section-h3 mb-4">Asistentes por impulsador</h3>
        @if (impulsadorStats().length === 0) {
          <div class="p-8 border border-dashed rounded-2xl text-center text-muted">
            <lucide-icon [img]="PieChart" [size]="48" class="mb-4 opacity-20"></lucide-icon>
            <p>Aún no hay registros para mostrar.</p>
          </div>
        } @else {
          <div class="impulsador-stats-list">
            @for (s of impulsadorStats(); track s.name) {
              <div class="impulsador-stat-row">
                <div class="impulsador-stat-header">
                  <span class="impulsador-stat-name">{{ s.name }}</span>
                  <span class="impulsador-stat-nums">{{ s.attendees }} asistentes · {{ s.checkedIn }} en check-in</span>
                </div>
                <div class="impulsador-stat-bar-track">
                  <div class="impulsador-stat-bar-fill" [style.width.%]="(s.attendees / maxImpulsadorAttendees()) * 100"></div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; } .p-8 { padding: 32px; }
    .mt-8 { margin-top: 32px; }
    .mb-4 { margin-bottom: 16px; }
    .text-muted { color: var(--color-text-muted); }
    .border-dashed { border-style: dashed; }
    .rounded-2xl { border-radius: 16px; }
    .text-center { text-align: center; }
    .opacity-20 { opacity: 0.2; }

    .section-h3 { margin: 0; font-size: 17px; font-weight: 700; font-family: var(--font-heading); }

    /* ── Impulsador stats bars ── */
    .impulsador-stats-list { display:flex; flex-direction:column; gap:16px; }
    .impulsador-stat-row { display:flex; flex-direction:column; gap:6px; }
    .impulsador-stat-header { display:flex; justify-content:space-between; align-items:baseline; font-size:14px; }
    .impulsador-stat-name { font-weight:700; color:var(--color-text-main); }
    .impulsador-stat-nums { color:var(--color-text-muted); font-size:13px; }
    .impulsador-stat-bar-track { height:10px; background:var(--color-bg-app); border-radius:9999px; overflow:hidden; }
    .impulsador-stat-bar-fill { height:100%; background:var(--color-brand); border-radius:9999px; transition:width 0.4s ease; }

    /* ── Stats ── */
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; }
    .stat-card { padding:24px; background:#fff; border:1px solid var(--color-border); border-radius:20px; display:flex; flex-direction:column; gap:4px; }
    .stat-card.brand { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }
    .stat-card.brand .stat-label, .stat-card.brand .stat-desc { color:rgba(255,255,255,0.8); }
    .stat-label { font-size:13px; font-weight:600; text-transform:uppercase; color:var(--color-text-muted); }
    .stat-value { font-size:32px; font-weight:800; font-family:var(--font-heading); }
    .stat-desc { font-size:12px; color:var(--color-text-muted); }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }
      .p-8 { padding: 20px; }

      .stats-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
    }

    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
      .stat-value { font-size: 26px; }
    }
  `],
})
export class EventStatsTabComponent {
  private store = inject(EventDetailStore);

  readonly PieChart = PieChart;

  registrations = this.store.registrations;
  totalAttendees = this.store.totalAttendees;
  checkedInCount = this.store.checkedInCount;
  attendanceRate = this.store.attendanceRate;
  estimatedRevenue = this.store.estimatedRevenue;
  impulsadorStats = this.store.impulsadorStats;
  maxImpulsadorAttendees = this.store.maxImpulsadorAttendees;
}
