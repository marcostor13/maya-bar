import {
  Component,
  HostListener,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import {
  LucideAngularModule,
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Download,
  X,
  Tag,
  Mail,
  Phone,
  Calendar,
  ContactRound,
  List,
  UserPlus,
  CheckSquare,
  ChevronDown,
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface Customer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  tags: string[];
  notes?: string;
  source: 'reservation' | 'event' | 'manual';
  totalReservations: number;
  totalEvents: number;
  lastVisit?: string;
  createdAt: string;
}

interface ListMini {
  _id: string;
  name: string;
  color: string;
  type: string;
}

const PRESET_TAGS = ['VIP', 'Vegetariano', 'Cumpleañero', 'Corporativo', 'Delivery', 'Fiel', 'Nuevo', 'Alérgico'];

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  reservation: { label: 'Reserva',  cls: 'badge-info'    },
  event:       { label: 'Evento',   cls: 'badge-success' },
  manual:      { label: 'Manual',   cls: 'badge-neutral' },
};

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">

      <!-- ── Header ── -->
      <div class="page-header">
        <div>
          <h1>Clientes</h1>
          <p class="subtitle">Base de contactos unificada desde reservas, eventos y entradas manuales.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="sync()" [disabled]="syncing()">
            <lucide-icon [img]="RefreshCw" [size]="15" [class.spin]="syncing()"></lucide-icon>
            {{ syncing() ? 'Sincronizando...' : 'Sincronizar' }}
          </button>
          <button class="btn btn-secondary" (click)="exportCsv()" title="Exportar CSV">
            <lucide-icon [img]="Download" [size]="15"></lucide-icon>
            Exportar CSV
          </button>
          <button class="btn btn-primary" (click)="openDrawer(null)">
            <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Nuevo contacto
          </button>
        </div>
      </div>

      <!-- ── Stats ── -->
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ customers().length }}</span>
          <span class="stat-label">Total contactos</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ countBySource('reservation') }}</span>
          <span class="stat-label">De reservas</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ countBySource('event') }}</span>
          <span class="stat-label">De eventos</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ countBySource('manual') }}</span>
          <span class="stat-label">Manuales</span>
        </div>
      </div>

      <!-- ── Filters ── -->
      <div class="filters-row">
        <div class="search-wrap">
          <lucide-icon [img]="Search" [size]="16" class="search-icon"></lucide-icon>
          <input class="input search-input" placeholder="Buscar por nombre, email o teléfono..."
            (input)="searchQuery.set($any($event.target).value)" [value]="searchQuery()" />
          @if (searchQuery()) {
            <button class="search-clear" (click)="searchQuery.set('')" aria-label="Limpiar búsqueda">
              <lucide-icon [img]="X" [size]="14"></lucide-icon>
            </button>
          }
        </div>
        <div class="tag-filters">
          <button class="tag-filter-btn" [class.active]="!selectedTag()" (click)="selectedTag.set('')">
            Todos
          </button>
          @for (tag of activeTags(); track tag) {
            <button class="tag-filter-btn" [class.active]="selectedTag() === tag" (click)="toggleTagFilter(tag)">
              {{ tag }}
            </button>
          }
        </div>
      </div>

      <!-- ── Bulk action bar ── -->
      @if (someSelected()) {
        <div class="bulk-bar animate-fade-in">
          <div class="bulk-info">
            <lucide-icon [img]="CheckSquare" [size]="16" style="color: var(--color-brand);"></lucide-icon>
            <span class="bulk-count">{{ selectedIds().length }} contacto(s) seleccionado(s)</span>
          </div>
          <div class="bulk-actions">
            <button class="btn btn-sm btn-secondary" (click)="openListPicker()">
              <lucide-icon [img]="UserPlus" [size]="14"></lucide-icon>
              Agregar a lista
            </button>
            <button class="btn btn-sm btn-ghost" (click)="clearSelection()">
              <lucide-icon [img]="X" [size]="14"></lucide-icon>
              Cancelar
            </button>
          </div>
        </div>
      }

      <!-- ── Table ── -->
      @if (loading()) {
        <div class="card skeleton-list">
          @for (i of [1,2,3,4,5]; track i) { <div class="skeleton-row"></div> }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="ContactRound" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>{{ customers().length === 0 ? 'Sin contactos' : 'Sin resultados' }}</h3>
          <p>{{ customers().length === 0
            ? 'Haz clic en "Sincronizar" para importar contactos desde reservas y eventos, o crea uno manualmente.'
            : 'No hay contactos que coincidan con la búsqueda.' }}</p>
          @if (customers().length === 0) {
            <button class="btn btn-primary" (click)="sync()" [disabled]="syncing()">
              <lucide-icon [img]="RefreshCw" [size]="15"></lucide-icon>
              Sincronizar ahora
            </button>
          }
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="th-check">
                  <input type="checkbox" class="row-checkbox"
                    [checked]="allSelected()"
                    [indeterminate]="someSelected() && !allSelected()"
                    (change)="toggleAll()" />
                </th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Tags</th>
                <th>Origen</th>
                <th>Última visita</th>
                <th>Historial</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c._id) {
                <tr [class.row-selected]="selectedIds().includes(c._id)">
                  <td class="td-check">
                    <input type="checkbox" class="row-checkbox"
                      [checked]="selectedIds().includes(c._id)"
                      (change)="toggleSelect(c._id)" />
                  </td>
                  <td>
                    <div class="contact-cell">
                      <div class="contact-avatar">{{ initials(c.name) }}</div>
                      <div class="contact-info">
                        <span class="contact-name">{{ c.name }}</span>
                        <span class="contact-email">{{ c.email }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="text-muted">{{ c.phone || '—' }}</td>
                  <td>
                    <div class="tags-cell">
                      @for (tag of c.tags.slice(0, 3); track tag) {
                        <span class="badge badge-neutral tag-badge">{{ tag }}</span>
                      }
                      @if (c.tags.length > 3) {
                        <span class="badge badge-neutral">+{{ c.tags.length - 3 }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="badge {{ sourceMeta(c.source).cls }}">{{ sourceMeta(c.source).label }}</span>
                  </td>
                  <td class="text-muted">{{ formatDate(c.lastVisit) }}</td>
                  <td>
                    <div class="history-cell">
                      @if (c.totalReservations > 0) {
                        <span class="history-pill" title="Reservas">
                          <lucide-icon [img]="Calendar" [size]="11"></lucide-icon>
                          {{ c.totalReservations }}
                        </span>
                      }
                      @if (c.totalEvents > 0) {
                        <span class="history-pill" title="Eventos">
                          <lucide-icon [img]="Tag" [size]="11"></lucide-icon>
                          {{ c.totalEvents }}
                        </span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openDrawer(c)" title="Editar">
                        <lucide-icon [img]="Pencil" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-icon danger" (click)="deleteCustomer(c)" title="Eliminar">
                        <lucide-icon [img]="Trash2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="table-footer">{{ filteredCustomers().length }} contacto(s)</div>
      }
    </div>

    <!-- ── Edit Drawer ── -->
    @if (drawerOpen()) {
      <div class="overlay" (click)="closeDrawer()" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">

          <div class="drawer-header">
            <div class="drawer-title-group">
              <h2>{{ editingCustomer() ? 'Editar contacto' : 'Nuevo contacto' }}</h2>
              <p class="subtitle">{{ editingCustomer()?.email || 'Completa los datos del contacto.' }}</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="closeDrawer()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="drawer-scroll">
            <form [formGroup]="form" (ngSubmit)="saveCustomer()">

              <div class="field-row">
                <div class="field">
                  <label class="field-label">Nombre *</label>
                  <input class="input" formControlName="name" placeholder="Ej: María García" autofocus />
                </div>
                <div class="field">
                  <label class="field-label">Email *</label>
                  <input class="input" formControlName="email" type="email" placeholder="maria@email.com" />
                </div>
              </div>

              <div class="field">
                <label class="field-label">Teléfono</label>
                <input class="input" formControlName="phone" placeholder="+51 999 999 999" />
              </div>

              <div class="field">
                <label class="field-label">Tags</label>
                <div class="tag-selector">
                  <div class="preset-tags">
                    @for (tag of presetTags; track tag) {
                      <button type="button" class="tag-chip"
                        [class.selected]="selectedTags().includes(tag)"
                        (click)="toggleTag(tag)">
                        {{ tag }}
                      </button>
                    }
                  </div>
                  <div class="custom-tag-row">
                    <input #customTagInput class="input input-sm" placeholder="Agregar tag personalizado..."
                      (keydown.enter)="$event.preventDefault(); addCustomTag(customTagInput)" />
                    <button type="button" class="btn btn-ghost btn-sm"
                      (click)="addCustomTag(customTagInput)">
                      <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                    </button>
                  </div>
                  @if (selectedTags().length > 0) {
                    <div class="selected-tags">
                      @for (tag of selectedTags(); track tag) {
                        <span class="badge badge-info tag-selected">
                          {{ tag }}
                          <button type="button" (click)="removeTag(tag)" aria-label="Quitar tag">
                            <lucide-icon [img]="X" [size]="10"></lucide-icon>
                          </button>
                        </span>
                      }
                    </div>
                  }
                </div>
              </div>

              <div class="field">
                <label class="field-label">Notas internas</label>
                <textarea class="textarea" formControlName="notes" rows="3"
                  placeholder="Preferencias, alergias, observaciones..."></textarea>
              </div>

              <div class="drawer-actions">
                <button type="button" class="btn btn-secondary" (click)="closeDrawer()">Cerrar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando...' : (editingCustomer() ? 'Actualizar' : 'Crear contacto') }}
                </button>
              </div>

            </form>
          </div>

        </aside>
      </div>
    }

    <!-- ── List Picker Modal ── -->
    @if (listPickerOpen()) {
      <div class="modal-overlay" (click)="listPickerOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Agregar a lista</h3>
              <p class="modal-sub">
                <lucide-icon [img]="CheckSquare" [size]="13" style="vertical-align: middle;"></lucide-icon>
                {{ selectedIds().length }} contacto(s) serán agregados
              </p>
            </div>
            <button class="btn btn-icon btn-ghost" (click)="listPickerOpen.set(false)">
              <lucide-icon [img]="X" [size]="18"></lucide-icon>
            </button>
          </div>
          <div class="modal-body">
            @if (availableLists().length === 0) {
              <div class="picker-empty">
                <lucide-icon [img]="List" [size]="32" style="opacity: 0.3;"></lucide-icon>
                <p>No hay listas estáticas disponibles.<br>Crea una en la sección Listas.</p>
              </div>
            }
            @for (l of availableLists(); track l._id) {
              <button class="list-pick-item" (click)="addToList(l._id)" [disabled]="addingToList()">
                <div class="pick-dot" [style.background]="l.color"></div>
                <span class="pick-name">{{ l.name }}</span>
                @if (addingToList()) {
                  <lucide-icon [img]="RefreshCw" [size]="13" class="spin" style="margin-left: auto;"></lucide-icon>
                }
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
    .page-header h1 { font-size:24px; font-weight:700; margin:0 0 4px; font-family:var(--font-heading); }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:14px; }
    .header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

    /* ── Stats ── */
    .stats-row { display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:24px; }
    .stat-card { background:#fff; border:1px solid var(--color-border); border-radius:16px; padding:20px 24px; display:flex; flex-direction:column; gap:4px; }
    .stat-value { font-size:28px; font-weight:800; color:var(--color-text-main); letter-spacing:-1px; font-family:var(--font-heading); }
    .stat-label { font-size:13px; color:var(--color-text-muted); font-weight:500; }

    /* ── Filters ── */
    .filters-row { display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
    .search-wrap { position:relative; flex:1; min-width:260px; }
    .search-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--color-text-muted); pointer-events:none; }
    .search-input { padding-left:42px; padding-right:36px; }
    .search-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--color-text-muted); cursor:pointer; padding:4px; border-radius:4px; display:flex; }
    .search-clear:hover { color:var(--color-text-main); }
    .tag-filters { display:flex; gap:8px; flex-wrap:wrap; }
    .tag-filter-btn { padding:6px 14px; border-radius:var(--radius-pill); border:1px solid var(--color-border); background:#fff; font-size:13px; font-weight:600; color:var(--color-text-muted); cursor:pointer; transition:all .2s; }
    .tag-filter-btn:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .tag-filter-btn.active { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }

    /* ── Bulk bar ── */
    .bulk-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--color-brand-light); border: 1.5px solid var(--color-brand);
      border-radius: var(--radius-lg); padding: 10px 18px; margin-bottom: 12px;
    }
    .bulk-info { display: flex; align-items: center; gap: 8px; }
    .bulk-count { font-size: 13px; font-weight: 700; color: var(--color-brand); }
    .bulk-actions { display: flex; gap: 8px; }

    /* ── Table ── */
    .table-wrap { background:#fff; border:1px solid var(--color-border); border-radius:16px; overflow:hidden; }
    .table-wrap table { width:100%; border-collapse:collapse; }
    .table-wrap th { padding:13px 16px; text-align:left; font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.05em; background:var(--color-bg-app); border-bottom:1px solid var(--color-border); }
    .table-wrap td { padding:14px 16px; border-bottom:1px solid var(--color-border); font-size:14px; vertical-align:middle; }
    .table-wrap tr:last-child td { border-bottom:none; }
    .table-wrap tr:hover td { background:var(--color-bg-app); }
    .table-wrap tr.row-selected td { background: var(--color-brand-light); }
    .text-muted { color:var(--color-text-muted); }

    /* Checkbox column */
    .th-check, .td-check { width: 44px; padding: 13px 8px 13px 20px !important; }
    .row-checkbox { width: 16px; height: 16px; accent-color: var(--color-brand); cursor: pointer; }

    .contact-cell { display:flex; align-items:center; gap:12px; }
    .contact-avatar { width:38px; height:38px; min-width:38px; border-radius:50%; background:var(--color-brand-light); color:var(--color-brand); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .contact-info { display:flex; flex-direction:column; gap:2px; }
    .contact-name { font-weight:600; color:var(--color-text-main); }
    .contact-email { font-size:12px; color:var(--color-text-muted); }

    .tags-cell { display:flex; gap:4px; flex-wrap:wrap; max-width:200px; }
    .tag-badge { font-size:11px; }

    .history-cell { display:flex; gap:6px; }
    .history-pill { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:600; color:var(--color-text-muted); background:var(--color-bg-app); border:1px solid var(--color-border); border-radius:var(--radius-pill); padding:3px 8px; }

    .row-actions { display:flex; gap:4px; }
    .btn.danger { color:var(--color-error); }
    .btn.danger:hover { background:#FEF2F2; }

    .table-footer { padding:12px 20px; font-size:13px; color:var(--color-text-muted); background:var(--color-bg-app); border:1px solid var(--color-border); border-top:none; border-radius:0 0 16px 16px; }

    .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 40px; gap:16px; text-align:center; }
    .empty-state h3 { margin:0; font-size:18px; font-weight:700; }
    .empty-state p { margin:0; color:var(--color-text-muted); max-width:360px; line-height:1.5; }
    .empty-icon { color:var(--color-brand); opacity:.3; }

    /* ── Edit Drawer ── */
    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex; align-items:stretch; justify-content:flex-end; z-index:100; }
    .drawer { width:560px; background:#fff; box-shadow:-10px 0 40px rgba(0,0,0,.15); display:flex; flex-direction:column; height:100vh; animation:slideInRight .25s var(--transition-spring); }
    @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
    .drawer-header { padding:32px 32px 20px; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
    .drawer-title-group h2 { margin:0 0 4px; font-size:24px; font-weight:800; letter-spacing:-.5px; }
    .drawer-scroll { padding:32px; overflow-y:auto; flex:1; }
    .drawer-actions { display:flex; gap:12px; justify-content:flex-end; padding-top:24px; border-top:1px solid var(--color-border); margin-top:8px; }
    .field { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
    .field-row { display:flex; gap:16px; margin-bottom:24px; }
    .field-row .field { flex:1; margin-bottom:0; }
    .field-label { font-size:14px; font-weight:600; color:var(--color-text-main); }

    /* Tag selector */
    .tag-selector { display:flex; flex-direction:column; gap:12px; }
    .preset-tags { display:flex; flex-wrap:wrap; gap:8px; }
    .tag-chip { padding:6px 14px; border-radius:var(--radius-pill); border:1.5px solid var(--color-border); background:#fff; font-size:13px; font-weight:600; color:var(--color-text-muted); cursor:pointer; transition:all .2s; }
    .tag-chip:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .tag-chip.selected { background:var(--color-brand); border-color:var(--color-brand); color:#fff; }
    .custom-tag-row { display:flex; gap:8px; align-items:center; }
    .input-sm { padding:8px 14px; font-size:13px; }
    .selected-tags { display:flex; flex-wrap:wrap; gap:6px; padding:12px; background:var(--color-bg-app); border-radius:12px; border:1px solid var(--color-border); }
    .tag-selected { display:inline-flex; align-items:center; gap:6px; }
    .tag-selected button { background:none; border:none; cursor:pointer; padding:0; display:flex; color:inherit; opacity:.7; }
    .tag-selected button:hover { opacity:1; }

    /* ── List Picker Modal ── */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); display: flex; align-items: center;
      justify-content: center; z-index: 110;
    }
    .modal-card {
      background: var(--color-white); border-radius: var(--radius-lg);
      width: calc(100% - 48px); max-width: 440px; box-shadow: var(--shadow-lg);
      animation: fadeUp .2s ease;
      overflow: hidden;
    }
    @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    .modal-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 24px 24px 16px; border-bottom: 1px solid var(--color-border);
    }
    .modal-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 4px; }
    .modal-sub { font-size: 12px; color: var(--color-text-muted); margin: 0; display: flex; align-items: center; gap: 4px; }
    .modal-body { padding: 12px; max-height: 360px; overflow-y: auto; }

    .list-pick-item {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 12px 14px; border: none; background: transparent;
      border-radius: var(--radius-lg); cursor: pointer; text-align: left;
      transition: background var(--transition-fast); font-size: 14px; font-weight: 600;
      color: var(--color-text-main);
    }
    .list-pick-item:hover:not(:disabled) { background: var(--color-bg-app); }
    .list-pick-item:disabled { opacity: 0.6; cursor: not-allowed; }
    .pick-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .pick-name { flex: 1; }

    .picker-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; text-align: center; color: var(--color-text-muted); font-size: 13px; }

    .spin { animation: spin .8s linear infinite; }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

    @media (max-width: 1024px) {
      .stats-row { grid-template-columns:repeat(2, 1fr); }
    }
  `],
})
export class CustomersComponent implements OnInit {
  private http     = inject(HttpClient);
  private fb       = inject(FormBuilder);
  private toast    = inject(ToastService);
  private confirm  = inject(ConfirmService);
  private auth     = inject(AuthService);

  readonly Users = Users; readonly Plus = Plus; readonly Pencil = Pencil;
  readonly Trash2 = Trash2; readonly Search = Search; readonly RefreshCw = RefreshCw;
  readonly Download = Download; readonly X = X; readonly Tag = Tag;
  readonly Mail = Mail; readonly Phone = Phone; readonly Calendar = Calendar;
  readonly ContactRound = ContactRound; readonly List = List;
  readonly UserPlus = UserPlus; readonly CheckSquare = CheckSquare;
  readonly ChevronDown = ChevronDown;

  readonly presetTags = PRESET_TAGS;

  customers       = signal<Customer[]>([]);
  loading         = signal(false);
  syncing         = signal(false);
  searchQuery     = signal('');
  selectedTag     = signal('');
  drawerOpen      = signal(false);
  editingCustomer = signal<Customer | null>(null);
  saving          = signal(false);
  selectedTags    = signal<string[]>([]);

  // Multi-select
  selectedIds     = signal<string[]>([]);
  availableLists  = signal<ListMini[]>([]);
  listPickerOpen  = signal(false);
  addingToList    = signal(false);

  filteredCustomers = computed(() => {
    let list = this.customers();
    const q = this.searchQuery().toLowerCase();
    if (q) list = list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone?.includes(q) ?? false),
    );
    const tag = this.selectedTag();
    if (tag) list = list.filter(c => c.tags.includes(tag));
    return list;
  });

  activeTags = computed(() => {
    const tags = new Set<string>();
    this.customers().forEach(c => c.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  });

  allSelected = computed(() => {
    const f = this.filteredCustomers();
    return f.length > 0 && f.every(c => this.selectedIds().includes(c._id));
  });

  someSelected = computed(() => this.selectedIds().length > 0);

  form = this.fb.group({
    name:  ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    notes: [''],
  });

  ngOnInit() { this.loadCustomers(); }

  loadCustomers() {
    this.loading.set(true);
    this.http.get<Customer[]>(`${API}/customers`).subscribe({
      next: cs => { this.customers.set(cs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openDrawer(c: Customer | null) {
    this.editingCustomer.set(c);
    if (c) {
      this.form.setValue({ name: c.name, email: c.email, phone: c.phone ?? '', notes: c.notes ?? '' });
      this.selectedTags.set([...c.tags]);
    } else {
      this.form.reset();
      this.selectedTags.set([]);
    }
    this.drawerOpen.set(true);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    this.editingCustomer.set(null);
    this.form.reset();
    this.selectedTags.set([]);
  }

  toggleTag(tag: string) {
    const tags = this.selectedTags();
    this.selectedTags.set(tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]);
  }

  addCustomTag(input: HTMLInputElement) {
    const val = input.value.trim();
    if (!val) return;
    const tags = this.selectedTags();
    if (!tags.includes(val)) this.selectedTags.set([...tags, val]);
    input.value = '';
  }

  removeTag(tag: string) {
    this.selectedTags.set(this.selectedTags().filter(t => t !== tag));
  }

  toggleTagFilter(tag: string) {
    this.selectedTag.set(this.selectedTag() === tag ? '' : tag);
  }

  // ── Multi-select ──
  toggleSelect(id: string) {
    const ids = this.selectedIds();
    this.selectedIds.set(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  toggleAll() {
    if (this.allSelected()) {
      this.selectedIds.set([]);
    } else {
      this.selectedIds.set(this.filteredCustomers().map(c => c._id));
    }
  }

  clearSelection() { this.selectedIds.set([]); }

  loadLists() {
    this.http.get<ListMini[]>(`${API}/lists`).subscribe({
      next: data => this.availableLists.set(data.filter(l => l.type === 'static')),
      error: () => {},
    });
  }

  openListPicker() {
    this.loadLists();
    this.listPickerOpen.set(true);
  }

  addToList(listId: string) {
    this.addingToList.set(true);
    const customerIds = this.selectedIds();
    this.http.post(`${API}/lists/${listId}/members`, { customerIds }).subscribe({
      next: () => {
        this.toast.success(`${customerIds.length} contacto(s) agregados a la lista`);
        this.addingToList.set(false);
        this.listPickerOpen.set(false);
        this.clearSelection();
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'Error al agregar a lista');
        this.addingToList.set(false);
      },
    });
  }

  saveCustomer() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const c = this.editingCustomer();
    const body = { ...this.form.value, tags: this.selectedTags() };
    const req = c
      ? this.http.patch<Customer>(`${API}/customers/${c._id}`, body)
      : this.http.post<Customer>(`${API}/customers`, body);

    req.subscribe({
      next: () => {
        this.toast.success(c ? 'Contacto actualizado' : 'Contacto creado');
        this.saving.set(false);
        this.closeDrawer();
        this.loadCustomers();
      },
      error: err => {
        this.toast.error((err.error as { message?: string })?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  async deleteCustomer(c: Customer) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar contacto',
      message: `¿Eliminar a "${c.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/customers/${c._id}`).subscribe({
      next: () => { this.toast.success('Contacto eliminado'); this.loadCustomers(); },
      error: err => this.toast.error((err.error as { message?: string })?.message || 'Error'),
    });
  }

  sync() {
    this.syncing.set(true);
    this.http.post<{ imported: number; updated: number }>(`${API}/customers/sync`, {}).subscribe({
      next: res => {
        this.toast.success(`Sincronizado: ${res.imported} importados, ${res.updated} actualizados`);
        this.syncing.set(false);
        this.loadCustomers();
      },
      error: err => {
        this.toast.error((err.error as { message?: string })?.message || 'Error al sincronizar');
        this.syncing.set(false);
      },
    });
  }

  exportCsv() {
    this.http.get(`${API}/customers/export.csv`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clientes.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.toast.success('CSV descargado');
      },
      error: () => this.toast.error('Error al exportar'),
    });
  }

  countBySource(source: string) {
    return this.customers().filter(c => c.source === source).length;
  }

  sourceMeta(source: string) {
    return SOURCE_META[source] ?? SOURCE_META['manual'];
  }

  formatDate(date?: string) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  initials(name: string) {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.listPickerOpen()) { this.listPickerOpen.set(false); return; }
    if (this.drawerOpen()) this.closeDrawer();
  }
}
