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
import { ContactImportComponent } from './contact-import/contact-import';
import {
  LucideAngularModule,
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Download,
  Upload,
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
  Eye,
  ExternalLink,
  StickyNote,
  Database,
  Filter,
  Columns3,
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface Customer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  tags: string[];
  notes?: string;
  source: string;
  /** Nombre legible del origen: el formulario o la importación que lo trajo. */
  sourceLabel?: string;
  sourceUrl?: string;
  /** Campos del origen que no encajan en el modelo, conservados tal cual. */
  customFields?: Record<string, unknown>;
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
  reservation: { label: 'Reserva',     cls: 'badge-info'    },
  event:       { label: 'Evento',      cls: 'badge-success' },
  manual:      { label: 'Manual',      cls: 'badge-neutral' },
  form:        { label: 'Formulario',  cls: 'badge-warning' },
  import:      { label: 'Importación', cls: 'badge-neutral' },
  mongodb:     { label: 'MongoDB',     cls: 'badge-neutral' },
  api:         { label: 'API',         cls: 'badge-warning' },
  whatsapp:    { label: 'WhatsApp',    cls: 'badge-success' },
  instagram:   { label: 'Instagram',   cls: 'badge-info'    },
};

/** Orden de los chips del filtro por origen. */
const SOURCE_ORDER = ['form', 'reservation', 'event', 'manual', 'import', 'mongodb', 'api', 'whatsapp', 'instagram'];

/** Una columna de la tabla: fija del modelo o descubierta en `customFields`. */
interface ColumnDef {
  key: string;
  label: string;
  /** true si viene de `customFields`, con clave prefijada `cf:`. */
  custom: boolean;
}

/** Prefijo que distingue una columna de `customFields` de una del modelo. */
const CUSTOM_PREFIX = 'cf:';

const BASE_COLUMNS: ColumnDef[] = [
  { key: 'email',      label: 'Email',         custom: false },
  { key: 'phone',      label: 'Teléfono',      custom: false },
  { key: 'tags',       label: 'Tags',          custom: false },
  { key: 'source',     label: 'Origen',        custom: false },
  { key: 'lastVisit',  label: 'Última visita', custom: false },
  { key: 'history',    label: 'Historial',     custom: false },
  { key: 'createdAt',  label: 'Alta',          custom: false },
  { key: 'notes',      label: 'Notas',         custom: false },
];

/** Lo que se ve al entrar por primera vez. */
const DEFAULT_COLUMNS = ['phone', 'tags', 'source', 'lastVisit', 'history'];

