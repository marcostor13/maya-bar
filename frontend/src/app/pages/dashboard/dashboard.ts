import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PermissionsService } from '../../auth/permissions.service';
import {
  LucideAngularModule, ContactRound, MessagesSquare, Target, Bot, TriangleAlert, Inbox,
  Trophy, RefreshCw, TrendingUp, TrendingDown, Minus, MessageCircle, Megaphone, HeartPulse,
  FileText, CalendarCheck, Telescope, ShieldBan, Tag, Timer, Wallet, Flame, ArrowUpRight,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import {
  BarListComponent, ChartCardComponent, CountUpComponent, FunnelComponent, HeatmapComponent,
  RingComponent, SparklineComponent, TimeChartComponent, bucketLabel, formatMinutes, formatValue,
  type VizFormat, type VizItem, type VizSeries, type VizTable,
} from '../../shared/charts';
import type {
  AnalyticsChannel, AnalyticsRange, Breakdown, DashboardAnalytics,
} from '../../shared/models/analytics.model';

const API = environment.apiUrl;
const PREFS_KEY = 'dashboard.filters';

interface Tile { key: keyof DashboardAnalytics['kpis']; label: string; icon: typeof Bot; format: VizFormat; color: string; link?: string; module?: string }

const TILES: Tile[] = [
  { key: 'newContacts', label: 'Contactos nuevos', icon: ContactRound, format: 'int', color: 'var(--chart-1)', link: '/customers', module: 'customers' },
  { key: 'newConversations', label: 'Conversaciones nuevas', icon: MessagesSquare, format: 'int', color: 'var(--chart-1)', link: '/inbox', module: 'inbox' },
  { key: 'inbound', label: 'Mensajes recibidos', icon: MessageCircle, format: 'int', color: 'var(--chart-1)', link: '/inbox', module: 'inbox' },
  { key: 'aiShare', label: 'Autonomía de la IA', icon: Bot, format: 'pct', color: 'var(--chart-2)', link: '/ai-agents', module: 'ai-agents' },
  { key: 'newLeads', label: 'Oportunidades nuevas', icon: Target, format: 'int', color: 'var(--chart-1)', link: '/leads', module: 'leads' },
  { key: 'wonDeals', label: 'Negocios ganados', icon: Trophy, format: 'int', color: 'var(--chart-1)', link: '/leads', module: 'leads' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink, LucideAngularModule, BarListComponent, ChartCardComponent, CountUpComponent,
    FunnelComponent, HeatmapComponent, RingComponent, SparklineComponent, TimeChartComponent,
  ],
  template: `
    <div class="page animate-fade-in">
      <header class="head">
        <div>
          <h1 class="page-title">{{ saludo() }}, {{ firstName() }}</h1>
          <p class="page-subtitle">Así va tu negocio {{ periodText() }}{{ channelText() }}.</p>
        </div>
        <div class="filters">
          <div class="seg" role="radiogroup" aria-label="Periodo">
            @for (r of ranges; track r.key) {
              <button type="button" role="radio" [attr.aria-checked]="range() === r.key"
                      [class.on]="range() === r.key" (click)="setRange(r.key)">{{ r.label }}</button>
            }
          </div>
          <select class="select channel" aria-label="Canal" [value]="channel()" (change)="setChannel($any($event.target).value)">
            @for (c of channels; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
          </select>
          <button type="button" class="btn btn-secondary btn-icon refresh" [class.spin]="loading()"
                  (click)="load()" title="Actualizar" aria-label="Actualizar">
            <lucide-icon [img]="RefreshCw" [size]="16" [strokeWidth]="2.4" />
          </button>
        </div>
      </header>

      @if (!data() && loading()) {
        <div class="skeleton" aria-label="Cargando">
          <div class="sk sk-hero"></div><div class="sk sk-hero"></div>
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="sk"></div> }
          <div class="sk sk-wide"></div><div class="sk sk-tall"></div>
        </div>
      } @else if (!data() && error()) {
        <div class="empty-state card">
          <p>{{ error() }}</p>
          <button class="btn btn-secondary btn-sm" (click)="load()">Reintentar</button>
        </div>
      } @else if (data(); as d) {
        <div class="content" [class.stale]="loading()">

          @if (d.alerts.overdueTasks || d.alerts.unread || d.alerts.escalated) {
            <div class="alerts">
              @if (d.alerts.overdueTasks) {
                <a [routerLink]="can('leads') ? '/leads' : null" class="alert warn">
                  <lucide-icon [img]="TriangleAlert" [size]="16" [strokeWidth]="2.4" />
                  <strong>{{ d.alerts.overdueTasks }}</strong> {{ d.alerts.overdueTasks === 1 ? 'seguimiento vencido' : 'seguimientos vencidos' }}
                </a>
              }
              @if (d.alerts.unread) {
                <a [routerLink]="can('inbox') ? '/inbox' : null" class="alert info">
                  <lucide-icon [img]="Inbox" [size]="16" [strokeWidth]="2.4" />
                  <strong>{{ d.alerts.unread }}</strong> {{ d.alerts.unread === 1 ? 'conversación sin leer' : 'conversaciones sin leer' }}
                </a>
              }
              @if (d.alerts.escalated) {
                <a [routerLink]="can('inbox') ? '/inbox' : null" class="alert hot">
                  <lucide-icon [img]="Flame" [size]="16" [strokeWidth]="2.4" />
                  <strong>{{ d.alerts.escalated }}</strong> {{ d.alerts.escalated === 1 ? 'derivada a una persona' : 'derivadas a una persona' }}
                </a>
              }
            </div>
          }

          <section class="top">
            <div class="hero">
              <span class="orb o1"></span><span class="orb o2"></span>
              <div class="hero-label"><lucide-icon [img]="Wallet" [size]="16" [strokeWidth]="2.4" /> Ventas ganadas</div>
              <div class="hero-value"><app-count-up [value]="d.kpis.wonValue.value" format="money" /></div>
              <div class="hero-meta">
                <span class="pill light">
                  <lucide-icon [img]="trendIcon(d.kpis.wonValue.delta)" [size]="14" [strokeWidth]="2.6" />
                  {{ deltaText(d.kpis.wonValue.delta) }}
                </span>
                <span>{{ d.kpis.wonDeals.value }} {{ d.kpis.wonDeals.value === 1 ? 'negocio cerrado' : 'negocios cerrados' }}
                  · antes {{ money(d.kpis.wonValue.previous) }}</span>
              </div>
              <app-sparkline class="hero-spark" [data]="d.kpis.wonValue.series" color="var(--color-white)" />
            </div>

            <div class="pipe card-flat">
              <div class="pipe-main">
                <span class="eyebrow">Pipeline abierto</span>
                <strong class="big"><app-count-up [value]="d.pipeline.openValue" format="money" /></strong>
                <dl>
                  <div><dt>Ponderado por probabilidad</dt><dd>{{ money(d.pipeline.weightedValue) }}</dd></div>
                  <div><dt>Oportunidades abiertas</dt><dd>{{ d.pipeline.open }}</dd></div>
                  <div><dt>Ganadas / perdidas</dt><dd>{{ d.outcomes.won }} / {{ d.outcomes.lost }}</dd></div>
                </dl>
                @if (can('leads')) {
                  <a routerLink="/leads" class="link">Ver pipeline <lucide-icon [img]="ArrowUpRight" [size]="14" /></a>
                }
              </div>
              <app-ring [value]="d.kpis.conversionRate.value" label="tasa de cierre" color="var(--chart-1)" />
            </div>
          </section>

          <section class="tiles">
            @for (t of tiles; track t.key; let i = $index) {
              @let k = d.kpis[t.key];
              <a class="tile" [style.--i]="i" [routerLink]="t.link && can(t.module!) ? t.link : null">
                <div class="tile-head">
                  <span class="tile-icon" [style.color]="t.color"><lucide-icon [img]="t.icon" [size]="18" [strokeWidth]="2.4" /></span>
                  <span class="tile-label">{{ t.label }}</span>
                </div>
                <div class="tile-value"><app-count-up [value]="k.value" [format]="t.format" /></div>
                <div class="tile-foot">
                  <span class="pill" [class.up]="(k.delta ?? 0) > 0" [class.down]="(k.delta ?? 0) < 0">
                    <lucide-icon [img]="trendIcon(k.delta)" [size]="13" [strokeWidth]="2.6" />{{ deltaText(k.delta) }}
                  </span>
                  <span class="muted">vs. {{ fmt(k.previous, t.format) }}</span>
                </div>
                <app-sparkline [data]="k.series" [color]="t.color" />
              </a>
            }
          </section>

          <h2 class="section">Conversaciones</h2>
          <div class="grid g-21">
            <app-chart-card heading="Actividad de mensajes" [subtitle]="'Recibidos y respondidos por ' + bucketWord()"
                            [table]="activityTable()" [style.--i]="1">
              <app-time-chart [labels]="d.range.buckets" [series]="activitySeries()" ariaLabel="Actividad de mensajes" [height]="260" />
            </app-chart-card>
            <app-chart-card heading="Velocidad de respuesta" subtitle="Del primer mensaje del cliente a la respuesta" [style.--i]="2">
              <div class="speed">
                <app-ring [value]="d.response.withinFiveMinutes" label="respondidas en 5 min o menos" color="var(--chart-2)" />
                <dl class="stats">
                  <div><dt><lucide-icon [img]="Timer" [size]="14" /> Mediana</dt><dd>{{ minutes(d.response.medianMinutes) }}</dd></div>
                  <div><dt>9 de cada 10 en</dt><dd>{{ minutes(d.response.p90Minutes) }}</dd></div>
                  <div><dt><i class="viz-swatch" style="background:var(--chart-2)"></i> IA</dt><dd>{{ minutes(d.response.aiMedianMinutes) }}</dd></div>
                  <div><dt><i class="viz-swatch" style="background:var(--chart-3)"></i> Personas</dt><dd>{{ minutes(d.response.humanMedianMinutes) }}</dd></div>
                  <div><dt>Sin responder</dt><dd [class.warn]="d.response.unanswered > 0">{{ d.response.unanswered }}</dd></div>
                </dl>
              </div>
            </app-chart-card>
          </div>

          <div class="grid g-21">
            <app-chart-card heading="¿Cuándo te escriben?" subtitle="Mensajes recibidos por día y hora" [table]="heatTable()" [style.--i]="3">
              <app-heatmap [data]="d.heatmap" />
            </app-chart-card>
            <app-chart-card heading="Mensajes por canal" subtitle="Recibidos en el periodo" [style.--i]="4">
              <app-bar-list [items]="items(d.channels, d.kpis.inbound.value)" />
            </app-chart-card>
          </div>

          <app-chart-card heading="Agentes de IA" subtitle="Respuestas enviadas, conversaciones atendidas y derivaciones a personas"
                          [table]="agentsTable()" [style.--i]="5">
            <app-bar-list [items]="agentItems()" color="var(--chart-2)" empty="Tus agentes aún no han respondido en este periodo" />
          </app-chart-card>

          <h2 class="section">Ventas <small>{{ d.channel ? 'No se filtran por canal' : '' }}</small></h2>
          <div class="grid g-11">
            <app-chart-card heading="Embudo de oportunidades" subtitle="Oportunidades abiertas por etapa, con su valor" [table]="funnelTable()" [style.--i]="6">
              <app-funnel [steps]="funnelSteps()" />
            </app-chart-card>
            <app-chart-card heading="Ganadas vs. perdidas" [subtitle]="'Negocios cerrados por ' + bucketWord()" [table]="outcomeTable()" [style.--i]="7">
              <app-time-chart type="columns" [labels]="d.range.buckets" [series]="outcomeSeries()" ariaLabel="Ganadas y perdidas" />
            </app-chart-card>
          </div>
          <div class="grid g-11">
            <app-chart-card heading="Ingresos ganados" [subtitle]="'Valor cerrado por ' + bucketWord()" [style.--i]="8">
              <app-time-chart [labels]="d.range.buckets" [series]="wonSeries()" format="money" ariaLabel="Ingresos ganados" />
            </app-chart-card>
            <app-chart-card heading="Motivos de pérdida" subtitle="Por qué se cayeron los negocios" [style.--i]="9">
              <app-bar-list [items]="items(d.outcomes.lostReasons, d.outcomes.lost)" color="var(--chart-3)" empty="No se perdió ningún negocio" />
            </app-chart-card>
          </div>

          <h2 class="section">Marketing y crecimiento <small>{{ d.channel ? 'Contactos por el canal elegido; el resto, todos' : '' }}</small></h2>
          <div class="grid g-111">
            <app-chart-card heading="Origen de contactos" subtitle="Altas nuevas por fuente" [style.--i]="10">
              <app-bar-list [items]="items(d.sources, d.kpis.newContacts.value)" />
            </app-chart-card>
            <app-chart-card heading="Prospección" subtitle="Empresas encontradas hasta convertirse en contacto" [style.--i]="11">
              <app-funnel [steps]="prospectSteps()" />
            </app-chart-card>
            <app-chart-card heading="Etiquetas más usadas" subtitle="Entre los contactos nuevos" [style.--i]="12">
              <app-bar-list [items]="items(d.tags)" color="var(--chart-2)" empty="Sin etiquetas en este periodo" />
            </app-chart-card>
          </div>

          <div class="minis">
            <div class="mini" style="--i:13">
              <span class="mini-icon"><lucide-icon [img]="Megaphone" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Campañas enviadas</span>
              <strong><app-count-up [value]="d.marketing.campaigns.sent" /></strong>
              <span class="muted">{{ num(d.marketing.campaigns.recipients) }} destinatarios</span>
            </div>
            <div class="mini" style="--i:14">
              <span class="mini-icon"><lucide-icon [img]="HeartPulse" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Mensajes de recuperación</span>
              <strong><app-count-up [value]="d.marketing.recovery.sent" /></strong>
              <span class="muted" [class.warn]="d.marketing.recovery.failed > 0">{{ d.marketing.recovery.failed }} fallidos</span>
            </div>
            <div class="mini" style="--i:15">
              <span class="mini-icon"><lucide-icon [img]="FileText" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Envíos de formularios</span>
              <strong><app-count-up [value]="d.marketing.forms.submissions" /></strong>
              <span class="muted">{{ d.marketing.forms.top[0]?.label || 'Sin envíos' }}</span>
            </div>
            <div class="mini" style="--i:16">
              <span class="mini-icon"><lucide-icon [img]="CalendarCheck" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Asistentes a eventos</span>
              <strong><app-count-up [value]="d.marketing.events.attendees" /></strong>
              <span class="muted">{{ d.marketing.events.checkedIn }} ingresaron · {{ d.marketing.events.registrations }} registros</span>
            </div>
            <div class="mini" style="--i:17">
              <span class="mini-icon"><lucide-icon [img]="Telescope" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Empresas prospectadas</span>
              <strong><app-count-up [value]="d.prospecting.found" /></strong>
              <span class="muted">{{ d.prospecting.converted }} convertidas</span>
            </div>
            <div class="mini" style="--i:18">
              <span class="mini-icon"><lucide-icon [img]="ShieldBan" [size]="18" [strokeWidth]="2.4" /></span>
              <span class="mini-label">Bajas (no contactar)</span>
              <strong><app-count-up [value]="d.marketing.suppression.added" /></strong>
              <span class="muted">en el periodo</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
    .page-title { font-family: var(--font-heading); font-size: 28px; font-weight: 700; margin: 0 0 4px; }
    .page-subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seg { display: inline-flex; background: var(--color-white); border-radius: var(--radius-pill); padding: 4px; box-shadow: var(--shadow-sm); }
    .seg button { border: 0; background: transparent; padding: 8px 14px; border-radius: var(--radius-pill); font: 600 13px var(--font-base);
      color: var(--color-text-muted); cursor: pointer; transition: all var(--transition-fast); white-space: nowrap; }
    .seg button:hover { color: var(--color-text-main); }
    .seg button.on { background: var(--color-text-main); color: var(--color-white); box-shadow: var(--shadow-md); }
    .channel { width: auto; min-width: 180px; background-color: var(--color-white); box-shadow: var(--shadow-sm); border-color: transparent; }
    .refresh.spin lucide-icon { animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .content { transition: opacity var(--transition-smooth); }
    .content.stale { opacity: 0.55; pointer-events: none; }

    .alerts { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    .alert { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: var(--radius-pill);
      font-size: 13px; text-decoration: none; color: var(--color-text-main); background: var(--color-white); box-shadow: var(--shadow-sm);
      transition: transform var(--transition-fast); animation: fadeInUp 0.5s var(--transition-smooth) backwards; }
    a.alert[href]:hover { transform: translateY(-2px); }
    .alert.warn lucide-icon { color: var(--color-warning); }
    .alert.info lucide-icon { color: var(--chart-1); }
    .alert.hot lucide-icon { color: var(--color-brand); }

    .top { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; margin-bottom: 20px; }
    .hero { position: relative; overflow: hidden; border-radius: var(--radius-lg); padding: 28px 28px 0; color: var(--color-white);
      background: linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-hover) 55%, var(--color-ai) 130%);
      box-shadow: var(--shadow-brand); display: flex; flex-direction: column; min-height: 220px; animation: fadeInUp 0.6s var(--transition-smooth) backwards; }
    .orb { position: absolute; border-radius: 50%; background: color-mix(in srgb, var(--color-white) 12%, transparent); pointer-events: none; animation: float 9s ease-in-out infinite; }
    .o1 { width: 220px; height: 220px; right: -60px; top: -80px; }
    .o2 { width: 120px; height: 120px; right: 140px; bottom: -50px; animation-delay: -4s; }
    @keyframes float { 50% { transform: translate(-14px, 12px) scale(1.06); } }
    .hero-label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; opacity: 0.9; }
    .hero-value { font-family: var(--font-heading); font-size: clamp(34px, 4.4vw, 50px); font-weight: 700; letter-spacing: -0.02em; margin: 6px 0 10px; }
    .hero-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 13px; opacity: 0.95; }
    .hero-spark { margin: auto -28px 0; height: 64px; opacity: 0.9; }

    .card-flat { background: var(--color-white); border-radius: var(--radius-lg); padding: 24px 28px; box-shadow: var(--shadow-sm); }
    .pipe { display: flex; align-items: center; justify-content: space-between; gap: 20px; animation: fadeInUp 0.6s var(--transition-smooth) 0.08s backwards; }
    .eyebrow { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .big { display: block; font-family: var(--font-heading); font-size: 32px; margin: 4px 0 12px; }
    dl { margin: 0; display: flex; flex-direction: column; gap: 6px; }
    dl div { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
    dt { color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 6px; }
    dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    dd.warn, .muted.warn { color: var(--color-error); }
    .link { display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; font-size: 13px; font-weight: 600; color: var(--color-brand); text-decoration: none; }

    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600;
      background: var(--color-bg-light); color: var(--color-text-muted); }
    .pill.up { background: color-mix(in srgb, var(--color-success) 14%, transparent); color: var(--color-success); }
    .pill.down { background: color-mix(in srgb, var(--color-error) 12%, transparent); color: var(--color-error); }
    .pill.light { background: color-mix(in srgb, var(--color-white) 22%, transparent); color: var(--color-white); }

    .tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; margin-bottom: 8px; }
    .tile { display: flex; flex-direction: column; gap: 8px; background: var(--color-white); border-radius: var(--radius-lg); padding: 18px 18px 12px;
      box-shadow: var(--shadow-sm); text-decoration: none; color: inherit; min-width: 0;
      transition: transform var(--transition-smooth), box-shadow var(--transition-smooth);
      animation: fadeInUp 0.6s var(--transition-smooth) backwards; animation-delay: calc(var(--i) * 50ms + 0.12s); }
    a.tile[href]:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .tile-head { display: flex; align-items: center; gap: 8px; }
    .tile-icon { width: 32px; height: 32px; border-radius: 10px; background: var(--color-bg-light); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .tile-label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); line-height: 1.2; }
    .tile-value { font-family: var(--font-heading); font-size: 26px; font-weight: 700; }
    .tile-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .muted { font-size: 12px; color: var(--color-text-muted); }

    .section { font-family: var(--font-heading); font-size: 19px; font-weight: 600; margin: 32px 0 16px; display: flex; align-items: baseline; gap: 10px; }
    .section small { font: 500 12px var(--font-base); color: var(--color-text-muted); }
    .grid { display: grid; gap: 20px; margin-bottom: 20px; }
    .g-21 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    .g-11 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .g-111 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

    .speed { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .speed .stats { width: 100%; }

    .minis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
    .mini { display: flex; flex-direction: column; gap: 4px; background: var(--color-white); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow-sm);
      animation: fadeInUp 0.6s var(--transition-smooth) backwards; animation-delay: calc(var(--i) * 40ms); min-width: 0; }
    .mini-icon { color: var(--chart-1); margin-bottom: 4px; }
    .mini-label { font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
    .mini strong { font-family: var(--font-heading); font-size: 24px; }
    .mini .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .skeleton { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
    .sk { height: 150px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-light), var(--color-white), var(--color-bg-light));
      background-size: 200% 100%; animation: shimmer 1.3s ease-in-out infinite; }
    .sk-hero { grid-column: span 3; height: 220px; }
    .sk-wide { grid-column: span 4; height: 320px; }
    .sk-tall { grid-column: span 2; height: 320px; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    .empty-state { text-align: center; }

    @media (max-width: 1280px) {
      .tiles, .minis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 1100px) {
      .g-21, .g-111 { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 900px) {
      .top, .g-11 { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .filters { width: 100%; }
      .seg { flex: 1 1 100%; overflow-x: auto; }
      .seg button { flex: 1; padding: 8px 10px; }
      .channel { flex: 1; min-width: 0; }
      .tiles, .minis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .pipe { flex-direction: column-reverse; align-items: stretch; }
      .pipe app-ring { align-self: center; }
      .tile-value { font-size: 22px; }
      .skeleton { grid-template-columns: repeat(2, 1fr); }
      .sk-hero, .sk-wide, .sk-tall { grid-column: span 2; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hero, .pipe, .tile, .mini, .alert, .orb, .sk, .refresh.spin lucide-icon { animation: none; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private permissions = inject(PermissionsService);

  readonly TriangleAlert = TriangleAlert; readonly Inbox = Inbox; readonly Flame = Flame;
  readonly RefreshCw = RefreshCw; readonly Wallet = Wallet; readonly ArrowUpRight = ArrowUpRight;
  readonly Timer = Timer; readonly Megaphone = Megaphone; readonly HeartPulse = HeartPulse;
  readonly FileText = FileText; readonly CalendarCheck = CalendarCheck; readonly Telescope = Telescope;
  readonly ShieldBan = ShieldBan; readonly Tag = Tag;

  readonly tiles = TILES;
  readonly ranges: { key: AnalyticsRange; label: string }[] = [
    { key: '7d', label: '7 días' }, { key: '30d', label: '30 días' },
    { key: '90d', label: '90 días' }, { key: '12m', label: '12 meses' },
  ];
  readonly channels: { key: AnalyticsChannel; label: string }[] = [
    { key: '', label: 'Todos los canales' }, { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'instagram', label: 'Instagram' }, { key: 'messenger', label: 'Messenger' },
    { key: 'email', label: 'Correo' },
  ];

  data = signal<DashboardAnalytics | null>(null);
  loading = signal(true);
  error = signal('');
  range = signal<AnalyticsRange>('30d');
  channel = signal<AnalyticsChannel>('');
  private requestId = 0;

  firstName = computed(() => {
    const u = this.auth.currentUser();
    return (u?.name || u?.email || '').split(' ')[0].split('@')[0];
  });

  periodText = computed(() => ({
    '7d': 'en los últimos 7 días', '30d': 'en los últimos 30 días',
    '90d': 'en los últimos 90 días', '12m': 'en los últimos 12 meses',
  })[this.range()]);

  channelText = computed(() => {
    const c = this.channels.find((x) => x.key === this.channel());
    return this.channel() && c ? ` en ${c.label}` : '';
  });

  bucketWord = computed(() => (this.data()?.range.bucket === 'month' ? 'mes' : 'día'));

  activitySeries = computed<VizSeries[]>(() => {
    const a = this.data()?.activity;
    if (!a) return [];
    return [
      { name: 'Recibidos', color: 'var(--chart-1)', data: a.inbound },
      { name: 'Respondidos por IA', color: 'var(--chart-2)', data: a.ai },
      { name: 'Respondidos por personas', color: 'var(--chart-3)', data: a.human },
    ];
  });

  outcomeSeries = computed<VizSeries[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { name: 'Ganadas', color: 'var(--chart-1)', data: d.kpis.wonDeals.series },
      { name: 'Perdidas', color: 'var(--chart-3)', data: d.outcomes.lostSeries },
    ];
  });

  wonSeries = computed<VizSeries[]>(() => {
    const d = this.data();
    return d ? [{ name: 'Ingresos ganados', color: 'var(--chart-1)', data: d.kpis.wonValue.series }] : [];
  });

  funnelSteps = computed(() =>
    (this.data()?.funnel ?? []).map((f) => ({ label: f.label, count: f.count, value: f.value ?? 0 })));

  prospectSteps = computed(() => {
    const p = this.data()?.prospecting;
    if (!p) return [];
    return [
      { label: 'Encontradas', count: p.found },
      { label: 'Investigadas', count: p.researched },
      { label: 'Con material', count: p.withMaterial },
      { label: 'Contactadas', count: p.contacted },
      { label: 'Convertidas', count: p.converted },
    ];
  });

  agentItems = computed<VizItem[]>(() => (this.data()?.agents ?? []).map((a) => ({
    label: a.name,
    value: a.replies,
    sub: `${a.conversations} conv. · ${a.handoffs} deriv.`,
  })));

  activityTable = computed<VizTable | null>(() => {
    const d = this.data();
    if (!d) return null;
    return {
      head: ['Fecha', 'Recibidos', 'IA', 'Personas'],
      rows: d.range.buckets.map((b, i) => [bucketLabel(b, true), d.activity.inbound[i], d.activity.ai[i], d.activity.human[i]]),
    };
  });

  heatTable = computed<VizTable | null>(() => {
    const d = this.data();
    if (!d) return null;
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    return {
      head: ['Día', ...Array.from({ length: 24 }, (_, h) => `${h} h`)],
      rows: d.heatmap.map((row, i) => [days[i], ...row]),
    };
  });

  agentsTable = computed<VizTable | null>(() => {
    const d = this.data();
    if (!d?.agents.length) return null;
    return {
      head: ['Agente', 'Respuestas', 'Conversaciones', 'Derivaciones'],
      rows: d.agents.map((a) => [a.name, a.replies, a.conversations, a.handoffs]),
    };
  });

  funnelTable = computed<VizTable | null>(() => {
    const d = this.data();
    if (!d) return null;
    return {
      head: ['Etapa', 'Oportunidades', 'Valor', 'Probabilidad'],
      rows: d.funnel.map((f) => [f.label, f.count, this.money(f.value ?? 0), `${f.probability}%`]),
    };
  });

  outcomeTable = computed<VizTable | null>(() => {
    const d = this.data();
    if (!d) return null;
    return {
      head: ['Fecha', 'Ganadas', 'Perdidas', 'Valor ganado'],
      rows: d.range.buckets.map((b, i) => [
        bucketLabel(b, true), d.kpis.wonDeals.series[i], d.outcomes.lostSeries[i] ?? 0, this.money(d.kpis.wonValue.series[i]),
      ]),
    };
  });

  ngOnInit() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
      if (this.ranges.some((r) => r.key === saved.range)) this.range.set(saved.range);
      if (this.channels.some((c) => c.key === saved.channel)) this.channel.set(saved.channel);
    } catch { /* preferencias opcionales */ }
    this.load();
  }

  setRange(r: AnalyticsRange) {
    if (r === this.range()) return;
    this.range.set(r);
    this.saveAndLoad();
  }

  setChannel(c: AnalyticsChannel) {
    this.channel.set(c);
    this.saveAndLoad();
  }

  private saveAndLoad() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ range: this.range(), channel: this.channel() }));
    } catch { /* sin almacenamiento */ }
    this.load();
  }

  load() {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    const params: Record<string, string> = { range: this.range(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (this.channel()) params['channel'] = this.channel();
    this.http.get<DashboardAnalytics>(`${API}/dashboard/analytics`, { params }).subscribe({
      next: (d) => {
        if (id !== this.requestId) return;
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        if (id !== this.requestId) return;
        this.error.set(err?.error?.message || 'No se pudo cargar el resumen');
        this.loading.set(false);
      },
    });
  }

  can(module: string): boolean { return this.permissions.can(module); }

  saludo(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    return h < 20 ? 'Buenas tardes' : 'Buenas noches';
  }

  items(list: Breakdown[], total?: number): VizItem[] {
    return list.map((b) => ({
      label: b.label,
      value: b.count,
      sub: total ? `${Math.round((b.count / total) * 100)}%` : undefined,
    }));
  }

  trendIcon(delta: number | null) {
    if (!delta) return Minus;
    return delta > 0 ? TrendingUp : TrendingDown;
  }

  deltaText(delta: number | null): string {
    if (delta === null) return 'Sin datos previos';
    return `${delta > 0 ? '+' : ''}${delta}%`;
  }

  fmt(v: number, f: VizFormat) { return formatValue(v, f); }
  money(v: number) { return formatValue(v, 'money'); }
  num(v: number) { return formatValue(v); }
  minutes(m: number | null) { return formatMinutes(m); }
}

