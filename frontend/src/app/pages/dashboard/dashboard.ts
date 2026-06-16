import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { LucideAngularModule, Store } from 'lucide-angular';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="dashboard animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Buenos días, {{ firstName() }}</h1>
          <p class="subtitle">Aquí tienes un resumen de tus locales.</p>
        </div>
        <a routerLink="/locals" class="btn btn-primary">+ Nuevo local</a>
      </div>

      <!-- Stats Row -->
      <div class="stats-row">
        <div class="stat-card card">
          <span class="stat-label">Locales activos</span>
          <span class="stat-value">{{ locals().length }}</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Pedidos hoy</span>
          <span class="stat-value">—</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Reservas hoy</span>
          <span class="stat-value">—</span>
        </div>
        <div class="stat-card card">
          <span class="stat-label">Clientes en CRM</span>
          <span class="stat-value">—</span>
        </div>
      </div>

      <!-- Locals -->
      <section class="section">
        <div class="section-header">
          <h2>Mis locales</h2>
          <a routerLink="/locals" class="btn btn-secondary">Ver todos</a>
        </div>

        @if (loading()) {
          <div class="loading-state">Cargando locales...</div>
        } @else if (locals().length === 0) {
          <div class="empty-state card">
            <div class="empty-icon"><lucide-icon [img]="Store" [size]="48" [strokeWidth]="2"></lucide-icon></div>
            <h3>No tienes locales todavía</h3>
            <p>Crea tu primer local para comenzar a operar.</p>
            <a routerLink="/onboarding" class="btn btn-primary">Crear mi primer local</a>
          </div>
        } @else {
          <div class="locals-grid">
            @for (local of locals(); track local._id) {
              <div class="local-card card">
                <div class="local-header">
                  <span class="local-type-badge">{{ typeLabel(local.type) }}</span>
                  <span class="local-status" [class.active]="local.isActive">
                    {{ local.isActive ? 'Activo' : 'Inactivo' }}
                  </span>
                </div>
                <h3 class="local-name">{{ local.name }}</h3>
                @if (local.address) {
                  <p class="local-address">{{ local.address }}</p>
                }
                <div class="local-meta">
                  <span>{{ local.tableCount || 0 }} mesas</span>
                </div>
                <div class="local-actions">
                  <a routerLink="/menu" class="btn btn-secondary btn-sm">Menú</a>
                  <a routerLink="/orders" class="btn btn-secondary btn-sm">Pedidos</a>
                </div>
              </div>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .dashboard { padding: 32px 40px; width: 100%; box-sizing: border-box; }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 32px;
    }

    .page-header h1 { margin-bottom: 4px; font-size: 26px; }

    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 40px;
    }

    .stat-card {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }

    .stat-value {
      font-family: var(--font-heading);
      font-size: 28px;
      font-weight: 700;
      color: var(--color-text-main);
    }

    .section { margin-bottom: 40px; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .section-header h2 { margin: 0; font-size: 18px; }

    .btn-sm { padding: 6px 12px; font-size: 13px; }

    .locals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .local-card {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .local-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .local-type-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-ai);
      background: #EFF6FF;
      padding: 3px 8px;
      border-radius: 20px;
    }

    .local-status {
      font-size: 11px;
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .local-status.active { color: var(--color-success); }

    .local-name {
      font-size: 16px;
      margin: 4px 0 2px;
    }

    .local-address {
      font-size: 13px;
      color: var(--color-text-muted);
      margin: 0;
    }

    .local-meta {
      font-size: 13px;
      color: var(--color-text-muted);
    }

    .local-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--color-border);
    }

    .loading-state {
      padding: 40px;
      text-align: center;
      color: var(--color-text-muted);
    }

    .empty-state {
      text-align: center;
      padding: 60px 40px;
    }

    .empty-icon {
      font-size: 40px;
      margin-bottom: 16px;
    }

    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 24px; }
  `],
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly Store = Store;

  loading = signal(true);
  locals = signal<any[]>([]);

  private typeLabels: Record<string, string> = {
    restaurant: 'Restaurante', bar: 'Bar', cafe: 'Café',
    cafeteria: 'Cafetería', fastfood: 'Fast Food',
  };

  ngOnInit() {
    this.http.get<any[]>(`${API}/locals`).subscribe({
      next: (data) => { this.locals.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  firstName() {
    const user = this.auth.currentUser();
    const name = user?.name || user?.email || '';
    return name.split(' ')[0];
  }

  typeLabel(type: string) {
    return this.typeLabels[type] || type;
  }
}
