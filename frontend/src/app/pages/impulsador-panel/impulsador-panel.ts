import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { LucideAngularModule, MapPin, ContactRound, Zap, Gauge, Copy, TrendingUp, Calendar } from 'lucide-angular';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface Stats {
  today: number;
  week: number;
  month: number;
  contacts: number;
  eventRegistrations: number;
}

interface RecentReg {
  _id: string;
  name: string;
  email: string;
  eventTitle?: string;
  eventDate?: string;
  createdAt: string;
}

interface RecentVisit {
  _id: string;
  reference: string;
  location: { lat: number; lng: number };
  createdAt: string;
}

@Component({
  selector: 'app-impulsador-panel',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Mi Panel</h1>
          <p class="page-sub">Resumen de tu actividad como impulsador</p>
        </div>
        @if (referralCode()) {
          <div class="ref-badge">
            <span class="ref-label">Mi código</span>
            <code class="ref-code">{{ referralCode() }}</code>
            <button class="btn btn-sm btn-ghost" (click)="copyCode()" aria-label="Copiar código">
              <lucide-icon [img]="Copy" [size]="14" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
        }
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card card">
          <div class="stat-icon" style="background: var(--color-brand-light); color: var(--color-brand)">
            <lucide-icon [img]="ContactRound" [size]="22" [strokeWidth]="2"></lucide-icon>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()?.contacts ?? '—' }}</span>
            <span class="stat-label">Mis Contactos</span>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon" style="background: #FEF3C7; color: #D97706">
            <lucide-icon [img]="Zap" [size]="22" [strokeWidth]="2"></lucide-icon>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ myRegs().length }}</span>
            <span class="stat-label">Registros por mi código</span>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon" style="background: #DCFCE7; color: #16A34A">
            <lucide-icon [img]="MapPin" [size]="22" [strokeWidth]="2"></lucide-icon>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()?.today ?? '—' }}</span>
            <span class="stat-label">Visitas hoy</span>
          </div>
        </div>
        <div class="stat-card card">
          <div class="stat-icon" style="background: #F3E8FF; color: #9333EA">
            <lucide-icon [img]="TrendingUp" [size]="22" [strokeWidth]="2"></lucide-icon>
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()?.month ?? '—' }}</span>
            <span class="stat-label">Visitas este mes</span>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="actions-row">
        <h2 class="section-title">Acciones rápidas</h2>
        <div class="actions-grid">
          <button class="action-btn card" (click)="goTo('/visitas')">
            <lucide-icon [img]="MapPin" [size]="28" [strokeWidth]="1.5"></lucide-icon>
            <span>Registrar visita</span>
          </button>
          <button class="action-btn card" (click)="goTo('/customers')">
            <lucide-icon [img]="ContactRound" [size]="28" [strokeWidth]="1.5"></lucide-icon>
            <span>Añadir contacto</span>
          </button>
          <button class="action-btn card" (click)="goTo('/events')">
            <lucide-icon [img]="Zap" [size]="28" [strokeWidth]="1.5"></lucide-icon>
            <span>Ver eventos</span>
          </button>
        </div>
      </div>

      <!-- Recent activity -->
      <div class="activity-section">
        <div class="activity-col">
          <h2 class="section-title">Últimas visitas</h2>
          @if (recentVisits().length === 0) {
            <div class="empty-card card"><p>Sin visitas registradas aún.</p></div>
          } @else {
            <div class="activity-list card">
              @for (v of recentVisits(); track v._id) {
                <div class="activity-item">
                  <div class="activity-icon map-icon">
                    <lucide-icon [img]="MapPin" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                  </div>
                  <div class="activity-body">
                    <span class="activity-title">{{ v.reference }}</span>
                    <span class="activity-meta">{{ formatDate(v.createdAt) }}</span>
                  </div>
                  <a [href]="mapsLink(v.location)" target="_blank" class="btn btn-sm btn-ghost" aria-label="Ver en mapa">
                    <lucide-icon [img]="MapPin" [size]="13" [strokeWidth]="2.5"></lucide-icon>
                  </a>
                </div>
              }
            </div>
          }
        </div>

        <div class="activity-col">
          <h2 class="section-title">Registros por mi código</h2>
          @if (myRegs().length === 0) {
            <div class="empty-card card"><p>Nadie se ha registrado con tu código aún.</p></div>
          } @else {
            <div class="activity-list card">
              @for (r of myRegs(); track r._id) {
                <div class="activity-item">
                  <div class="activity-icon reg-icon">
                    <lucide-icon [img]="Calendar" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                  </div>
                  <div class="activity-body">
                    <span class="activity-title">{{ r.name }}</span>
                    <span class="activity-meta">{{ r.eventTitle ?? 'Evento' }} · {{ formatDate(r.createdAt) }}</span>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 32px; }
    .page-header h1 { font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-text-main); margin: 0; }
    .page-sub { color: var(--color-text-muted); font-size: 14px; margin: 4px 0 0; }

    .ref-badge { display: flex; align-items: center; gap: 8px; background: var(--color-brand-light); border: 1px solid var(--color-brand); border-radius: var(--radius-lg); padding: 8px 16px; }
    .ref-label { font-size: 12px; font-weight: 600; color: var(--color-brand); text-transform: uppercase; letter-spacing: 0.05em; }
    .ref-code { font-family: monospace; font-size: 18px; font-weight: 700; color: var(--color-brand); letter-spacing: 0.1em; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .stat-card { display: flex; align-items: center; gap: 16px; padding: 20px 24px; }
    .stat-icon { width: 48px; height: 48px; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .stat-value { font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-text-main); display: block; line-height: 1; }
    .stat-label { font-size: 12px; color: var(--color-text-muted); display: block; margin-top: 4px; font-weight: 500; }

    .section-title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; color: var(--color-text-main); margin: 0 0 16px; }

    .actions-row { margin-bottom: 32px; }
    .actions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .action-btn { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 24px; cursor: pointer; border: 2px solid var(--color-border); background: var(--color-white); border-radius: var(--radius-lg); color: var(--color-text-muted); font-size: 14px; font-weight: 600; transition: all var(--transition-fast); }
    .action-btn:hover { border-color: var(--color-brand); color: var(--color-brand); box-shadow: var(--shadow-lg); transform: translateY(-2px); }

    .activity-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .empty-card { padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 14px; }
    .activity-list { padding: 8px 0; }
    .activity-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .map-icon { background: #DCFCE7; color: #16A34A; }
    .reg-icon { background: #FEF3C7; color: #D97706; }
    .activity-body { flex: 1; min-width: 0; }
    .activity-title { font-size: 14px; font-weight: 600; color: var(--color-text-main); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .activity-meta { font-size: 12px; color: var(--color-text-muted); display: block; }

    @media (max-width: 968px) {
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .activity-section { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header h1 { font-size: 22px; }
      .stats-row { gap: 12px; margin-bottom: 24px; }
      .stat-card { padding: 16px; gap: 12px; }
      .stat-icon { width: 40px; height: 40px; }
      .stat-value { font-size: 22px; }
      .actions-row { margin-bottom: 24px; }
      .actions-grid { grid-template-columns: repeat(2, 1fr); }
      .action-btn { padding: 20px 16px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .ref-badge { width: 100%; justify-content: space-between; box-sizing: border-box; }
      .stats-row { grid-template-columns: 1fr 1fr; }
      .actions-grid { grid-template-columns: 1fr; }
      .action-btn { flex-direction: row; justify-content: flex-start; padding: 16px 20px; }
    }
  `],
})
export class ImpulsadorPanelComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly Copy = Copy;
  readonly MapPin = MapPin;
  readonly ContactRound = ContactRound;
  readonly Zap = Zap;
  readonly Gauge = Gauge;
  readonly TrendingUp = TrendingUp;
  readonly Calendar = Calendar;

  stats = signal<Stats | null>(null);
  myRegs = signal<RecentReg[]>([]);
  recentVisits = signal<RecentVisit[]>([]);
  referralCode = computed(() => this.auth.currentUser()?.referralCode ?? null);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<Stats>(`${API}/visits/stats`).subscribe({
      next: s => this.stats.set(s),
      error: () => {},
    });
    this.http.get<RecentReg[]>(`${API}/impulsador/registrations`).subscribe({
      next: regs => this.myRegs.set(regs.slice(0, 10)),
      error: () => {},
    });
    this.http.get<RecentVisit[]>(`${API}/visits`).subscribe({
      next: visits => this.recentVisits.set(visits.slice(0, 5)),
      error: () => {},
    });
  }

  copyCode() {
    const code = this.referralCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.toast.success('Código copiado al portapapeles');
    });
  }

  goTo(path: string) {
    void this.router.navigate([path]);
  }

  mapsLink(location: { lat: number; lng: number }) {
    return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }
}
