import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Plus, Trash2, Edit2, Users, Zap, List, X,
  ChevronDown, ChevronRight, RefreshCw, Eye, UserMinus
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type RuleField = 'tags' | 'source' | 'totalReservations' | 'totalEvents' | 'daysSinceLastVisit';
type RuleOperator = 'has_any' | 'has_all' | 'equals' | 'not_equals' | 'gte' | 'lte';

interface SegmentRule {
  field: RuleField;
  operator: RuleOperator;
  value: string | number | string[];
}

interface ContactList {
  _id: string;
  name: string;
  description?: string;
  type: 'static' | 'dynamic';
  rules: SegmentRule[];
  memberCount: number;
  color: string;
  createdAt: string;
}

interface Member {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  tags: string[];
}

const COLORS = ['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EF4444','#14B8A6'];

const FIELD_LABELS: Record<RuleField, string> = {
  tags: 'Etiquetas', source: 'Origen', totalReservations: 'Reservas totales',
  totalEvents: 'Eventos totales', daysSinceLastVisit: 'Días desde última visita',
};
const OPERATOR_LABELS: Record<string, string> = {
  has_any: 'contiene alguna de', has_all: 'contiene todas',
  equals: 'es igual a', not_equals: 'no es',
  gte: 'mayor o igual a', lte: 'menor o igual a',
};
const SOURCE_OPTIONS = [
  { value: 'reservation', label: 'Reserva' },
  { value: 'event', label: 'Evento' },
  { value: 'manual', label: 'Manual' },
];
const PRESET_TAGS = ['VIP', 'Vegetariano', 'Cumpleañero', 'Corporativo', 'Delivery', 'Fiel', 'Nuevo', 'Alérgico'];

function defaultOperatorsFor(field: RuleField): RuleOperator[] {
  if (field === 'tags') return ['has_any', 'has_all'];
  if (field === 'source') return ['equals', 'not_equals'];
  return ['gte', 'lte', 'equals'];
}

