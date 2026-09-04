import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideAngularModule, Plus, X, Trash2, Search, Target, TrendingUp, Trophy, CalendarClock,
  AlertTriangle, User, Phone, Mail, MessageSquare, StickyNote, PhoneCall, Users, CheckCircle2,
  Circle, Clock, LayoutGrid, List as ListIcon, Filter, ArrowRight, Coins, Pencil,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

interface Stage {
  key: string;
  label: string;
  order: number;
  color: string;
  probability: number;
  outcome?: 'won' | 'lost';
}

interface CustomerRef {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

interface OwnerRef {
  _id: string;
  name?: string;
  email: string;
}

interface Lead {
  _id: string;
  customerId: CustomerRef | string;
  title: string;
  description?: string;
  stage: string;
  status: 'open' | 'won' | 'lost';
  value: number;
  currency: string;
  priority: 'low' | 'medium' | 'high';
  ownerId?: OwnerRef | string;
  source: string;
  conversationId?: string;
  tags: string[];
  expectedCloseDate?: string;
  closedAt?: string;
  lostReason?: string;
  lastActivityAt: string;
  nextActionAt?: string;
  nextActionTitle?: string;
}

interface Column {
  stage: string;
  label: string;
  color: string;
  count: number;
  value: number;
  leads: Lead[];
}

interface Stats {
  open: number;
  openValue: number;
  weightedValue: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  lostThisMonth: number;
  conversionRate: number;
  overdueTasks: number;
  dueTodayTasks: number;
}

interface Activity {
  _id: string;
  type: string;
  title: string;
  body?: string;
  at: string;
  dueAt?: string;
  done: boolean;
  createdBy?: OwnerRef | string;
}

interface Owner {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface CustomerOption {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  note: 'Nota', call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email',
  meeting: 'Reunión', task: 'Tarea', stage_change: 'Cambio de etapa', system: 'Sistema',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', medium: 'Media', high: 'Alta',
};

interface LeadForm {
  _id: string;
  title: string;
  description: string;
  stage: string;
  value: number;
  priority: 'low' | 'medium' | 'high';
  ownerId: string;
  tags: string[];
  expectedCloseDate: string;
  lostReason: string;
  customerId: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newCustomerEmail: string;
}

function blankForm(stage: string): LeadForm {
  return {
    _id: '', title: '', description: '', stage, value: 0, priority: 'medium',
    ownerId: '', tags: [], expectedCloseDate: '', lostReason: '',
    customerId: '', newCustomerName: '', newCustomerPhone: '', newCustomerEmail: '',
  };
}

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Seguimiento</h1>
          <p class="page-sub">Tu embudo de oportunidades: en qué etapa está cada cliente y qué toca hacer después</p>
        </div>
        <div class="header-actions">
          <div class="view-toggle">
            <button class="view-btn" [class.active]="view() === 'board'" (click)="view.set('board')" title="Tablero">
              <lucide-icon [img]="LayoutGrid" [size]="15" [strokeWidth]="2.5"></lucide-icon>
            </button>
            <button class="view-btn" [class.active]="view() === 'list'" (click)="view.set('list')" title="Lista">
              <lucide-icon [img]="ListIcon" [size]="15" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <button class="btn btn-primary" (click)="openNew()">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Nueva oportunidad
          </button>
        </div>
      </div>

      <!-- ── KPIs ── -->
      @if (stats(); as s) {
        <div class="kpis">
          <div class="kpi card">
            <span class="kpi-icon" style="background:#EEF2FF;color:#6366F1">
              <lucide-icon [img]="Target" [size]="17" [strokeWidth]="2.4"></lucide-icon>
            </span>
            <div>
              <span class="kpi-value">{{ s.open }}</span>
              <span class="kpi-label">Oportunidades abiertas</span>
            </div>
          </div>
          <div class="kpi card">
            <span class="kpi-icon" style="background:#ECFDF5;color:#10B981">
              <lucide-icon [img]="Coins" [size]="17" [strokeWidth]="2.4"></lucide-icon>
            </span>
            <div>
              <span class="kpi-value">{{ money(s.openValue) }}</span>
              <span class="kpi-label">En el embudo · {{ money(s.weightedValue) }} ponderado</span>
            </div>
          </div>
          <div class="kpi card">
            <span class="kpi-icon" style="background:#FEF3C7;color:#D97706">
              <lucide-icon [img]="Trophy" [size]="17" [strokeWidth]="2.4"></lucide-icon>
            </span>
            <div>
              <span class="kpi-value">{{ money(s.wonValueThisMonth) }}</span>
              <span class="kpi-label">Ganado este mes ({{ s.wonThisMonth }})</span>
            </div>
          </div>
          <div class="kpi card">
            <span class="kpi-icon" style="background:#F5F3FF;color:#8B5CF6">
              <lucide-icon [img]="TrendingUp" [size]="17" [strokeWidth]="2.4"></lucide-icon>
            </span>
            <div>
              <span class="kpi-value">{{ s.conversionRate }}%</span>
              <span class="kpi-label">Tasa de conversión</span>
            </div>
          </div>
          <button class="kpi card kpi-action" [class.alert]="s.overdueTasks > 0" (click)="toggleOverdue()">
            <span class="kpi-icon" [style.background]="s.overdueTasks ? '#FEE2E2' : '#F1F5F9'" [style.color]="s.overdueTasks ? '#EF4444' : '#64748B'">
              <lucide-icon [img]="AlertTriangle" [size]="17" [strokeWidth]="2.4"></lucide-icon>
            </span>
            <div>
              <span class="kpi-value">{{ s.overdueTasks }}</span>
              <span class="kpi-label">Tareas vencidas · {{ s.dueTodayTasks }} hoy</span>
            </div>
          </button>
        </div>
      }