/** Clave de localStorage donde se recuerda la elección de columnas. */
const COLUMNS_STORAGE_KEY = 'bar.customers.columns';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, ContactImportComponent],
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
          <button class="btn btn-secondary" (click)="importOpen.set(true)" title="Importar contactos">
            <lucide-icon [img]="Upload" [size]="15"></lucide-icon>
            Importar
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
          <span class="stat-value">{{ countBySource('form') }}</span>
          <span class="stat-label">De formularios</span>
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
          <button class="tag-filter-btn" [class.active]="!selectedSource()" (click)="selectedSource.set('')">
            Todo origen
          </button>
          @for (src of activeSources(); track src) {
            <button class="tag-filter-btn" [class.active]="selectedSource() === src"
              (click)="selectedSource.set(selectedSource() === src ? '' : src)">
              {{ sourceMeta(src).label }}
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

        <div class="table-tools">
          <button class="btn btn-secondary btn-sm" [class.active-tool]="filtersOpen()"
            (click)="filtersOpen.set(!filtersOpen())" title="Filtrar por columna">
            <lucide-icon [img]="Filter" [size]="14"></lucide-icon>
            Filtros
            @if (activeColumnFilters() > 0) {
              <span class="tool-count">{{ activeColumnFilters() }}</span>
            }
          </button>

          <div class="columns-picker">
            <button class="btn btn-secondary btn-sm" [class.active-tool]="columnsOpen()"
              (click)="columnsOpen.set(!columnsOpen())" title="Elegir columnas">
              <lucide-icon [img]="Columns3" [size]="14"></lucide-icon>
              Columnas
              <span class="tool-count">{{ visibleColumns().length }}</span>
            </button>

            @if (columnsOpen()) {
              <div class="columns-backdrop" (click)="columnsOpen.set(false)"></div>
              <div class="columns-panel animate-fade-in">
                <div class="columns-head">
                  <span class="columns-title">Columnas visibles</span>
                  <button class="btn btn-ghost btn-sm" (click)="resetColumns()">Restablecer</button>
                </div>

                <div class="columns-group">
                  <span class="columns-group-title">Datos del contacto</span>
                  @for (col of baseColumns; track col.key) {
                    <label class="column-item">
                      <input type="checkbox" [checked]="isColumnVisible(col.key)"
                        (change)="toggleColumn(col.key)" />
                      <span>{{ col.label }}</span>
                    </label>
                  }
                </div>

                @if (customColumns().length) {
                  <div class="columns-group">
                    <span class="columns-group-title">
                      Campos adicionales
                      <span class="columns-group-count">{{ customColumns().length }}</span>
                    </span>
                    @for (col of customColumns(); track col.key) {
                      <label class="column-item">
                        <input type="checkbox" [checked]="isColumnVisible(col.key)"
                          (change)="toggleColumn(col.key)" />
                        <span class="column-custom-name">{{ col.label }}</span>
                      </label>
                    }
                  </div>
                } @else {
                  <p class="columns-empty">
                    Aún no hay campos adicionales. Aparecen aquí los que traigan tus
                    importaciones y formularios.
                  </p>
                }
              </div>
            }
          </div>

          @if (activeColumnFilters() > 0) {
            <button class="btn btn-ghost btn-sm" (click)="clearColumnFilters()">
              <lucide-icon [img]="X" [size]="14"></lucide-icon>
              Limpiar filtros
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
                @for (col of visibleColumns(); track col.key) {
                  <th>{{ col.label }}</th>
                }
                <th></th>
              </tr>
              @if (filtersOpen()) {
                <tr class="filter-row">
                  <th class="th-check"></th>
                  <th>
                    <input class="input input-sm" placeholder="Filtrar…"
                      [value]="columnFilters()['contact'] || ''"
                      (input)="setColumnFilter('contact', $any($event.target).value)" />
                  </th>
                  @for (col of visibleColumns(); track col.key) {
                    <th>
                      <input class="input input-sm" placeholder="Filtrar…"
                        [value]="columnFilters()[col.key] || ''"
                        (input)="setColumnFilter(col.key, $any($event.target).value)" />
                    </th>
                  }
                  <th></th>
                </tr>
              }
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c._id) {
                <tr [class.row-selected]="selectedIds().includes(c._id)">
                  <td class="td-check">
                    <input type="checkbox" class="row-checkbox"
                      [checked]="selectedIds().includes(c._id)"
                      (change)="toggleSelect(c._id)" />
                  </td>
                  <td class="contact-td">
                    <button type="button" class="contact-cell" (click)="openView(c)"
                      [title]="'Ver ficha de ' + c.name">
                      <div class="contact-avatar">{{ initials(c.name) }}</div>
                      <div class="contact-info">
                        <span class="contact-name">{{ c.name }}</span>
                        <span class="contact-email">{{ c.email || c.phone || '—' }}</span>
                      </div>
                    </button>
                  </td>

                  @for (col of visibleColumns(); track col.key) {
                    <td [attr.data-label]="col.label">
                      @switch (col.key) {
                        @case ('tags') {
                          <div class="tags-cell">
                            @for (tag of c.tags.slice(0, 3); track tag) {
                              <span class="badge badge-neutral tag-badge">{{ tag }}</span>
                            }
                            @if (c.tags.length > 3) {
                              <span class="badge badge-neutral">+{{ c.tags.length - 3 }}</span>
                            }
                            @if (!c.tags.length) { <span class="text-muted">—</span> }
                          </div>
                        }
                        @case ('source') {
                          <div class="source-cell">
                            <span class="badge {{ sourceMeta(c.source).cls }}">{{ sourceMeta(c.source).label }}</span>
                            @if (c.sourceLabel) {
                              <span class="source-detail" [title]="c.sourceUrl || c.sourceLabel">{{ c.sourceLabel }}</span>
                            }
                          </div>
                        }
                        @case ('history') {
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
                            @if (!c.totalReservations && !c.totalEvents) { <span class="text-muted">—</span> }
                          </div>
                        }
                        @default {
                          <span [class.text-muted]="!cellValue(c, col.key)"
                            [class.cell-custom]="col.custom" [title]="cellValue(c, col.key)">
                            {{ cellValue(c, col.key) || '—' }}
                          </span>
                        }
                      }
                    </td>
                  }

                  <td class="td-actions">
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openView(c)" title="Ver ficha">
                        <lucide-icon [img]="Eye" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
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

    <!-- ── Ficha del contacto ── -->
    @if (viewing(); as c) {
      <div class="overlay" (click)="viewing.set(null)" role="dialog" aria-modal="true" aria-label="Ficha del contacto">
        <aside class="drawer" (click)="$event.stopPropagation()">

          <div class="view-header">
            <div class="view-identity">
              <div class="view-avatar">{{ initials(c.name) }}</div>
              <div class="view-title-group">
                <h2>{{ c.name }}</h2>
                <div class="view-badges">
                  <span class="badge {{ sourceMeta(c.source).cls }}">{{ sourceMeta(c.source).label }}</span>
                  @if (c.sourceLabel) {
                    <span class="badge badge-neutral">{{ c.sourceLabel }}</span>
                  }
                </div>
              </div>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="viewing.set(null)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="drawer-scroll">

            <!-- Datos de contacto -->
            <div class="view-section">
              <span class="view-section-title">Contacto</span>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt><lucide-icon [img]="Mail" [size]="14"></lucide-icon> Email</dt>
                  <dd>
                    @if (c.email) {
                      <a [href]="'mailto:' + c.email">{{ c.email }}</a>
                    } @else { <span class="muted">—</span> }
                  </dd>
                </div>
                <div class="detail-row">
                  <dt><lucide-icon [img]="Phone" [size]="14"></lucide-icon> Teléfono</dt>
                  <dd>
                    @if (c.phone) {
                      <a [href]="'tel:' + c.phone">{{ c.phone }}</a>
                    } @else { <span class="muted">—</span> }
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Etiquetas -->
            <div class="view-section">
              <span class="view-section-title">Etiquetas</span>
              @if (c.tags.length) {
                <div class="view-tags">
                  @for (tag of c.tags; track tag) {
                    <span class="badge badge-info">{{ tag }}</span>
                  }
                </div>
              } @else {
                <p class="muted small">Sin etiquetas.</p>
              }
            </div>

            <!-- Procedencia -->
            <div class="view-section">
              <span class="view-section-title">Procedencia</span>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt>Canal</dt>
                  <dd>{{ sourceMeta(c.source).label }}</dd>
                </div>
                @if (c.sourceLabel) {
                  <div class="detail-row">
                    <dt>Origen</dt>
                    <dd>{{ c.sourceLabel }}</dd>
                  </div>
                }
                @if (c.sourceUrl) {
                  <div class="detail-row">
                    <dt>Página</dt>
                    <dd>
                      <a [href]="c.sourceUrl" target="_blank" rel="noopener" class="link-ext">
                        {{ c.sourceUrl }}
                        <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon>
                      </a>
                    </dd>
                  </div>
                }
                <div class="detail-row">
                  <dt>Alta</dt>
                  <dd>{{ formatDate(c.createdAt) }}</dd>
                </div>
              </dl>
            </div>

            <!-- Actividad -->
            <div class="view-section">
              <span class="view-section-title">Actividad</span>
              <div class="view-stats">
                <div class="view-stat">
                  <span class="view-stat-value">{{ c.totalReservations }}</span>
                  <span class="view-stat-label">Reservas</span>
                </div>
                <div class="view-stat">
                  <span class="view-stat-value">{{ c.totalEvents }}</span>
                  <span class="view-stat-label">Eventos</span>
                </div>
                <div class="view-stat">
                  <span class="view-stat-value">{{ formatDate(c.lastVisit) }}</span>
                  <span class="view-stat-label">Última visita</span>
                </div>
              </div>
            </div>

            <!-- Notas -->
            @if (c.notes) {
              <div class="view-section">
                <span class="view-section-title">
                  <lucide-icon [img]="StickyNote" [size]="13"></lucide-icon> Notas
                </span>
                <p class="view-notes">{{ c.notes }}</p>
              </div>
            }

            <!-- Campos adicionales importados -->
            <div class="view-section">
              <span class="view-section-title">
                <lucide-icon [img]="Database" [size]="13"></lucide-icon>
                Campos adicionales
                @if (customEntries(c).length) {
                  <span class="view-section-count">{{ customEntries(c).length }}</span>
                }
              </span>
              @if (customEntries(c).length) {
                <dl class="detail-list custom-list">
                  @for (entry of customEntries(c); track entry.key) {
                    <div class="detail-row">
                      <dt class="custom-key" [title]="entry.key">{{ entry.key }}</dt>
                      <dd class="custom-value">{{ entry.value }}</dd>
                    </div>
                  }
                </dl>
              } @else {
                <p class="muted small">
                  Este contacto no trae campos extra. Aparecen aquí los que elijas al importar
                  un archivo o los que recojan tus formularios.
                </p>
              }
            </div>
          </div>

          <div class="view-footer">
            <button class="btn btn-ghost danger" (click)="deleteFromView(c)">
              <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
              Eliminar
            </button>
            <span class="view-footer-spacer"></span>
            <button class="btn btn-secondary" (click)="viewing.set(null)">Cerrar</button>
            <button class="btn btn-primary" (click)="editFromView(c)">
              <lucide-icon [img]="Pencil" [size]="15"></lucide-icon>
              Editar
            </button>
          </div>
        </aside>
      </div>
    }

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

    <!-- ── Importador (Excel/CSV y MongoDB) ── -->
    @if (importOpen()) {
      <app-contact-import (closed)="onImportClosed($event)" />
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

    .contact-avatar { width:38px; height:38px; min-width:38px; border-radius:50%; background:var(--color-brand-light); color:var(--color-brand); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .contact-info { display:flex; flex-direction:column; gap:2px; }
    .contact-name { font-weight:600; color:var(--color-text-main); }
    .contact-email { font-size:12px; color:var(--color-text-muted); }

    .tags-cell { display:flex; gap:4px; flex-wrap:wrap; max-width:200px; }
    .source-cell { display:flex; flex-direction:column; gap:3px; align-items:flex-start; }
    .source-detail { font-size:11px; color:var(--color-text-muted); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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

    /* ── Herramientas de tabla: columnas y filtros ── */
    .table-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .active-tool { border-color:var(--color-brand); color:var(--color-brand); }
    .tool-count { background:var(--color-brand); color:#fff; border-radius:var(--radius-pill);
      padding:1px 7px; font-size:11px; font-weight:700; }
    .active-tool .tool-count { background:var(--color-brand); }

    .columns-picker { position:relative; }
    .columns-backdrop { position:fixed; inset:0; z-index:40; }
    .columns-panel { position:absolute; right:0; top:calc(100% + 8px); z-index:41; width:290px;
      max-height:420px; overflow-y:auto; background:#fff; border:1px solid var(--color-border);
      border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); padding:8px; }
    .columns-head { display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:8px 10px 10px; border-bottom:1px solid var(--color-border); margin-bottom:6px; }
    .columns-title { font-size:13px; font-weight:700; }
    .columns-group { padding:6px 0; }
    .columns-group + .columns-group { border-top:1px solid var(--color-border); margin-top:4px; }
    .columns-group-title { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700;
      text-transform:uppercase; letter-spacing:.05em; color:var(--color-text-muted); padding:6px 10px; }
    .columns-group-count { background:var(--color-bg-app); border:1px solid var(--color-border);
      border-radius:var(--radius-pill); padding:0 6px; letter-spacing:0; }
    .column-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px;
      cursor:pointer; font-size:13px; font-weight:500; transition:background var(--transition-fast); }
    .column-item:hover { background:var(--color-bg-app); }
    .column-item input { width:15px; height:15px; accent-color:var(--color-brand); cursor:pointer; flex-shrink:0; }
    .column-custom-name { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .columns-empty { margin:0; padding:10px; font-size:12px; color:var(--color-text-muted); line-height:1.5; }

    .filter-row th { padding:8px 10px !important; background:#fff !important;
      border-bottom:1px solid var(--color-border); text-transform:none; }
    .filter-row .input-sm { padding:6px 12px; font-size:12px; width:100%; min-width:90px; }
    .cell-custom { display:inline-block; max-width:220px; overflow:hidden; text-overflow:ellipsis;
      white-space:nowrap; vertical-align:middle; }

    /* ── Ficha del contacto ── */
    .contact-cell { display:flex; align-items:center; gap:12px; width:100%; padding:0; border:none;
      background:none; text-align:left; cursor:pointer; border-radius:12px; transition:opacity var(--transition-fast); }
    .contact-cell:hover .contact-name { color:var(--color-brand); }
    .contact-cell:focus-visible { outline:2px solid var(--color-brand); outline-offset:3px; }

    .view-header { padding:32px 32px 20px; display:flex; align-items:flex-start; justify-content:space-between;
      gap:16px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
    .view-identity { display:flex; align-items:center; gap:16px; min-width:0; }
    .view-avatar { width:56px; height:56px; min-width:56px; border-radius:50%; background:var(--color-brand-light);
      color:var(--color-brand); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; }
    .view-title-group { min-width:0; }
    .view-title-group h2 { margin:0 0 6px; font-size:22px; font-weight:800; letter-spacing:-.5px; word-break:break-word; }
    .view-badges { display:flex; flex-wrap:wrap; gap:6px; }

    .view-section { margin-bottom:28px; }
    .view-section-title { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700;
      text-transform:uppercase; letter-spacing:.05em; color:var(--color-text-muted); margin-bottom:12px; }
    .view-section-count { background:var(--color-brand-light); color:var(--color-brand); border-radius:var(--radius-pill);
      padding:1px 8px; font-size:11px; letter-spacing:0; }

    .detail-list { margin:0; display:flex; flex-direction:column; gap:2px; }
    .detail-row { display:grid; grid-template-columns:150px 1fr; gap:16px; align-items:baseline;
      padding:9px 12px; border-radius:10px; }
    .detail-row:nth-child(odd) { background:var(--color-bg-app); }
    .detail-row dt { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
      color:var(--color-text-muted); min-width:0; }
    .detail-row dd { margin:0; font-size:14px; color:var(--color-text-main); word-break:break-word; }
    .detail-row a { color:var(--color-brand); text-decoration:none; font-weight:600; }
    .detail-row a:hover { text-decoration:underline; }
    .link-ext { display:inline-flex; align-items:center; gap:4px; }
    .muted { color:var(--color-text-muted); }
    .small { font-size:13px; margin:0; line-height:1.5; }

    .custom-list .custom-key { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
    .custom-value { white-space:pre-wrap; }

    .view-tags { display:flex; flex-wrap:wrap; gap:6px; }

    .view-stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
    .view-stat { border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:14px 16px;
      display:flex; flex-direction:column; gap:2px; }
    .view-stat-value { font-size:18px; font-weight:800; font-family:var(--font-heading); letter-spacing:-.5px; }
    .view-stat-label { font-size:12px; color:var(--color-text-muted); font-weight:500; }

    .view-notes { margin:0; font-size:14px; line-height:1.6; color:var(--color-text-main);
      background:var(--color-bg-app); border:1px solid var(--color-border); border-radius:var(--radius-sm);
      padding:14px 16px; white-space:pre-wrap; }

    .view-footer { display:flex; align-items:center; gap:10px; padding:20px 32px;
      border-top:1px solid var(--color-border); flex-shrink:0; }
    .view-footer-spacer { flex:1; }

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

    @media (max-width: 768px) {
      .page { padding:20px 16px; }
      .page-header { margin-bottom:20px; }
      .filters-row { flex-direction:column; align-items:stretch; }
      .search-wrap { min-width:0; width:100%; }
      .tag-filters { width:100%; }

      .bulk-bar { flex-direction:column; align-items:stretch; gap:10px; }
      .bulk-actions { width:100%; }
      .bulk-actions .btn { flex:1; }

      .drawer { width:100%; }
      .drawer-header { padding:20px 20px 16px; }
      .drawer-scroll { padding:20px; }
      .field-row { flex-direction:column; gap:20px; }

      .table-wrap table, .table-wrap thead, .table-wrap tbody,
      .table-wrap tr, .table-wrap th, .table-wrap td { display:block; }
      .table-wrap thead { display:none; }
      .filter-row { display:none; }
      .table-wrap tbody tr { border:1px solid var(--color-border); border-radius:12px; margin:12px; padding:12px 14px; }
      .table-wrap tr:hover td { background:none; }
      .table-wrap tr.row-selected { background:var(--color-brand-light); border-radius:12px; }
      .table-wrap td { border-bottom:none; padding:7px 0; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .table-wrap td::before { content:attr(data-label); font-size:11px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.04em; flex-shrink:0; }
      .table-wrap td.td-check { justify-content:flex-start; padding-bottom:6px; }
      .table-wrap td.td-check::before { content:none; }
      .table-wrap td.contact-td { display:block; padding:4px 0 12px; border-bottom:1px solid var(--color-border); margin-bottom:6px; }
      .table-wrap td.contact-td::before { content:none; }
      .table-wrap td.td-actions { justify-content:flex-end; padding-top:8px; }
      .table-wrap td.td-actions::before { content:none; }
      .table-footer { border-radius:0 0 12px 12px; }
    }

    @media (max-width: 480px) {
      .stats-row { grid-template-columns:1fr 1fr; }
      .header-actions { width:100%; }
      .header-actions .btn { flex:1; }
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
  readonly Download = Download; readonly Upload = Upload; readonly X = X; readonly Tag = Tag;
  readonly Mail = Mail; readonly Phone = Phone; readonly Calendar = Calendar;
  readonly ContactRound = ContactRound; readonly List = List;
  readonly UserPlus = UserPlus; readonly CheckSquare = CheckSquare;
  readonly ChevronDown = ChevronDown;
  readonly Eye = Eye; readonly ExternalLink = ExternalLink;
  readonly StickyNote = StickyNote; readonly Database = Database;
  readonly Filter = Filter; readonly Columns3 = Columns3;

  readonly presetTags = PRESET_TAGS;

  customers       = signal<Customer[]>([]);
  loading         = signal(false);
  syncing         = signal(false);
  importOpen      = signal(false);
  searchQuery     = signal('');
  selectedTag     = signal('');
  selectedSource  = signal('');
  filtersOpen     = signal(false);
  columnsOpen     = signal(false);
  columnFilters   = signal<Record<string, string>>({});
  visibleKeys     = signal<string[]>(this.loadColumns());
  viewing         = signal<Customer | null>(null);
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
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.includes(q) ?? false),
    );
    const tag = this.selectedTag();
    if (tag) list = list.filter(c => c.tags.includes(tag));
    const src = this.selectedSource();
    if (src) list = list.filter(c => c.source === src);

    // Filtros por columna: coincidencia parcial, sin distinguir mayúsculas.
    const filters = Object.entries(this.columnFilters())
      .map(([key, value]) => [key, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value);
    if (filters.length) {
      list = list.filter(c =>
        filters.every(([key, value]) =>
          (key === 'contact'
            ? `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`
            : this.cellValue(c, key)
          ).toLowerCase().includes(value),
        ),
      );
    }
    return list;
  });

  /** Solo se ofrecen como filtro los orígenes que realmente existen. */
  activeSources = computed(() => {
    const present = new Set(this.customers().map(c => c.source));
    return SOURCE_ORDER.filter(s => present.has(s));
  });

  readonly baseColumns = BASE_COLUMNS;

  /** Campos adicionales presentes en los contactos cargados. */
  customColumns = computed<ColumnDef[]>(() => {
    const keys = new Set<string>();
    for (const c of this.customers()) {
      for (const key of Object.keys(c.customFields ?? {})) keys.add(key);
    }
    return [...keys].sort().map(key => ({
      key: CUSTOM_PREFIX + key,
      label: key,
      custom: true,
    }));
  });

  /** Todas las columnas ofrecibles, en el orden en que se pintan. */
  allColumns = computed<ColumnDef[]>(() => [...BASE_COLUMNS, ...this.customColumns()]);

  visibleColumns = computed<ColumnDef[]>(() => {
    const keys = this.visibleKeys();
    return this.allColumns().filter(col => keys.includes(col.key));
  });

  activeColumnFilters = computed(
    () => Object.values(this.columnFilters()).filter(v => v.trim()).length,
  );

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
      this.form.setValue({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', notes: c.notes ?? '' });
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

  /** Devuelve true si el usuario confirmó, para que la ficha pueda cerrarse. */
  async deleteCustomer(c: Customer): Promise<boolean> {
    const ok = await this.confirm.confirm({
      title: 'Eliminar contacto',
      message: `¿Eliminar a "${c.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return false;
    this.http.delete(`${API}/customers/${c._id}`).subscribe({
      next: () => { this.toast.success('Contacto eliminado'); this.loadCustomers(); },
      error: err => this.toast.error((err.error as { message?: string })?.message || 'Error'),
    });
    return true;
  }

  /** El importador avisa si hubo cambios para no recargar de balde. */
  onImportClosed(changed: boolean) {
    this.importOpen.set(false);
    if (changed) this.loadCustomers();
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

  openView(c: Customer) {
    this.viewing.set(c);
  }

  editFromView(c: Customer) {
    this.viewing.set(null);
    this.openDrawer(c);
  }

  async deleteFromView(c: Customer) {
    const removed = await this.deleteCustomer(c);
    if (removed) this.viewing.set(null);
  }

  // ── Columnas y filtros por columna ──

  isColumnVisible(key: string): boolean {
    return this.visibleKeys().includes(key);
  }

  toggleColumn(key: string) {
    this.visibleKeys.update(keys =>
      keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key],
    );
    // Una columna oculta no debe seguir filtrando sin que se vea.
    if (!this.isColumnVisible(key)) this.setColumnFilter(key, '');
    this.saveColumns();
  }

  resetColumns() {
    this.visibleKeys.set([...DEFAULT_COLUMNS]);
    this.columnFilters.set({});
    this.saveColumns();
  }

  setColumnFilter(key: string, value: string) {
    this.columnFilters.update(f => ({ ...f, [key]: value }));
  }

  clearColumnFilters() {
    this.columnFilters.set({});
  }

  /** Texto de una celda, que es a la vez lo que se pinta y lo que se filtra. */
  cellValue(c: Customer, key: string): string {
    if (key.startsWith(CUSTOM_PREFIX)) {
      return this.displayValue(c.customFields?.[key.slice(CUSTOM_PREFIX.length)]);
    }
    switch (key) {
      case 'email':     return c.email ?? '';
      case 'phone':     return c.phone ?? '';
      case 'tags':      return c.tags.join(', ');
      case 'source':    return `${this.sourceMeta(c.source).label} ${c.sourceLabel ?? ''}`.trim();
      case 'lastVisit': return c.lastVisit ? this.formatDate(c.lastVisit) : '';
      case 'createdAt': return this.formatDate(c.createdAt);
      case 'notes':     return c.notes ?? '';
      case 'history':
        return `${c.totalReservations} reservas ${c.totalEvents} eventos`;
      default:          return '';
    }
  }

  /** La elección de columnas es una comodidad local, no un dato del servidor. */
  private loadColumns(): string[] {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every(k => typeof k === 'string')) {
        return parsed as string[];
      }
    } catch {
      // Navegador sin almacenamiento o valor corrupto: se usan las de siempre.
    }
    return [...DEFAULT_COLUMNS];
  }

  private saveColumns() {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(this.visibleKeys()));
    } catch {
      // Sin persistencia el resto sigue funcionando igual.
    }
  }

  /** Pares clave/valor de `customFields`, ya listos para pintar. */
  customEntries(c: Customer): { key: string; value: string }[] {
    return Object.entries(c.customFields ?? {})
      .map(([key, value]) => ({ key, value: this.displayValue(value) }))
      .filter(entry => entry.value !== '');
  }

  /** Un campo importado puede traer cualquier cosa: array, objeto o primitiva. */
  private displayValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(v => this.displayValue(v)).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return ''; }
    }
    return String(value).trim();
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
    if (this.columnsOpen()) { this.columnsOpen.set(false); return; }
    if (this.listPickerOpen()) { this.listPickerOpen.set(false); return; }
    if (this.drawerOpen()) { this.closeDrawer(); return; }
    if (this.viewing()) this.viewing.set(null);
  }
}
