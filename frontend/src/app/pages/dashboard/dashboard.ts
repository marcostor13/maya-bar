import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import {
  LucideAngularModule, ContactRound, MessagesSquare, Target, Bot,
  TriangleAlert, CalendarClock, Inbox, Sparkles, Tag, Radio,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface Desglose { key: string; label: string; count: number }

interface CrmDashboard {
  contactos: { total: number; nuevosEsteMes: number; nuevosMesAnterior: number; conEtiquetas: number };
  conversaciones: { abiertas: number; sinLeer: number; mensajesSinLeer: number; atendidasPorIa: number; activasHoy: number };
  seguimiento: {
    open: number; openValue: number; weightedValue: number;
    wonThisMonth: number; wonValueThisMonth: number; lostThisMonth: number;
    conversionRate: number; overdueTasks: number; dueTodayTasks: number;
  };
  agentes: { publicados: number; total: number; respuestasIa: number; respuestasHumanas: number; autonomia: number };
  contactosPorCanal: Desglose[];
  contactosPorEtiqueta: Desglose[];
  conversacionesPorCanal: Desglose[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ saludo() }}, {{ firstName() }}</h1>
          <p class="page-subtitle">Cómo va tu cartera de clientes y conversaciones.</p>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-state">Cargando tu resumen…</div>
      } @else if (error()) {
        <div class="empty-state card">
          <p>{{ error() }}</p>
          <button class="btn btn-secondary btn-sm" (click)="load()">Reintentar</button>
        </div>
      } @else if (data(); as d) {

        <!-- Lo que requiere acción hoy va primero: es a lo que se entra a mirar. -->
        @if (d.seguimiento.overdueTasks > 0 || d.conversaciones.sinLeer > 0) {
          <div class="alerts">
            @if (d.seguimiento.overdueTasks > 0) {
              <a routerLink="/leads" class="alert alert--warn">
                <lucide-icon [img]="TriangleAlert" [size]="18" [strokeWidth]="2.4" />
                <span><strong>{{ d.seguimiento.overdueTasks }}</strong>
                  {{ d.seguimiento.overdueTasks === 1 ? 'seguimiento vencido' : 'seguimientos vencidos' }}</span>
              </a>
            }
            @if (d.conversaciones.sinLeer > 0) {
              <a routerLink="/inbox" class="alert alert--info">
                <lucide-icon [img]="Inbox" [size]="18" [strokeWidth]="2.4" />
                <span><strong>{{ d.conversaciones.sinLeer }}</strong>
                  {{ d.conversaciones.sinLeer === 1 ? 'conversación sin leer' : 'conversaciones sin leer' }}</span>
              </a>
            }
          </div>
        }

        <div class="stats-row">
          <a routerLink="/customers" class="stat-card card">
            <div class="stat-head">
              <span class="stat-icon" style="background:#EEF2FF;color:#4F46E5">
                <lucide-icon [img]="ContactRound" [size]="18" [strokeWidth]="2.4" />
              </span>
              <span class="stat-label">Contactos</span>
            </div>
            <span class="stat-value">{{ d.contactos.total }}</span>
            @let delta = crecimiento(d);
            <span class="stat-foot" [class.up]="(delta ?? 0) > 0" [class.down]="(delta ?? 0) < 0">
              {{ d.contactos.nuevosEsteMes }} este mes
              @if (delta !== null) { <span>· {{ delta > 0 ? '+' : '' }}{{ delta }}%</span> }
            </span>
          </a>

          <a routerLink="/inbox" class="stat-card card">
            <div class="stat-head">
              <span class="stat-icon" style="background:#ECFDF5;color:#059669">
                <lucide-icon [img]="MessagesSquare" [size]="18" [strokeWidth]="2.4" />
              </span>
              <span class="stat-label">Conversaciones</span>
            </div>
            <span class="stat-value">{{ d.conversaciones.abiertas }}</span>
            <span class="stat-foot">{{ d.conversaciones.activasHoy }} activas hoy</span>
          </a>

          <a routerLink="/leads" class="stat-card card">
            <div class="stat-head">
              <span class="stat-icon" style="background:#FFF0F3;color:#E11D48">
                <lucide-icon [img]="Target" [size]="18" [strokeWidth]="2.4" />
              </span>
              <span class="stat-label">En seguimiento</span>
            </div>
            <span class="stat-value">{{ d.seguimiento.open }}</span>
            <span class="stat-foot">{{ d.seguimiento.dueTodayTasks }} vencen hoy</span>
          </a>

          <a routerLink="/ai-agents" class="stat-card card">
            <div class="stat-head">
              <span class="stat-icon" style="background:#F5F3FF;color:#8B5CF6">
                <lucide-icon [img]="Bot" [size]="18" [strokeWidth]="2.4" />
              </span>
              <span class="stat-label">Resuelto por IA</span>
            </div>
            <span class="stat-value">{{ d.agentes.autonomia }}%</span>
            <span class="stat-foot">{{ d.agentes.publicados }} de {{ d.agentes.total }} agentes activos</span>
          </a>
        </div>

        <div class="grid-2">
          <!-- Seguimiento -->
          <div class="card panel">
            <div class="panel-head">
              <h2><lucide-icon [img]="CalendarClock" [size]="17" [strokeWidth]="2.4" /> Seguimiento</h2>
              <a routerLink="/leads" class="btn btn-ghost btn-sm">Ver tablero</a>
            </div>
            <div class="kpis">
              <div class="kpi">
                <span class="kpi-value">{{ money(d.seguimiento.openValue) }}</span>
                <span class="kpi-label">En juego</span>
              </div>
              <div class="kpi">
                <span class="kpi-value">{{ money(d.seguimiento.weightedValue) }}</span>
                <span class="kpi-label">Ponderado</span>
              </div>
              <div class="kpi">
                <span class="kpi-value">{{ d.seguimiento.conversionRate }}%</span>
                <span class="kpi-label">Conversión</span>
              </div>
            </div>
            <div class="mes">
              <span class="ganadas">{{ d.seguimiento.wonThisMonth }} ganadas</span>
              <span class="perdidas">{{ d.seguimiento.lostThisMonth }} perdidas</span>
              <span class="muted">este mes · {{ money(d.seguimiento.wonValueThisMonth) }}</span>
            </div>
          </div>

          <!-- Quién responde -->
          <div class="card panel">
            <div class="panel-head">
              <h2><lucide-icon [img]="Sparkles" [size]="17" [strokeWidth]="2.4" /> Quién responde</h2>
            </div>
            @if (d.agentes.respuestasIa + d.agentes.respuestasHumanas > 0) {
              <div class="split">
                <div class="split-bar">
                  <span class="split-ia" [style.width.%]="d.agentes.autonomia"></span>
                </div>
                <div class="split-legend">
                  <span><i class="dot dot--ia"></i> IA · {{ d.agentes.respuestasIa }}</span>
                  <span><i class="dot dot--human"></i> Equipo · {{ d.agentes.respuestasHumanas }}</span>
                </div>
              </div>
              <p class="panel-note">
                {{ d.conversaciones.atendidasPorIa }} conversaciones siguen en automático.
              </p>
            } @else {
              <p class="panel-note">Todavía no hay respuestas registradas.</p>
            }
          </div>
        </div>

        <div class="grid-2">
          <div class="card panel">
            <div class="panel-head">
              <h2><lucide-icon [img]="Radio" [size]="17" [strokeWidth]="2.4" /> Contactos por canal</h2>
            </div>
            @if (d.contactosPorCanal.length) {
              @for (c of d.contactosPorCanal; track c.key) {
                <div class="barra">
                  <span class="barra-label">{{ c.label }}</span>
                  <span class="barra-track">
                    <span class="barra-fill" [style.width.%]="pct(c.count, d.contactos.total)"></span>
                  </span>
                  <span class="barra-count">{{ c.count }}</span>
                </div>
              }
            } @else {
              <p class="panel-note">Sin contactos todavía.</p>
            }
          </div>

          <div class="card panel">
            <div class="panel-head">
              <h2><lucide-icon [img]="Tag" [size]="17" [strokeWidth]="2.4" /> Etiquetas más usadas</h2>
              <a routerLink="/customers" class="btn btn-ghost btn-sm">Ver contactos</a>
            </div>
            @if (d.contactosPorEtiqueta.length) {
              <div class="tags">
                @for (t of d.contactosPorEtiqueta; track t.key) {
                  <span class="badge badge-brand">{{ t.label }} <b>{{ t.count }}</b></span>
                }
              </div>
              <p class="panel-note">
                {{ d.contactos.conEtiquetas }} de {{ d.contactos.total }} contactos están etiquetados.
              </p>
            } @else {
              <p class="panel-note">Aún no has etiquetado contactos. Las etiquetas son lo que luego segmenta una campaña.</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { margin-bottom: 28px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 0 0 4px; }
    .page-subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .loading-state, .empty-state { padding: 40px; text-align: center; color: var(--color-text-muted); }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 14px; }

    .alerts { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    .alert { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: var(--radius-pill);
      font-size: 13px; font-weight: 600; text-decoration: none; transition: all var(--transition-fast); }
    .alert:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
    .alert--warn { background: #FFFBEB; color: #92400E; }
    .alert--info { background: #EFF6FF; color: #1D4ED8; }

    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .stat-card { display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: inherit; }
    .stat-head { display: flex; align-items: center; gap: 10px; }
    .stat-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .stat-label { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .stat-value { font-family: var(--font-heading); font-size: 30px; font-weight: 700; line-height: 1; }
    .stat-foot { font-size: 12px; color: var(--color-text-muted); font-weight: 600; }
    .stat-foot.up span { color: var(--color-success); }
    .stat-foot.down span { color: var(--color-error); }

    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .panel { display: flex; flex-direction: column; gap: 16px; }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .panel-head h2 { display: flex; align-items: center; gap: 8px; font-family: var(--font-heading);
      font-size: 16px; font-weight: 700; margin: 0; }
    .panel-note { font-size: 13px; color: var(--color-text-muted); margin: 0; line-height: 1.5; }

    .kpis { display: flex; gap: 24px; flex-wrap: wrap; }
    .kpi { display: flex; flex-direction: column; gap: 2px; }
    .kpi-value { font-family: var(--font-heading); font-size: 20px; font-weight: 700; }
    .kpi-label { font-size: 12px; color: var(--color-text-muted); font-weight: 600; }
    .mes { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; font-weight: 600; }
    .ganadas { color: var(--color-success); }
    .perdidas { color: var(--color-error); }
    .muted { color: var(--color-text-muted); font-weight: 500; }

    .split { display: flex; flex-direction: column; gap: 10px; }
    .split-bar { height: 10px; border-radius: var(--radius-pill); background: var(--color-border); overflow: hidden; }
    .split-ia { display: block; height: 100%; background: var(--color-ai); }
    .split-legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }
    .dot--ia { background: var(--color-ai); }
    .dot--human { background: var(--color-border); }

    .barra { display: flex; align-items: center; gap: 12px; font-size: 13px; }
    .barra-label { width: 110px; flex-shrink: 0; font-weight: 600; color: var(--color-text-main);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .barra-track { flex: 1; height: 8px; border-radius: var(--radius-pill); background: var(--color-bg-app); overflow: hidden; }
    .barra-fill { display: block; height: 100%; background: var(--color-brand); border-radius: var(--radius-pill); }
    .barra-count { width: 40px; text-align: right; font-weight: 700; color: var(--color-text-muted); }

    .tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .tags b { margin-left: 5px; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .kpis { gap: 16px; }
      .barra-label { width: 80px; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly ContactRound = ContactRound; readonly MessagesSquare = MessagesSquare;
  readonly Target = Target; readonly Bot = Bot; readonly TriangleAlert = TriangleAlert;
  readonly CalendarClock = CalendarClock; readonly Inbox = Inbox;
  readonly Sparkles = Sparkles; readonly Tag = Tag; readonly Radio = Radio;

  data = signal<CrmDashboard | null>(null);
  loading = signal(true);
  error = signal('');

  firstName = computed(() => {
    const u = this.auth.currentUser();
    return (u?.name || u?.email || '').split(' ')[0].split('@')[0];
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.http.get<CrmDashboard>(`${API}/dashboard/crm`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudo cargar el resumen');
        this.loading.set(false);
      },
    });
  }

  saludo(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    return h < 20 ? 'Buenas tardes' : 'Buenas noches';
  }

  /** Variación de altas respecto al mes pasado; null si no hay con qué comparar. */
  crecimiento(d: CrmDashboard): number | null {
    const previo = d.contactos.nuevosMesAnterior;
    if (!previo) return null;
    return Math.round(((d.contactos.nuevosEsteMes - previo) / previo) * 100);
  }

  pct(n: number, total: number): number {
    return total ? Math.round((n / total) * 100) : 0;
  }

  money(n: number): string {
    return `S/ ${(n ?? 0).toLocaleString('es-PE')}`;
  }
}