      <!-- ── Filtros ── -->
      <div class="toolbar card">
        <div class="search-box">
          <lucide-icon [img]="Search" [size]="16" [strokeWidth]="2.4"></lucide-icon>
          <input class="search-input" [ngModel]="search()" (ngModelChange)="onSearch($event)"
            placeholder="Buscar por oportunidad o cliente…" />
          @if (search()) {
            <button class="btn-icon btn-ghost" (click)="onSearch('')" aria-label="Limpiar">
              <lucide-icon [img]="X" [size]="15" [strokeWidth]="2.5"></lucide-icon>
            </button>
          }
        </div>
        <select class="select toolbar-select" [ngModel]="ownerFilter()" (ngModelChange)="setOwner($event)">
          <option value="">Todos los responsables</option>
          @for (o of owners(); track o._id) {
            <option [value]="o._id">{{ o.name }}</option>
          }
        </select>
        <button class="btn btn-sm" [class.btn-primary]="overdue()" [class.btn-secondary]="!overdue()" (click)="toggleOverdue()">
          <lucide-icon [img]="Filter" [size]="14" [strokeWidth]="2.5"></lucide-icon>
          Con tarea vencida
        </button>
      </div>

      @if (loading()) {
        <div class="board">
          @for (i of [1,2,3,4]; track i) { <div class="skeleton-col"></div> }
        </div>
      } @else if (view() === 'board') {
        <!-- ── Tablero ── -->
        <div class="board">
          @for (col of columns(); track col.stage) {
            <section class="column" [class.drop-target]="dragOverStage() === col.stage"
              (dragover)="onDragOver($event, col.stage)" (dragleave)="onDragLeave(col.stage)" (drop)="onDrop($event, col.stage)">
              <header class="col-head">
                <span class="col-dot" [style.background]="col.color"></span>
                <span class="col-title">{{ col.label }}</span>
                <span class="col-count">{{ col.count }}</span>
              </header>
              <span class="col-total">{{ money(col.value) }}</span>

              <div class="col-body">
                @for (lead of col.leads; track lead._id) {
                  <article class="lead-card" draggable="true"
                    (dragstart)="onDragStart(lead)" (dragend)="onDragEnd()"
                    (click)="openDetail(lead)">
                    <div class="lead-top">
                      <span class="prio" [attr.data-p]="lead.priority" [title]="'Prioridad ' + priorityLabel(lead.priority)"></span>
                      <h4>{{ lead.title }}</h4>
                    </div>
                    <span class="lead-customer">
                      <lucide-icon [img]="User" [size]="12" [strokeWidth]="2.4"></lucide-icon>
                      {{ customerName(lead) }}
                    </span>
                    @if (lead.value > 0) {
                      <span class="lead-value">{{ money(lead.value) }}</span>
                    }
                    @if (lead.nextActionAt) {
                      <span class="next-action" [class.overdue]="isOverdue(lead.nextActionAt)">
                        <lucide-icon [img]="Clock" [size]="11" [strokeWidth]="2.4"></lucide-icon>
                        {{ lead.nextActionTitle }} · {{ shortDate(lead.nextActionAt) }}
                      </span>
                    }
                    <div class="lead-foot">
                      @if (lead.tags.length) {
                        <span class="tag">{{ lead.tags[0] }}</span>
                        @if (lead.tags.length > 1) { <span class="tag">+{{ lead.tags.length - 1 }}</span> }
                      }
                      <span class="owner" [title]="ownerName(lead)">{{ ownerInitials(lead) }}</span>
                    </div>
                  </article>
                }
                @if (col.leads.length === 0) {
                  <p class="col-empty">Arrastra una tarjeta aquí</p>
                }
              </div>
            </section>
          }
        </div>
      } @else {
        <!-- ── Lista ── -->
        <div class="table-wrap table-cards card">
          <table>
            <thead>
              <tr>
                <th>Oportunidad</th><th>Cliente</th><th>Etapa</th><th>Valor</th>
                <th>Responsable</th><th>Próximo paso</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (lead of allLeads(); track lead._id) {
                <tr (click)="openDetail(lead)">
                  <td>
                    <strong>{{ lead.title }}</strong>
                    <span class="prio-inline" [attr.data-p]="lead.priority">{{ priorityLabel(lead.priority) }}</span>
                  </td>
                  <td data-label="Cliente">{{ customerName(lead) }}</td>
                  <td data-label="Etapa"><span class="badge" [style.background]="stageColor(lead.stage) + '1A'" [style.color]="stageColor(lead.stage)">{{ stageLabel(lead.stage) }}</span></td>
                  <td data-label="Valor">{{ money(lead.value) }}</td>
                  <td data-label="Responsable">{{ ownerName(lead) }}</td>
                  <td data-label="Próximo paso">
                    @if (lead.nextActionAt) {
                      <span [class.overdue-text]="isOverdue(lead.nextActionAt)">
                        {{ lead.nextActionTitle }} · {{ shortDate(lead.nextActionAt) }}
                      </span>
                    } @else { <span class="muted">Sin tarea</span> }
                  </td>
                  <td class="right">
                    <lucide-icon [img]="ArrowRight" [size]="15" [strokeWidth]="2.4"></lucide-icon>
                  </td>
                </tr>
              }
              @if (allLeads().length === 0) {
                <tr><td colspan="7" class="empty-row">No hay oportunidades con estos filtros.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- ───────── Ficha de la oportunidad ───────── -->
    @if (detail(); as lead) {
      <div class="overlay" (click)="closeDetail()" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2>{{ lead.title }}</h2>
              <p class="subtitle">
                {{ customerName(lead) }}
                @if (customerPhone(lead)) { · {{ customerPhone(lead) }} }
              </p>
            </div>
            <div class="header-right">
              <button class="btn btn-sm btn-secondary" (click)="editDetail()">
                <lucide-icon [img]="Pencil" [size]="14" [strokeWidth]="2.5"></lucide-icon> Editar
              </button>
              <button class="btn btn-ghost btn-icon" (click)="closeDetail()" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
              </button>
            </div>
          </div>

          <div class="drawer-scroll">
            <div class="stage-picker">
              @for (s of stages(); track s.key) {
                <button class="stage-chip" [class.active]="lead.stage === s.key"
                  [style.--chip]="s.color" (click)="moveTo(lead, s.key)">
                  {{ s.label }}
                </button>
              }
            </div>

            <div class="facts">
              <div class="fact">
                <span class="fact-label">Valor</span>
                <strong>{{ money(lead.value) }}</strong>
              </div>
              <div class="fact">
                <span class="fact-label">Prioridad</span>
                <strong>{{ priorityLabel(lead.priority) }}</strong>
              </div>
              <div class="fact">
                <span class="fact-label">Responsable</span>
                <strong>{{ ownerName(lead) }}</strong>
              </div>
              <div class="fact">
                <span class="fact-label">Cierre estimado</span>
                <strong>{{ lead.expectedCloseDate ? shortDate(lead.expectedCloseDate) : '—' }}</strong>
              </div>
              <div class="fact">
                <span class="fact-label">Origen</span>
                <strong>{{ lead.source }}</strong>
              </div>
              <div class="fact">
                <span class="fact-label">Última actividad</span>
                <strong>{{ shortDate(lead.lastActivityAt) }}</strong>
              </div>
            </div>

            @if (lead.description) {
              <p class="description">{{ lead.description }}</p>
            }
            @if (lead.lostReason) {
              <p class="lost-note">Motivo de la pérdida: {{ lead.lostReason }}</p>
            }

            <div class="contact-actions">
              @if (customerPhone(lead)) {
                <a class="btn btn-sm btn-secondary" [href]="waLink(lead)" target="_blank" rel="noopener">
                  <lucide-icon [img]="MessageSquare" [size]="14" [strokeWidth]="2.5"></lucide-icon> WhatsApp
                </a>
              }
              @if (customerEmail(lead)) {
                <a class="btn btn-sm btn-secondary" [href]="'mailto:' + customerEmail(lead)">
                  <lucide-icon [img]="Mail" [size]="14" [strokeWidth]="2.5"></lucide-icon> Email
                </a>
              }
              @if (lead.conversationId) {
                <button class="btn btn-sm btn-secondary" (click)="goToChat(lead)">
                  <lucide-icon [img]="MessageSquare" [size]="14" [strokeWidth]="2.5"></lucide-icon> Ver conversación
                </button>
              }
              <button class="btn btn-sm btn-ghost danger" (click)="removeLead(lead)">
                <lucide-icon [img]="Trash2" [size]="14" [strokeWidth]="2.5"></lucide-icon> Eliminar
              </button>
            </div>

            <!-- Registrar actividad -->
            <div class="activity-form">
              <div class="type-row">
                @for (t of activityTypes; track t.key) {
                  <button class="type-btn" [class.active]="newActivity.type === t.key" (click)="newActivity.type = t.key">
                    <lucide-icon [img]="t.icon" [size]="13" [strokeWidth]="2.5"></lucide-icon> {{ t.label }}
                  </button>
                }
              </div>
              <input class="input" [(ngModel)]="newActivity.title"
                [placeholder]="newActivity.type === 'task' ? 'Qué hay que hacer…' : 'Qué pasó…'"
                (keydown.enter)="addActivity()" />
              <textarea class="textarea" [(ngModel)]="newActivity.body" rows="2" placeholder="Detalle (opcional)"></textarea>
              @if (newActivity.type === 'task') {
                <div class="field">
                  <label class="field-label">Vence</label>
                  <input class="input" type="datetime-local" [(ngModel)]="newActivity.dueAt" />
                </div>
              }
              <button class="btn btn-primary btn-sm" [disabled]="savingActivity()" (click)="addActivity()">
                {{ savingActivity() ? 'Guardando…' : 'Registrar' }}
              </button>
            </div>

            <!-- Historial -->
            <h3 class="timeline-title">Historial</h3>
            @if (activities().length === 0) {
              <p class="muted">Todavía no hay actividad registrada.</p>
            }
            <ul class="timeline">
              @for (a of activities(); track a._id) {
                <li class="tl-item" [class.is-task]="a.type === 'task'" [class.done]="a.done">
                  <span class="tl-dot" [attr.data-type]="a.type"></span>
                  <div class="tl-body">
                    <div class="tl-head">
                      <span class="tl-type">{{ activityLabel(a.type) }}</span>
                      <span class="tl-at">{{ shortDate(a.at) }}</span>
                      @if (a.type === 'task') {
                        <button class="tl-check" (click)="toggleTask(a)" [attr.aria-label]="a.done ? 'Reabrir tarea' : 'Completar tarea'">
                          <lucide-icon [img]="a.done ? CheckCircle2 : Circle" [size]="15" [strokeWidth]="2.4"></lucide-icon>
                        </button>
                      }
                      @if (a.type !== 'stage_change' && a.type !== 'system') {
                        <button class="tl-del" (click)="removeActivity(a)" aria-label="Eliminar">
                          <lucide-icon [img]="Trash2" [size]="13" [strokeWidth]="2.4"></lucide-icon>
                        </button>
                      }
                    </div>
                    <p class="tl-text">{{ a.title }}</p>
                    @if (a.body) { <p class="tl-note">{{ a.body }}</p> }
                    @if (a.dueAt) {
                      <span class="tl-due" [class.overdue-text]="!a.done && isOverdue(a.dueAt)">
                        Vence {{ shortDate(a.dueAt) }}
                      </span>
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        </aside>
      </div>
    }

    <!-- ───────── Alta / edición ───────── -->
    @if (formOpen()) {
      <div class="overlay" (click)="closeForm()" role="dialog" aria-modal="true">
        <div class="modal card" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2>{{ form._id ? 'Editar oportunidad' : 'Nueva oportunidad' }}</h2>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="modal-body">
            <div class="field">
              <label class="field-label">Título *</label>
              <input class="input" [(ngModel)]="form.title" placeholder="Ej: Evento corporativo de fin de año" />
            </div>

            @if (!form._id) {
              <div class="field">
                <label class="field-label">Cliente *</label>
                <input class="input" [ngModel]="customerQuery()" (ngModelChange)="onCustomerSearch($event)"
                  placeholder="Busca un contacto o escribe un nombre nuevo" />
                @if (customerOptions().length > 0 && !form.customerId) {
                  <div class="options">
                    @for (c of customerOptions(); track c._id) {
                      <button class="option" (click)="pickCustomer(c)">
                        <strong>{{ c.name }}</strong>
                        <span>{{ c.phone || c.email || 'Sin contacto' }}</span>
                      </button>
                    }
                  </div>
                }
                @if (form.customerId) {
                  <span class="picked">
                    <lucide-icon [img]="User" [size]="13" [strokeWidth]="2.4"></lucide-icon>
                    {{ form.newCustomerName }}
                    <button class="chip-x" (click)="clearCustomer()" aria-label="Quitar"><lucide-icon [img]="X" [size]="12" [strokeWidth]="2.6"></lucide-icon></button>
                  </span>
                } @else if (customerQuery().trim()) {
                  <div class="field-row">
                    <div class="field">
                      <label class="field-label">Teléfono del nuevo contacto</label>
                      <input class="input" [(ngModel)]="form.newCustomerPhone" placeholder="51999888777" />
                    </div>
                    <div class="field">
                      <label class="field-label">Email</label>
                      <input class="input" [(ngModel)]="form.newCustomerEmail" placeholder="cliente@correo.com" />
                    </div>
                  </div>
                }
              </div>
            }

            <div class="field-row">
              <div class="field">
                <label class="field-label">Etapa</label>
                <select class="select" [(ngModel)]="form.stage">
                  @for (s of stages(); track s.key) { <option [value]="s.key">{{ s.label }}</option> }
                </select>
              </div>
              <div class="field">
                <label class="field-label">Valor estimado</label>
                <input class="input" type="number" min="0" [(ngModel)]="form.value" />
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label class="field-label">Prioridad</label>
                <select class="select" [(ngModel)]="form.priority">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label">Responsable</label>
                <select class="select" [(ngModel)]="form.ownerId">
                  <option value="">Sin asignar</option>
                  @for (o of owners(); track o._id) { <option [value]="o._id">{{ o.name }}</option> }
                </select>
              </div>
            </div>

            <div class="field">
              <label class="field-label">Cierre estimado</label>
              <input class="input" type="date" [(ngModel)]="form.expectedCloseDate" />
            </div>

            <div class="field">
              <label class="field-label">Notas</label>
              <textarea class="textarea" [(ngModel)]="form.description" rows="3" placeholder="Contexto de la oportunidad…"></textarea>
            </div>

            @if (form._id && form.stage === 'lost') {
              <div class="field">
                <label class="field-label">Motivo de la pérdida</label>
                <input class="input" [(ngModel)]="form.lostReason" placeholder="Precio, tiempos, competencia…" />
              </div>
            }
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeForm()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
              {{ saving() ? 'Guardando…' : (form._id ? 'Guardar cambios' : 'Crear oportunidad') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 26px; }
    .page-sub { margin: 0; color: var(--color-text-muted); font-size: 13.5px; }
    .header-actions { display: flex; align-items: center; gap: 10px; }

    .view-toggle { display: inline-flex; background: var(--color-bg-light); border: 1px solid var(--color-border); border-radius: var(--radius-pill); padding: 3px; }
    .view-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 30px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--color-text-muted); cursor: pointer; transition: all var(--transition-fast); }
    .view-btn.active { background: var(--color-white); color: var(--color-brand); box-shadow: var(--shadow-sm); }

    /* KPIs */
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .kpi { display: flex; align-items: center; gap: 14px; padding: 18px 20px; text-align: left; }
    .kpi-action { border: 1px solid var(--color-border); cursor: pointer; font: inherit; }
    .kpi-action.alert { border-color: rgba(239,68,68,.4); }
    .kpi-icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: var(--radius-pill); flex-shrink: 0; }
    .kpi-value { display: block; font-family: var(--font-heading); font-size: 20px; font-weight: 700; line-height: 1.2; }
    .kpi-label { display: block; font-size: 11.5px; color: var(--color-text-muted); margin-top: 2px; }

    /* Toolbar */
    .toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 18px; flex-wrap: wrap; }
    .search-box { display: flex; align-items: center; gap: 8px; flex: 1 1 240px; padding: 0 14px; background: var(--color-bg-light); border-radius: var(--radius-pill); color: var(--color-text-muted); }
    .search-input { flex: 1; border: 0; background: transparent; padding: 10px 0; font: inherit; font-size: 13.5px; outline: none; color: var(--color-text-main); }
    .toolbar-select { max-width: 220px; }

    /* Tablero */
    .board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 12px; align-items: flex-start; }
    .column { flex: 0 0 268px; background: var(--color-bg-light); border: 1.5px solid transparent; border-radius: var(--radius-lg); padding: 14px; transition: all var(--transition-fast); }
    .column.drop-target { border-color: var(--color-brand); background: var(--color-brand-light); }
    .col-head { display: flex; align-items: center; gap: 8px; }
    .col-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .col-title { font-size: 13px; font-weight: 700; }
    .col-count { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--color-text-muted); background: var(--color-white); padding: 2px 9px; border-radius: var(--radius-pill); }
    .col-total { display: block; font-size: 11.5px; color: var(--color-text-muted); margin: 2px 0 12px 17px; }
    .col-body { display: flex; flex-direction: column; gap: 10px; min-height: 60px; }
    .col-empty { margin: 0; padding: 18px 8px; text-align: center; font-size: 11.5px; color: var(--color-text-muted); border: 1.5px dashed var(--color-border); border-radius: var(--radius-md); }