@Component({
  selector: 'app-lists',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Listas de Contactos</h1>
          <p class="page-subtitle">Segmentos estáticos y dinámicos para campañas precisas</p>
        </div>
        <button class="btn btn-primary btn-lg" (click)="openDrawer()">
          <lucide-icon [img]="Plus" [size]="18"></lucide-icon>
          Nueva Lista
        </button>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ lists().length }}</div>
          <div class="stat-label">Total listas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ staticCount() }}</div>
          <div class="stat-label">Estáticas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ dynamicCount() }}</div>
          <div class="stat-label">Dinámicas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ totalMembers() }}</div>
          <div class="stat-label">Miembros totales</div>
        </div>
      </div>

      <!-- List cards -->
      @if (loading()) {
        <div class="empty-state">
          <lucide-icon [img]="RefreshCw" [size]="32" class="spin" style="color: var(--color-text-muted);"></lucide-icon>
        </div>
      } @else if (lists().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="List" [size]="48" style="color: var(--color-text-muted); opacity: 0.3;"></lucide-icon>
          <p style="color: var(--color-text-muted); margin-top: 12px;">No hay listas aún. Crea la primera para segmentar tus campañas.</p>
          <button class="btn btn-primary btn-sm" (click)="openDrawer()" style="margin-top: 16px;">Crear lista</button>
        </div>
      } @else {
        <div class="lists-grid">
          @for (l of lists(); track l._id) {
            <div class="list-card card">
              <div class="list-card-header">
                <div class="list-avatar" [style.background]="l.color + '22'" [style.color]="l.color">
                  <lucide-icon [img]="l.type === 'dynamic' ? Zap : Users" [size]="20"></lucide-icon>
                </div>
                <div class="list-info">
                  <div class="list-name">{{ l.name }}</div>
                  @if (l.description) {
                    <div class="list-desc">{{ l.description }}</div>
                  }
                </div>
                <span class="type-badge" [class.type-dynamic]="l.type === 'dynamic'" [class.type-static]="l.type === 'static'">
                  {{ l.type === 'dynamic' ? 'Dinámica' : 'Estática' }}
                </span>
              </div>

              @if (l.type === 'dynamic' && l.rules.length > 0) {
                <div class="rules-preview">
                  @for (rule of l.rules.slice(0, 2); track $index) {
                    <span class="rule-chip">
                      {{ fieldLabel(rule.field) }} {{ operatorLabel(rule.operator) }} {{ ruleValueLabel(rule) }}
                    </span>
                  }
                  @if (l.rules.length > 2) {
                    <span class="rule-chip muted">+{{ l.rules.length - 2 }} más</span>
                  }
                </div>
              }

              <div class="list-card-footer">
                <div class="member-count">
                  <lucide-icon [img]="Users" [size]="14"></lucide-icon>
                  {{ l.memberCount }} miembro{{ l.memberCount !== 1 ? 's' : '' }}
                </div>
                <div class="card-actions">
                  @if (l.type === 'static') {
                    <button class="btn btn-sm btn-secondary" (click)="openMembersDrawer(l)">
                      <lucide-icon [img]="Users" [size]="13"></lucide-icon>
                      Miembros
                    </button>
                  }
                  <button class="btn btn-sm btn-ghost" (click)="openDrawer(l)" title="Editar">
                    <lucide-icon [img]="Edit2" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn btn-sm btn-danger" (click)="deleteList(l)" title="Eliminar">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Edit Drawer -->
    @if (drawerOpen()) {
      <div class="overlay" (click)="closeDrawer()"></div>
      <div class="drawer">
        <div class="drawer-header">
          <h2 class="drawer-title">{{ editingId() ? 'Editar lista' : 'Nueva lista' }}</h2>
          <button class="btn btn-icon btn-ghost" (click)="closeDrawer()">
            <lucide-icon [img]="X" [size]="20"></lucide-icon>
          </button>
        </div>
        <div class="drawer-body">
          @if (formError()) {
            <div class="error-box">{{ formError() }}</div>
          }

          <div class="field">
            <label class="label">Nombre *</label>
            <input class="input" [(ngModel)]="form.name" placeholder="Ej: Clientes VIP, Inactivos 30d" />
          </div>

          <div class="field">
            <label class="label">Descripción</label>
            <input class="input" [(ngModel)]="form.description" placeholder="Opcional" />
          </div>

          <div class="field">
            <label class="label">Color</label>
            <div class="color-picker">
              @for (c of COLORS; track c) {
                <button type="button" class="color-dot" [style.background]="c"
                  [class.selected]="form.color === c" (click)="form.color = c">
                </button>
              }
            </div>
          </div>

          @if (!editingId()) {
            <div class="field">
              <label class="label">Tipo *</label>
              <div class="type-toggle">
                <button type="button" class="type-btn" [class.active]="form.type === 'static'" (click)="form.type = 'static'">
                  <lucide-icon [img]="Users" [size]="16"></lucide-icon>
                  Estática
                  <span class="type-hint">Contactos curados manualmente</span>
                </button>
                <button type="button" class="type-btn" [class.active]="form.type === 'dynamic'" (click)="form.type = 'dynamic'">
                  <lucide-icon [img]="Zap" [size]="16"></lucide-icon>
                  Dinámica
                  <span class="type-hint">Se actualiza automáticamente con reglas</span>
                </button>
              </div>
            </div>
          }

          @if (form.type === 'dynamic') {
            <div class="field">
              <div class="rules-header">
                <label class="label" style="margin: 0;">Reglas del segmento</label>
                <button type="button" class="btn btn-sm btn-ghost" (click)="addRule()">
                  <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                  Agregar regla
                </button>
              </div>
              <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px;">
                Todas las reglas deben cumplirse (AND). Se evalúan al enviar la campaña.
              </p>

              @if (form.rules.length === 0) {
                <div class="empty-rules">Sin reglas = todos los clientes</div>
              }

              @for (rule of form.rules; track $index; let i = $index) {
                <div class="rule-row">
                  <select class="select" [(ngModel)]="rule.field" (ngModelChange)="onFieldChange(i)">
                    <option value="tags">Etiquetas</option>
                    <option value="source">Origen</option>
                    <option value="totalReservations">Reservas totales</option>
                    <option value="totalEvents">Eventos totales</option>
                    <option value="daysSinceLastVisit">Días sin visitar</option>
                  </select>

                  <select class="select" [(ngModel)]="rule.operator">
                    @for (op of getOperators(rule.field); track op) {
                      <option [value]="op">{{ operatorLabel(op) }}</option>
                    }
                  </select>

                  @if (rule.field === 'source') {
                    <select class="select" [(ngModel)]="rule.value">
                      @for (s of SOURCE_OPTIONS; track s.value) {
                        <option [value]="s.value">{{ s.label }}</option>
                      }
                    </select>
                  } @else if (rule.field === 'tags') {
                    <div class="tag-value-wrap">
                      <div class="mini-tags">
                        @for (tag of PRESET_TAGS; track tag) {
                          <button type="button" class="mini-tag" [class.sel]="isTagInRule(rule, tag)" (click)="toggleRuleTag(rule, tag)">
                            {{ tag }}
                          </button>
                        }
                      </div>
                    </div>
                  } @else {
                    <input class="input" type="number" [(ngModel)]="rule.value" placeholder="0" style="max-width: 100px;" />
                  }

                  <button type="button" class="btn btn-icon btn-ghost" (click)="removeRule(i)" style="flex-shrink: 0;">
                    <lucide-icon [img]="X" [size]="14"></lucide-icon>
                  </button>
                </div>
              }

              @if (form.rules.length > 0) {
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">
                  <button class="btn btn-secondary btn-sm" (click)="previewRules()" [disabled]="previewing()">
                    <lucide-icon [img]="Eye" [size]="14"></lucide-icon>
                    {{ previewing() ? 'Calculando...' : 'Vista previa' }}
                  </button>
                  @if (previewResult() !== null) {
                    <span style="font-size: 14px; color: #1D4ED8; font-weight: 600;">
                      {{ previewResult() }} contacto{{ previewResult() !== 1 ? 's' : '' }} coinciden
                    </span>
                  }
                </div>
              }
            </div>
          }

          @if (form.type === 'static') {
            <div class="info-box">
              <lucide-icon [img]="Users" [size]="16"></lucide-icon>
              <span>Agrega contactos desde la página de <strong>Clientes</strong>: selecciona uno o varios y haz clic en "Agregar a lista".</span>
            </div>
          }
        </div>
        <div class="drawer-footer">
          <button class="btn btn-ghost" (click)="closeDrawer()">Cancelar</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Guardando...' : 'Guardar lista' }}
          </button>
        </div>
      </div>
    }

    <!-- Members Drawer -->
    @if (membersDrawerOpen()) {
      <div class="overlay" (click)="closeMembersDrawer()"></div>
      <div class="drawer">
        <div class="drawer-header">
          <div>
            <h2 class="drawer-title">{{ membersListName() }}</h2>
            <p style="font-size: 12px; color: var(--color-text-muted); margin: 2px 0 0;">
              Lista estática · {{ members().length }} miembro(s)
            </p>
          </div>
          <button class="btn btn-icon btn-ghost" (click)="closeMembersDrawer()">
            <lucide-icon [img]="X" [size]="20"></lucide-icon>
          </button>
        </div>
        <div class="drawer-body" style="padding: 16px 20px;">
          @if (loadingMembers()) {
            <div style="display: flex; justify-content: center; padding: 40px;">
              <lucide-icon [img]="RefreshCw" [size]="24" class="spin" style="color: var(--color-text-muted);"></lucide-icon>
            </div>
          } @else if (members().length === 0) {
            <div class="empty-members">
              <lucide-icon [img]="Users" [size]="44" style="opacity: 0.25;"></lucide-icon>
              <p>Sin miembros aún.</p>
              <p style="font-size: 12px;">Ve a <strong>Clientes</strong>, selecciona contactos y usa "Agregar a lista".</p>
            </div>
          } @else {
            <div class="members-list">
              @for (m of members(); track m._id) {
                <div class="member-row">
                  <div class="member-avatar">{{ initials(m.name) }}</div>
                  <div class="member-info">
                    <div class="member-name">{{ m.name }}</div>
                    <div class="member-email">{{ m.email }}</div>
                    @if (m.phone) {
                      <div class="member-phone">{{ m.phone }}</div>
                    }
                    @if (m.tags.length > 0) {
                      <div class="member-tags">
                        @for (t of m.tags.slice(0, 3); track t) {
                          <span class="member-tag">{{ t }}</span>
                        }
                        @if (m.tags.length > 3) {
                          <span class="member-tag muted">+{{ m.tags.length - 3 }}</span>
                        }
                      </div>
                    }
                  </div>
                  <button class="btn btn-sm btn-ghost remove-btn"
                    (click)="removeFromList(m._id)"
                    [disabled]="removingId() === m._id"
                    title="Quitar de la lista">
                    @if (removingId() === m._id) {
                      <lucide-icon [img]="RefreshCw" [size]="13" class="spin"></lucide-icon>
                    } @else {
                      <lucide-icon [img]="UserMinus" [size]="14"></lucide-icon>
                    }
                  </button>
                </div>
              }
            </div>
          }
        </div>
        <div class="drawer-footer">
          <span style="font-size: 13px; color: var(--color-text-muted);">
            {{ members().length }} contacto(s) en esta lista
          </span>
          <button class="btn btn-ghost" (click)="closeMembersDrawer()">Cerrar</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 16px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 20px 24px; }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--color-text-main); font-family: var(--font-heading); }
    .stat-label { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; }

    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 64px 24px; }

    /* Grid of list cards */
    .lists-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }

    .list-card { padding: 20px 24px; cursor: default; }
    .list-card-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
    .list-avatar { width: 44px; height: 44px; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .list-info { flex: 1; min-width: 0; }
    .list-name { font-weight: 700; font-size: 15px; color: var(--color-text-main); }
    .list-desc { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .type-badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: var(--radius-pill); white-space: nowrap; flex-shrink: 0; }
    .type-dynamic { background: #EEF2FF; color: #4F46E5; }
    .type-static { background: #F0FDF4; color: #15803D; }

    .rules-preview { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .rule-chip { font-size: 11px; padding: 3px 8px; background: var(--color-bg-app); border: 1px solid var(--color-border); border-radius: var(--radius-pill); color: var(--color-text-muted); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
    .rule-chip.muted { color: var(--color-text-muted); font-style: italic; }

    .list-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--color-border); flex-wrap: wrap; gap: 8px; }
    .member-count { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); font-weight: 600; }
    .card-actions { display: flex; gap: 6px; }

    /* Drawer shared */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 520px; background: var(--color-white); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; z-index: 101; animation: slideIn var(--transition-spring); }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }
    .drawer-footer { padding: 20px 28px; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }

    .error-box { padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-lg); font-size: 14px; color: var(--color-error); }
    .info-box { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: var(--radius-lg); font-size: 13px; color: #1D4ED8; }

    /* Color picker */
    .color-picker { display: flex; gap: 10px; flex-wrap: wrap; }
    .color-dot { width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; transition: all var(--transition-fast); }
    .color-dot.selected { border-color: var(--color-text-main); transform: scale(1.15); }

    /* Type toggle */
    .type-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .type-btn { display: flex; flex-direction: column; align-items: flex-start; padding: 14px 16px; border: 1.5px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-white); cursor: pointer; gap: 4px; transition: all var(--transition-fast); }
    .type-btn.active { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }
    .type-hint { font-size: 11px; color: var(--color-text-muted); font-weight: 400; text-align: left; }
    .type-btn.active .type-hint { color: var(--color-brand); opacity: 0.8; }

    /* Rules */
    .rules-header { display: flex; align-items: center; justify-content: space-between; }
    .empty-rules { font-size: 13px; color: var(--color-text-muted); padding: 12px; background: var(--color-bg-app); border-radius: var(--radius-lg); text-align: center; }
    .rule-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; flex-wrap: wrap; }
    .rule-row .select { flex: 1; min-width: 100px; }
    .tag-value-wrap { flex: 1; }
    .mini-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .mini-tag { padding: 3px 9px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border); background: var(--color-white); font-size: 11px; font-weight: 600; cursor: pointer; color: var(--color-text-muted); transition: all var(--transition-fast); }
    .mini-tag.sel { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }

    /* Members drawer */
    .empty-members { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 24px; text-align: center; color: var(--color-text-muted); font-size: 14px; }
    .members-list { display: flex; flex-direction: column; gap: 2px; }
    .member-row {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px;
      border-radius: var(--radius-lg); transition: background var(--transition-fast);
    }
    .member-row:hover { background: var(--color-bg-app); }
    .member-avatar {
      width: 38px; height: 38px; min-width: 38px; border-radius: 50%;
      background: var(--color-brand-light); color: var(--color-brand);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .member-info { flex: 1; min-width: 0; }
    .member-name { font-weight: 600; font-size: 14px; color: var(--color-text-main); }
    .member-email { font-size: 12px; color: var(--color-text-muted); }
    .member-phone { font-size: 12px; color: var(--color-text-muted); }
    .member-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .member-tag { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: var(--radius-pill); background: var(--color-bg-app); color: var(--color-text-muted); border: 1px solid var(--color-border); }
    .member-tag.muted { font-style: italic; }
    .remove-btn { color: var(--color-error) !important; opacity: 0.7; }
    .remove-btn:hover { opacity: 1; background: #FEF2F2 !important; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .lists-grid { grid-template-columns: 1fr; }

      .drawer { width: 100%; }
      .drawer-header { padding: 20px; }
      .drawer-body { padding: 20px; }
      .drawer-footer { padding: 16px 20px; flex-wrap: wrap; }

      .type-toggle { grid-template-columns: 1fr; }
    }

    @media (max-width: 480px) {
      .stats-row { grid-template-columns: 1fr 1fr; }
      .page-header .btn-lg { width: 100%; justify-content: center; }
    }
  `],
})
export class ListsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Plus = Plus; readonly Trash2 = Trash2; readonly Edit2 = Edit2;
  readonly Users = Users; readonly Zap = Zap; readonly List = List;
  readonly X = X; readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight; readonly RefreshCw = RefreshCw;
  readonly Eye = Eye; readonly UserMinus = UserMinus;
  readonly COLORS = COLORS;
  readonly PRESET_TAGS = PRESET_TAGS;
  readonly SOURCE_OPTIONS = SOURCE_OPTIONS;

  lists = signal<ContactList[]>([]);
  loading = signal(true);

  // Edit drawer
  drawerOpen = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  formError = signal('');
  previewing = signal(false);
  previewResult = signal<number | null>(null);

  // Members drawer
  membersDrawerOpen = signal(false);
  membersListId = signal<string | null>(null);
  membersListName = signal('');
  members = signal<Member[]>([]);
  loadingMembers = signal(false);
  removingId = signal<string | null>(null);

  form: { name: string; description: string; type: 'static' | 'dynamic'; rules: SegmentRule[]; color: string } = {
    name: '', description: '', type: 'static', rules: [], color: COLORS[0],
  };

  staticCount  = computed(() => this.lists().filter(l => l.type === 'static').length);
  dynamicCount = computed(() => this.lists().filter(l => l.type === 'dynamic').length);
  totalMembers = computed(() => this.lists().reduce((s, l) => s + (l.memberCount || 0), 0));

  ngOnInit() { this.load(); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.membersDrawerOpen()) { this.closeMembersDrawer(); return; }
    if (this.drawerOpen()) this.closeDrawer();
  }

  load() {
    this.loading.set(true);
    this.http.get<ContactList[]>(`${API}/lists`).subscribe({
      next: (data) => { this.lists.set(data); this.loading.set(false); },
      error: () => { this.toast.error('Error al cargar listas'); this.loading.set(false); },
    });
  }

  openDrawer(l?: ContactList) {
    if (l) {
      this.editingId.set(l._id);
      this.form = { name: l.name, description: l.description ?? '', type: l.type, rules: l.rules.map(r => ({ ...r, value: Array.isArray(r.value) ? [...r.value] : r.value })), color: l.color };
    } else {
      this.editingId.set(null);
      this.form = { name: '', description: '', type: 'static', rules: [], color: COLORS[0] };
    }
    this.formError.set('');
    this.previewResult.set(null);
    this.membersDrawerOpen.set(false);
    this.drawerOpen.set(true);
  }

  closeDrawer() { this.drawerOpen.set(false); }

  // ── Members drawer ──
  openMembersDrawer(l: ContactList) {
    this.membersListId.set(l._id);
    this.membersListName.set(l.name);
    this.members.set([]);
    this.drawerOpen.set(false);
    this.membersDrawerOpen.set(true);
    this.loadMembers(l._id);
  }

  closeMembersDrawer() { this.membersDrawerOpen.set(false); }

  loadMembers(listId: string) {
    this.loadingMembers.set(true);
    this.http.get<Member[]>(`${API}/lists/${listId}/members`).subscribe({
      next: (data) => { this.members.set(data); this.loadingMembers.set(false); },
      error: () => { this.toast.error('Error al cargar miembros'); this.loadingMembers.set(false); },
    });
  }

  async removeFromList(memberId: string) {
    const lid = this.membersListId();
    if (!lid) return;
    const member = this.members().find(m => m._id === memberId);
    const ok = await this.confirm.confirm({
      title: 'Quitar de la lista',
      message: `¿Quitar a "${member?.name ?? 'este contacto'}" de la lista?`,
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    this.removingId.set(memberId);
    this.http.delete(`${API}/lists/${lid}/members/${memberId}`).subscribe({
      next: () => {
        this.members.update(list => list.filter(m => m._id !== memberId));
        this.lists.update(lists => lists.map(l => l._id === lid ? { ...l, memberCount: l.memberCount - 1 } : l));
        this.removingId.set(null);
        this.toast.success('Contacto quitado de la lista');
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'Error al quitar contacto');
        this.removingId.set(null);
      },
    });
  }

  // ── Rules ──
  addRule() {
    this.form.rules.push({ field: 'tags', operator: 'has_any', value: [] });
    this.previewResult.set(null);
  }

  removeRule(i: number) { this.form.rules.splice(i, 1); this.previewResult.set(null); }

  onFieldChange(i: number) {
    const rule = this.form.rules[i];
    const ops = defaultOperatorsFor(rule.field);
    rule.operator = ops[0];
    rule.value = rule.field === 'tags' ? [] : rule.field === 'source' ? 'reservation' : 0;
    this.previewResult.set(null);
  }

  getOperators(field: RuleField): RuleOperator[] { return defaultOperatorsFor(field); }

  isTagInRule(rule: SegmentRule, tag: string): boolean {
    return Array.isArray(rule.value) && rule.value.includes(tag);
  }

  toggleRuleTag(rule: SegmentRule, tag: string) {
    if (!Array.isArray(rule.value)) rule.value = [];
    const idx = rule.value.indexOf(tag);
    if (idx >= 0) rule.value.splice(idx, 1); else rule.value.push(tag);
    this.previewResult.set(null);
  }

  fieldLabel(f: string) { return FIELD_LABELS[f as RuleField] ?? f; }
  operatorLabel(o: string) { return OPERATOR_LABELS[o] ?? o; }
  ruleValueLabel(rule: SegmentRule): string {
    if (Array.isArray(rule.value)) return (rule.value as string[]).join(', ') || '—';
    if (rule.field === 'source') return SOURCE_OPTIONS.find(s => s.value === rule.value)?.label ?? String(rule.value);
    return String(rule.value);
  }

  initials(name: string) {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  previewRules() {
    if (!this.form.rules.length) return;
    this.previewing.set(true);
    this.http.post<{ count: number }>(`${API}/lists/preview-rules`, { rules: this.form.rules }).subscribe({
      next: (r) => { this.previewResult.set(r.count); this.previewing.set(false); },
      error: () => { this.previewing.set(false); this.toast.error('Error al calcular vista previa'); },
    });
  }

  save() {
    if (!this.form.name.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    this.formError.set('');
    this.saving.set(true);
    const payload = { name: this.form.name.trim(), description: this.form.description.trim() || undefined, type: this.form.type, rules: this.form.rules, color: this.form.color };
    const req$ = this.editingId()
      ? this.http.patch<ContactList>(`${API}/lists/${this.editingId()}`, payload)
      : this.http.post<ContactList>(`${API}/lists`, payload);
    req$.subscribe({
      next: () => { this.toast.success(this.editingId() ? 'Lista actualizada' : 'Lista creada'); this.saving.set(false); this.closeDrawer(); this.load(); },
      error: (err: { error?: { message?: string } }) => { const msg = err.error?.message || 'Error al guardar'; this.formError.set(msg); this.toast.error(msg); this.saving.set(false); },
    });
  }

  async deleteList(l: ContactList) {
    const ok = await this.confirm.confirm({ title: 'Eliminar lista', message: `¿Eliminar "${l.name}"? Las campañas que la usen dejarán de segmentarse por ella.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.http.delete(`${API}/lists/${l._id}`).subscribe({
      next: () => { this.toast.success('Lista eliminada'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }
}