    .lead-card { background: var(--color-white); border-radius: var(--radius-md); padding: 13px 14px; box-shadow: var(--shadow-sm); cursor: pointer; display: flex; flex-direction: column; gap: 7px; transition: all var(--transition-fast); }
    .lead-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .lead-card:active { cursor: grabbing; }
    .lead-top { display: flex; align-items: flex-start; gap: 7px; }
    .lead-top h4 { margin: 0; font-size: 13.5px; font-weight: 650; line-height: 1.35; }
    .prio { width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: var(--color-text-muted); }
    .prio[data-p="high"] { background: var(--color-error); }
    .prio[data-p="medium"] { background: var(--color-warning); }
    .prio[data-p="low"] { background: var(--color-success); }
    .lead-customer { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-text-muted); }
    .lead-value { font-size: 12.5px; font-weight: 700; color: var(--color-success); }
    .next-action { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--color-text-muted); background: var(--color-bg-light); padding: 4px 8px; border-radius: var(--radius-pill); }
    .next-action.overdue { background: #FEE2E2; color: #B91C1C; font-weight: 600; }
    .lead-foot { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .tag { font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--color-brand-light); color: var(--color-brand); }
    .owner { margin-left: auto; width: 24px; height: 24px; border-radius: 50%; background: var(--color-bg-app); color: var(--color-text-muted); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }

    .skeleton-col { flex: 0 0 268px; height: 260px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-light) 25%, #F1F5F9 50%, var(--color-bg-light) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    /* Lista */
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
    td { padding: 14px 16px; font-size: 13.5px; border-bottom: 1px solid var(--color-border); }
    tbody tr { cursor: pointer; transition: background var(--transition-fast); }
    tbody tr:hover { background: var(--color-bg-light); }
    td.right { text-align: right; color: var(--color-text-muted); }
    .empty-row { text-align: center; color: var(--color-text-muted); padding: 32px; }
    .prio-inline { margin-left: 8px; font-size: 10.5px; font-weight: 600; color: var(--color-text-muted); }
    .prio-inline[data-p="high"] { color: var(--color-error); }
    .badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: var(--radius-pill); }
    .muted { color: var(--color-text-muted); }
    .overdue-text { color: #B91C1C; font-weight: 600; }

    /* Overlay / drawer / modal */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .drawer { margin-left: auto; height: 100%; width: min(560px, 100%); background: var(--color-white); display: flex; flex-direction: column; box-shadow: var(--shadow-lg); animation: slideIn var(--transition-spring, 400ms cubic-bezier(0.16,1,0.3,1)); }
    @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
    .drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 28px 16px; border-bottom: 1px solid var(--color-border); }
    .drawer-title-group h2 { margin: 0 0 3px; font-family: var(--font-heading); font-size: 20px; }
    .subtitle { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
    .header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .drawer-scroll { flex: 1; overflow-y: auto; padding: 20px 28px 32px; display: flex; flex-direction: column; gap: 18px; }

    .stage-picker { display: flex; flex-wrap: wrap; gap: 6px; }
    .stage-chip { border: 1.5px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted); font-size: 11.5px; font-weight: 600; padding: 6px 12px; border-radius: var(--radius-pill); cursor: pointer; transition: all var(--transition-fast); }
    .stage-chip:hover { border-color: var(--chip); color: var(--chip); }
    .stage-chip.active { background: var(--chip); border-color: var(--chip); color: #fff; }

    .facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .fact { background: var(--color-bg-light); border-radius: var(--radius-md); padding: 10px 14px; }
    .fact-label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); margin-bottom: 2px; }
    .fact strong { font-size: 13.5px; }
    .description { margin: 0; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; }
    .lost-note { margin: 0; padding: 10px 14px; background: #FEF2F2; color: #B91C1C; border-radius: var(--radius-md); font-size: 12.5px; }
    .contact-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn-ghost.danger { color: var(--color-error); }

    .activity-form { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--color-bg-light); border-radius: var(--radius-lg); }
    .type-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .type-btn { display: inline-flex; align-items: center; gap: 5px; border: 1.5px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted); font-size: 11.5px; font-weight: 600; padding: 6px 11px; border-radius: var(--radius-pill); cursor: pointer; transition: all var(--transition-fast); }
    .type-btn.active { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }

    .timeline-title { margin: 4px 0 0; font-family: var(--font-heading); font-size: 15px; }
    .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .tl-item { display: flex; gap: 12px; }
    .tl-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: var(--color-border); }
    .tl-dot[data-type="task"] { background: var(--color-warning); }
    .tl-dot[data-type="note"] { background: var(--color-ai); }
    .tl-dot[data-type="call"], .tl-dot[data-type="whatsapp"] { background: var(--color-success); }
    .tl-dot[data-type="stage_change"] { background: var(--color-brand); }
    .tl-body { flex: 1; }
    .tl-head { display: flex; align-items: center; gap: 8px; }
    .tl-type { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); }
    .tl-at { font-size: 11px; color: var(--color-text-muted); }
    .tl-check, .tl-del { margin-left: auto; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; display: inline-flex; padding: 2px; }
    .tl-del:hover { color: var(--color-error); }
    .tl-check:hover { color: var(--color-success); }
    .tl-text { margin: 2px 0 0; font-size: 13.5px; line-height: 1.5; }
    .tl-note { margin: 3px 0 0; font-size: 12.5px; color: var(--color-text-muted); white-space: pre-wrap; }
    .tl-due { display: inline-block; margin-top: 4px; font-size: 11px; color: var(--color-text-muted); }
    .tl-item.done .tl-text { text-decoration: line-through; color: var(--color-text-muted); }

    .modal { width: calc(100% - 48px); max-width: 520px; max-height: calc(100vh - 80px); display: flex; flex-direction: column; padding: 0; }
    .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px 12px; }
    .modal-head h2 { margin: 0; font-family: var(--font-heading); font-size: 20px; }
    .modal-body { flex: 1; overflow-y: auto; padding: 8px 28px 16px; display: flex; flex-direction: column; gap: 14px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 28px 24px; border-top: 1px solid var(--color-border); }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; font-weight: 600; color: var(--color-text-main); }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .options { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    .option { display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; border-bottom: 1px solid var(--color-border); background: var(--color-white); padding: 9px 14px; cursor: pointer; text-align: left; font: inherit; }
    .option:last-child { border-bottom: 0; }
    .option:hover { background: var(--color-bg-light); }
    .option strong { font-size: 13px; }
    .option span { font-size: 11.5px; color: var(--color-text-muted); }
    .picked { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 6px 8px 6px 12px; background: var(--color-brand-light); color: var(--color-brand); border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; }
    .chip-x { display: inline-flex; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; }

    @media (max-width: 768px) {
      /* Cada oportunidad es una tarjeta (.table-cards): la flecha de "abrir"
         no aporta nada ahí, la fila entera ya es pulsable. */
      .table-cards td.right { display: none; }
      .table-cards .empty-row { text-align: center; }
    }

    @media (max-width: 720px) {
      .page { padding: 24px 16px; }
      .facts { grid-template-columns: 1fr; }
      .field-row { grid-template-columns: 1fr; }
    }
  `],
})
export class LeadsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);
  private router = inject(Router);

  readonly Plus = Plus; readonly X = X; readonly Trash2 = Trash2; readonly Search = Search;
  readonly Target = Target; readonly TrendingUp = TrendingUp; readonly Trophy = Trophy;
  readonly CalendarClock = CalendarClock; readonly AlertTriangle = AlertTriangle;
  readonly User = User; readonly Phone = Phone; readonly Mail = Mail;
  readonly MessageSquare = MessageSquare; readonly CheckCircle2 = CheckCircle2;
  readonly Circle = Circle; readonly Clock = Clock; readonly LayoutGrid = LayoutGrid;
  readonly ListIcon = ListIcon; readonly Filter = Filter; readonly ArrowRight = ArrowRight;
  readonly Coins = Coins; readonly Pencil = Pencil;

  readonly activityTypes = [
    { key: 'note', label: 'Nota', icon: StickyNote },
    { key: 'call', label: 'Llamada', icon: PhoneCall },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'meeting', label: 'Reunión', icon: Users },
    { key: 'task', label: 'Tarea', icon: Clock },
  ];

  stages = signal<Stage[]>([]);
  columns = signal<Column[]>([]);
  stats = signal<Stats | null>(null);
  owners = signal<Owner[]>([]);
  loading = signal(true);

  view = signal<'board' | 'list'>('board');
  search = signal('');
  ownerFilter = signal('');
  overdue = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  // ficha
  detail = signal<Lead | null>(null);
  activities = signal<Activity[]>([]);
  savingActivity = signal(false);
  newActivity: { type: string; title: string; body: string; dueAt: string } = {
    type: 'note', title: '', body: '', dueAt: '',
  };

  // alta / edición
  formOpen = signal(false);
  saving = signal(false);
  form: LeadForm = blankForm('new');
  customerQuery = signal('');
  customerOptions = signal<CustomerOption[]>([]);
  private customerTimer?: ReturnType<typeof setTimeout>;

  /** Todas las oportunidades en una lista plana, para la vista de tabla. */
  allLeads = computed(() => this.columns().flatMap(c => c.leads));

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.formOpen()) { this.closeForm(); return; }
    if (this.detail()) this.closeDetail();
  }

  ngOnInit() {
    this.http.get<Stage[]>(`${API}/leads/stages`).subscribe({
      next: s => this.stages.set(s),
      error: () => {},
    });
    this.http.get<Owner[]>(`${API}/leads/owners`).subscribe({
      next: o => this.owners.set(o),
      error: () => {},
    });
    this.load();
  }

  load(withSpinner = true) {
    if (withSpinner) this.loading.set(true);
    const params = new URLSearchParams();
    if (this.search().trim()) params.set('q', this.search().trim());
    if (this.ownerFilter()) params.set('ownerId', this.ownerFilter());
    if (this.overdue()) params.set('overdue', 'true');
    const query = params.toString();
    this.http.get<Column[]>(`${API}/leads/board${query ? `?${query}` : ''}`).subscribe({
      next: c => { this.columns.set(c); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudo cargar el embudo');
      },
    });
    this.http.get<Stats>(`${API}/leads/stats`).subscribe({
      next: s => this.stats.set(s),
      error: () => {},
    });
  }

  onSearch(value: string) {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(false), 300);
  }

  setOwner(id: string) { this.ownerFilter.set(id); this.load(false); }
  toggleOverdue() { this.overdue.update(v => !v); this.load(false); }

  // ── Drag & drop ──
  private dragging: Lead | null = null;
  dragOverStage = signal<string | null>(null);

  onDragStart(lead: Lead) { this.dragging = lead; }
  onDragEnd() { this.dragging = null; this.dragOverStage.set(null); }

  onDragOver(event: DragEvent, stage: string) {
    if (!this.dragging) return;
    event.preventDefault();
    this.dragOverStage.set(stage);
  }

  onDragLeave(stage: string) {
    if (this.dragOverStage() === stage) this.dragOverStage.set(null);
  }

  onDrop(event: DragEvent, stage: string) {
    event.preventDefault();
    const lead = this.dragging;
    this.dragOverStage.set(null);
    this.dragging = null;
    if (!lead || lead.stage === stage) return;
    this.moveTo(lead, stage);
  }

  /** Mueve la oportunidad de etapa; en "Perdido" pide el motivo antes. */
  async moveTo(lead: Lead, stage: string) {
    if (lead.stage === stage) return;
    // El motivo se escribe desde "Editar"; aquí solo se conserva el que hubiera.
    let lostReason: string | undefined;
    if (stage === 'lost') {
      const ok = await this.confirmSvc.confirm({
        title: 'Marcar como perdida',
        message: `¿Dar por perdida "${lead.title}"? Podrás anotar el motivo desde Editar y reabrirla moviéndola a otra etapa.`,
        confirmText: 'Marcar perdida',
        danger: true,
      });
      if (!ok) return;
      lostReason = lead.lostReason;
    }
    this.http.patch<Lead>(`${API}/leads/${lead._id}/move`, { stage, lostReason }).subscribe({
      next: updated => {
        this.toast.success(`Movida a ${this.stageLabel(stage)}`);
        if (this.detail()?._id === updated._id) {
          this.detail.set(updated);
          this.loadActivities(updated._id);
        }
        this.load(false);
      },
      error: err => this.toast.error(err?.error?.message || 'No se pudo mover la oportunidad'),
    });
  }

  // ── Ficha ──
  openDetail(lead: Lead) {
    this.detail.set(lead);
    this.activities.set([]);
    this.newActivity = { type: 'note', title: '', body: '', dueAt: '' };
    this.loadActivities(lead._id);
  }

  closeDetail() { this.detail.set(null); }

  private loadActivities(leadId: string) {
    this.http.get<Activity[]>(`${API}/leads/${leadId}/activities`).subscribe({
      next: a => this.activities.set(a),
      error: () => {},
    });
  }

  addActivity() {
    const lead = this.detail();
    if (!lead) return;
    if (!this.newActivity.title.trim()) {
      this.toast.error('Escribe de qué se trata');
      return;
    }
    if (this.newActivity.type === 'task' && !this.newActivity.dueAt) {
      this.toast.error('Una tarea necesita fecha de vencimiento');
      return;
    }
    this.savingActivity.set(true);
    const body = {
      type: this.newActivity.type,
      title: this.newActivity.title.trim(),
      body: this.newActivity.body.trim() || undefined,
      dueAt: this.newActivity.type === 'task' ? new Date(this.newActivity.dueAt).toISOString() : undefined,
    };
    this.http.post<Activity>(`${API}/leads/${lead._id}/activities`, body).subscribe({
      next: () => {
        this.toast.success('Actividad registrada');
        this.newActivity = { type: this.newActivity.type, title: '', body: '', dueAt: '' };
        this.savingActivity.set(false);
        this.loadActivities(lead._id);
        this.load(false);
      },
      error: err => {
        this.toast.error(err?.error?.message || 'No se pudo registrar la actividad');
        this.savingActivity.set(false);
      },
    });
  }

  toggleTask(a: Activity) {
    const lead = this.detail();
    if (!lead) return;
    this.http.patch<Activity>(`${API}/leads/${lead._id}/activities/${a._id}`, { done: !a.done }).subscribe({
      next: () => { this.loadActivities(lead._id); this.load(false); },
      error: err => this.toast.error(err?.error?.message || 'No se pudo actualizar la tarea'),
    });
  }

  async removeActivity(a: Activity) {
    const lead = this.detail();
    if (!lead) return;
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar actividad',
      message: `Se borrará "${a.title}" del historial.`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/leads/${lead._id}/activities/${a._id}`).subscribe({
      next: () => { this.toast.success('Actividad eliminada'); this.loadActivities(lead._id); this.load(false); },
      error: err => this.toast.error(err?.error?.message || 'No se pudo eliminar'),
    });
  }

  async removeLead(lead: Lead) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar oportunidad',
      message: `Se borrará "${lead.title}" y todo su historial. El contacto se conserva.`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/leads/${lead._id}`).subscribe({
      next: () => { this.toast.success('Oportunidad eliminada'); this.closeDetail(); this.load(false); },
      error: err => this.toast.error(err?.error?.message || 'No se pudo eliminar'),
    });
  }

  goToChat(lead: Lead) {
    if (!lead.conversationId) return;
    this.router.navigate(['/inbox'], { queryParams: { c: lead.conversationId } });
  }

  // ── Alta / edición ──
  openNew() {
    this.form = blankForm(this.stages()[0]?.key ?? 'new');
    this.customerQuery.set('');
    this.customerOptions.set([]);
    this.formOpen.set(true);
  }

  editDetail() {
    const lead = this.detail();
    if (!lead) return;
    this.form = {
      _id: lead._id,
      title: lead.title,
      description: lead.description ?? '',
      stage: lead.stage,
      value: lead.value,
      priority: lead.priority,
      ownerId: typeof lead.ownerId === 'object' ? lead.ownerId?._id ?? '' : (lead.ownerId ?? ''),
      tags: [...lead.tags],
      expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : '',
      lostReason: lead.lostReason ?? '',
      customerId: '', newCustomerName: '', newCustomerPhone: '', newCustomerEmail: '',
    };
    this.formOpen.set(true);
  }

  closeForm() { this.formOpen.set(false); }

  onCustomerSearch(value: string) {
    this.customerQuery.set(value);
    this.form.customerId = '';
    this.form.newCustomerName = value;
    if (this.customerTimer) clearTimeout(this.customerTimer);
    if (!value.trim()) { this.customerOptions.set([]); return; }
    this.customerTimer = setTimeout(() => {
      this.http.get<CustomerOption[]>(`${API}/leads/customers?q=${encodeURIComponent(value.trim())}`).subscribe({
        next: c => this.customerOptions.set(c),
        error: () => this.customerOptions.set([]),
      });
    }, 300);
  }

  pickCustomer(c: CustomerOption) {
    this.form.customerId = c._id;
    this.form.newCustomerName = c.name;
    this.customerQuery.set(c.name);
    this.customerOptions.set([]);
  }

  clearCustomer() {
    this.form.customerId = '';
    this.customerQuery.set('');
    this.form.newCustomerName = '';
  }

  save() {
    if (!this.form.title.trim()) {
      this.toast.error('El título es obligatorio');
      return;
    }
    const isNew = !this.form._id;
    if (isNew && !this.form.customerId && !this.form.newCustomerName.trim()) {
      this.toast.error('Elige un contacto existente o escribe el nombre de uno nuevo');
      return;
    }
    this.saving.set(true);
    const body: Record<string, unknown> = {
      title: this.form.title.trim(),
      description: this.form.description || undefined,
      stage: this.form.stage,
      value: Number(this.form.value) || 0,
      priority: this.form.priority,
      ownerId: this.form.ownerId || undefined,
      expectedCloseDate: this.form.expectedCloseDate
        ? new Date(this.form.expectedCloseDate).toISOString()
        : undefined,
    };
    if (isNew) {
      if (this.form.customerId) body['customerId'] = this.form.customerId;
      else body['customer'] = {
        name: this.form.newCustomerName.trim(),
        phone: this.form.newCustomerPhone || undefined,
        email: this.form.newCustomerEmail || undefined,
      };
    } else if (this.form.stage === 'lost') {
      body['lostReason'] = this.form.lostReason || undefined;
    }

    const req = isNew
      ? this.http.post<Lead>(`${API}/leads`, body)
      : this.http.patch<Lead>(`${API}/leads/${this.form._id}`, body);
    req.subscribe({
      next: lead => {
        this.toast.success(isNew ? 'Oportunidad creada' : 'Oportunidad actualizada');
        this.saving.set(false);
        this.formOpen.set(false);
        if (this.detail()) { this.detail.set(lead); this.loadActivities(lead._id); }
        this.load(false);
      },
      error: err => {
        this.toast.error(err?.error?.message || 'No se pudo guardar');
        this.saving.set(false);
      },
    });
  }

  // ── Helpers de presentación ──
  customerName(lead: Lead): string {
    return typeof lead.customerId === 'object' ? lead.customerId.name : 'Contacto';
  }

  customerPhone(lead: Lead): string {
    return typeof lead.customerId === 'object' ? (lead.customerId.phone ?? '') : '';
  }

  customerEmail(lead: Lead): string {
    return typeof lead.customerId === 'object' ? (lead.customerId.email ?? '') : '';
  }

  waLink(lead: Lead): string {
    return `https://wa.me/${this.customerPhone(lead).replace(/\D/g, '')}`;
  }

  ownerName(lead: Lead): string {
    if (!lead.ownerId) return 'Sin asignar';
    if (typeof lead.ownerId === 'string')
      return this.owners().find(o => o._id === lead.ownerId)?.name ?? 'Sin asignar';
    return lead.ownerId.name || lead.ownerId.email;
  }

  ownerInitials(lead: Lead): string {
    const name = this.ownerName(lead);
    if (name === 'Sin asignar') return '—';
    return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
  }

  stageLabel(key: string): string {
    return this.stages().find(s => s.key === key)?.label ?? key;
  }

  stageColor(key: string): string {
    return this.stages().find(s => s.key === key)?.color ?? '#94A3B8';
  }

  activityLabel(type: string): string { return ACTIVITY_LABELS[type] ?? type; }
  priorityLabel(p: string): string { return PRIORITY_LABELS[p] ?? p; }

  isOverdue(date: string): boolean { return new Date(date).getTime() < Date.now(); }

  money(value: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency', currency: 'PEN', maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  shortDate(date?: string): string {
    if (!date) return '—';
    const d = new Date(date);
    const today = new Date();
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString('es-PE', {
      day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    });
  }
}
