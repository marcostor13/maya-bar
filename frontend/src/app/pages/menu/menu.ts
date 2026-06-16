import { Component, HostListener, inject, signal, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { LucideAngularModule, Store, UtensilsCrossed, Pencil, Trash2 } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', dairy: 'Lácteos', nuts: 'Nueces', eggs: 'Huevo',
  soy: 'Soya', shellfish: 'Mariscos', fish: 'Pescado', peanuts: 'Maní',
};
const DIETARY_LABELS: Record<string, string> = {
  vegetarian: '🌿 Vegetariano', vegan: '🌱 Vegano', 'gluten-free': '🌾 Sin Gluten',
  spicy: '🌶 Picante', 'sugar-free': '🍬 Sin Azúcar',
};
const STATION_META: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  kitchen: { label: 'Cocina',  bg: '#FEF3C7', color: '#B45309', icon: '◆' },
  bar:     { label: 'Barra',   bg: '#EFF6FF', color: '#1D4ED8', icon: '◆' },
  desserts:{ label: 'Postres', bg: '#FDF4FF', color: '#7E22CE', icon: '◆' },
};

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, LucideAngularModule],
  template: `
<div class="menu-page animate-fade-in">

  <!-- ── Top bar ── -->
  <div class="topbar">
    <div class="topbar-left">
      <h1>Menú Digital</h1>
      <p class="subtitle">Categorías, ítems, estaciones y disponibilidad.</p>
    </div>
    <div class="topbar-right">
      <div class="local-picker">
        <span class="local-picker-icon"><lucide-icon [img]="Store" [size]="16" [strokeWidth]="2.5"></lucide-icon></span>
        <select class="local-select" (change)="onLocalChange($event)">
          <option value="">Selecciona un local...</option>
          @for (l of locals(); track l._id) {
            <option [value]="l._id">{{ l.name }}</option>
          }
        </select>
      </div>
    </div>
  </div>

  @if (!localId()) {
    <!-- ── No local selected ── -->
    <div class="splash card">
      <div class="splash-icon"><lucide-icon [img]="UtensilsCrossed" [size]="48" [strokeWidth]="2"></lucide-icon></div>
      <h3>Selecciona un local</h3>
      <p>Elige un local del selector de arriba para gestionar su menú.</p>
    </div>
  } @else {

    <!-- ── Stats bar ── -->
    <div class="stats-bar">
      <div class="stat">
        <span class="stat-num">{{ items().length }}</span>
        <span class="stat-lbl">Ítems totales</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num green">{{ availableCount() }}</span>
        <span class="stat-lbl">Disponibles</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num red">{{ unavailableCount() }}</span>
        <span class="stat-lbl">Agotados (86)</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <span class="stat-num">{{ categories().length }}</span>
        <span class="stat-lbl">Categorías</span>
      </div>
    </div>

    <!-- ── Main layout ── -->
    <div class="layout">

      <!-- ── Sidebar ── -->
      <aside class="sidebar card">
        <div class="sidebar-head">
          <span class="sidebar-title">Categorías</span>
          <button class="add-cat-btn" (click)="openCategoryForm(null)" aria-label="Nueva categoría">
            <span>+</span>
          </button>
        </div>

        <div
          class="cat-row"
          [class.active]="selectedCategoryId() === null"
          (click)="selectedCategoryId.set(null)"
        >
          <span class="cat-row-name">Todos los ítems</span>
          <span class="cat-count">{{ items().length }}</span>
        </div>

        @for (cat of categories(); track cat._id) {
          <div
            class="cat-row"
            [class.active]="selectedCategoryId() === cat._id"
            (click)="selectCategory(cat._id)"
          >
            <span class="cat-row-name">{{ cat.name }}</span>
            <div class="cat-row-right">
              <span class="cat-count">{{ countForCategory(cat._id) }}</span>
              <div class="cat-acts">
                <button (click)="openCategoryForm(cat); $event.stopPropagation()" aria-label="Editar categoría"><lucide-icon [img]="Pencil" [size]="14"></lucide-icon></button>
                <button class="del" (click)="deleteCategory(cat._id); $event.stopPropagation()" aria-label="Eliminar categoría">✕</button>
              </div>
            </div>
          </div>
        }

        @if (categories().length === 0) {
          <p class="sidebar-empty">Sin categorías.<br>Crea una para empezar.</p>
        }
      </aside>

      <!-- ── Items panel ── -->
      <main class="items-area">

        <!-- toolbar -->
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="section-title">
              {{ selectedCategory()?.name ?? 'Todos los ítems' }}
            </span>
            <span class="item-badge">{{ filteredItems().length }}</span>
          </div>
          <div class="toolbar-right">
            <div class="search-wrap">
              <span class="search-icon">⌕</span>
              <input
                class="search-input"
                placeholder="Buscar ítem..."
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
              />
            </div>
            <button
              class="btn btn-primary btn-sm"
              (click)="openItemForm(null)"
              [disabled]="!selectedCategoryId()"
              [title]="!selectedCategoryId() ? 'Selecciona una categoría primero' : ''"
            >
              + Nuevo ítem
            </button>
          </div>
        </div>

        @if (loadingItems()) {
          <div class="list-placeholder">
            @for (_ of [1,2,3,4]; track $index) {
              <div class="skeleton-row"></div>
            }
          </div>
        } @else if (visibleItems().length === 0) {
          <div class="empty-items">
            @if (searchQuery()) {
              <div class="empty-icon">⌕</div>
              <p>Sin resultados para "<strong>{{ searchQuery() }}</strong>"</p>
            } @else if (!selectedCategoryId()) {
              <div class="empty-icon"><lucide-icon [img]="UtensilsCrossed" [size]="32" [strokeWidth]="2"></lucide-icon></div>
              <p>Selecciona una categoría para ver sus ítems.</p>
            } @else {
              <div class="empty-icon"><lucide-icon [img]="UtensilsCrossed" [size]="32" [strokeWidth]="2"></lucide-icon></div>
              <p>Esta categoría no tiene ítems aún.</p>
              <button class="btn btn-primary btn-sm" (click)="openItemForm(null)">+ Agregar ítem</button>
            }
          </div>
        } @else {
          <div class="items-list">
            @for (item of visibleItems(); track item._id) {
              <div class="item-row" [class.off]="!item.isAvailable">

                <!-- Toggle switch -->
                <button
                  type="button"
                  class="sw"
                  [class.sw-on]="item.isAvailable"
                  (click)="toggleAvailability(item)"
                  [attr.aria-label]="item.isAvailable ? 'Marcar como agotado (86)' : 'Marcar como disponible'"
                  [attr.aria-pressed]="item.isAvailable"
                >
                  <span class="sw-thumb"></span>
                </button>

                <!-- Info -->
                <div class="item-info">
                  <span class="item-name">{{ item.name }}</span>
                  @if (item.description) {
                    <span class="item-desc">{{ item.description }}</span>
                  }
                  <div class="item-chips">
                    @for (s of (item.stations || []); track s) {
                      <span class="chip chip-station"
                        [style.background]="station(s).bg"
                        [style.color]="station(s).color">
                        {{ station(s).label }}
                      </span>
                    }
                    @for (t of (item.dietaryTags || []); track t) {
                      <span class="chip chip-diet">{{ dietLabel(t) }}</span>
                    }
                    @for (a of (item.allergens || []); track a) {
                      <span class="chip chip-warn">⚠ {{ allergenLabel(a) }}</span>
                    }
                  </div>
                </div>

                <!-- Category -->
                <span class="item-cat">{{ catName(item.categoryId) }}</span>

                <!-- Price -->
                <span class="item-price">S/. {{ item.price | number:'1.2-2' }}</span>

                <!-- Status pill -->
                <span class="status-pill" [class.pill-on]="item.isAvailable" [class.pill-off]="!item.isAvailable">
                  {{ item.isAvailable ? 'Disponible' : '86' }}
                </span>

                <!-- Actions -->
                <div class="item-acts">
                  <button class="act-btn" (click)="openItemForm(item)" aria-label="Editar ítem"><lucide-icon [img]="Pencil" [size]="14"></lucide-icon></button>
                  <button class="act-btn act-del" (click)="deleteItem(item._id)" aria-label="Eliminar ítem"><lucide-icon [img]="Trash2" [size]="14"></lucide-icon></button>
                </div>
              </div>
            }
          </div>
        }
      </main>
    </div>
  }
</div>

<!-- ══ DRAWER: Categoría ══ -->
@if (showCategoryForm()) {
  <div class="drawer-backdrop" (click)="closeCategoryForm()"></div>
  <div class="drawer animate-slide-in" role="dialog" aria-modal="true">
    <div class="drawer-head">
      <h3>{{ editingCategory() ? 'Editar categoría' : 'Nueva categoría' }}</h3>
      <button class="drawer-close" (click)="closeCategoryForm()" aria-label="Cerrar formulario">✕</button>
    </div>
    <div class="drawer-body">
      <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()">
        <div class="field">
          <label>Nombre *</label>
          <input class="input" formControlName="name" placeholder="ej. Entradas, Principales, Bebidas..." autofocus />
          @if (showCategoryFieldError('name')) {
            <span class="field-hint-error">El nombre es obligatorio.</span>
          }
        </div>
        <div class="field">
          <label>Descripción</label>
          <input class="input" formControlName="description" placeholder="Opcional" />
        </div>
        <div class="drawer-actions">
          <button type="button" class="btn btn-secondary" (click)="closeCategoryForm()">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving() || categoryForm.invalid">
            {{ saving() ? 'Guardando...' : 'Guardar categoría' }}
          </button>
        </div>
      </form>
    </div>
  </div>
}

<!-- ══ DRAWER: Ítem ══ -->
@if (showItemForm()) {
  <div class="drawer-backdrop" (click)="closeItemForm()"></div>
  <div class="drawer drawer-wide animate-slide-in" role="dialog" aria-modal="true">
    <div class="drawer-head">
      <div>
        <h3>{{ editingItem() ? 'Editar ítem' : 'Nuevo ítem' }}</h3>
        <p class="drawer-sub">{{ selectedCategory()?.name ?? 'Sin categoría' }}</p>
      </div>
      <button class="drawer-close" (click)="closeItemForm()" aria-label="Cerrar formulario">✕</button>
    </div>
    <div class="drawer-body">
      <form [formGroup]="itemForm" (ngSubmit)="saveItem()">

        <div class="field-section-label">Información básica</div>

        <div class="field">
          <label>Nombre del ítem *</label>
          <input class="input" formControlName="name" placeholder="ej. Lomo Saltado" autofocus />
          @if (showItemFieldError('name')) {
            <span class="field-hint-error">El nombre es obligatorio.</span>
          }
        </div>

        <div class="field">
          <label>Descripción</label>
          <textarea class="input" formControlName="description" rows="2"
            placeholder="Breve descripción del plato, ingredientes principales..."></textarea>
        </div>

        <div class="fields-row">
          <div class="field">
            <label>Precio (S/.) *</label>
            <div class="input-prefix-wrap">
              <span class="input-prefix">S/.</span>
              <input class="input input-with-prefix" type="number" formControlName="price"
                placeholder="0.00" min="0" step="0.50" />
            </div>
            @if (showItemFieldError('price')) {
              <span class="field-hint-error">El precio debe ser mayor o igual a 0.</span>
            }
          </div>
          <div class="field">
            <label>Categoría *</label>
            <select class="input" formControlName="categoryId">
              @for (cat of categories(); track cat._id) {
                <option [value]="cat._id">{{ cat.name }}</option>
              }
            </select>
            @if (showItemFieldError('categoryId')) {
              <span class="field-hint-error">Selecciona una categoría.</span>
            }
          </div>
        </div>

        <div class="field-section-label" style="margin-top:24px">Estaciones de preparación</div>
        <p class="field-hint">¿A qué estación(es) llega este ítem cuando se ordena?</p>
        <div class="pill-group">
          @for (s of stationKeys; track s) {
            <button type="button"
              class="pill"
              [class.pill-selected]="isStationSelected(s)"
              [style.--pill-bg]="station(s).bg"
              [style.--pill-color]="station(s).color"
              (click)="toggleStation(s)">
              {{ station(s).label }}
            </button>
          }
        </div>

        <div class="field-section-label" style="margin-top:24px">Tags dietéticos</div>
        <div class="pill-group">
          @for (t of dietaryKeys; track t) {
            <button type="button" class="pill pill-diet" [class.pill-selected]="isDietarySelected(t)" (click)="toggleDietary(t)">
              {{ DIETARY_LABELS[t] }}
            </button>
          }
        </div>

        <div class="field-section-label" style="margin-top:24px">Alérgenos</div>
        <div class="pill-group">
          @for (a of allergenKeys; track a) {
            <button type="button" class="pill pill-warn" [class.pill-selected]="isAllergenSelected(a)" (click)="toggleAllergen(a)">
              {{ allergenLabel(a) }}
            </button>
          }
        </div>

        <div class="drawer-actions">
          <button type="button" class="btn btn-secondary" (click)="closeItemForm()">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving() || itemForm.invalid">
            {{ saving() ? 'Guardando...' : (editingItem() ? 'Guardar cambios' : 'Crear ítem') }}
          </button>
        </div>
      </form>
    </div>
  </div>
}
  `,
  styles: [`
    /* ── Page ── */
    .menu-page { padding: 36px 40px; width: 100%; box-sizing: border-box; }

    /* ── Topbar ── */
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; gap: 20px; }
    .topbar h1 { font-size: 24px; margin-bottom: 2px; }
    .subtitle { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .local-picker {
      display: flex; align-items: center; gap: 8px;
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); padding: 0 12px; height: 38px;
    }
    .local-picker-icon { font-size: 14px; color: var(--color-text-muted); }
    .local-select {
      border: none; outline: none; background: transparent; font-size: 14px;
      color: var(--color-text-main); min-width: 200px; cursor: pointer;
    }

    /* ── Stats bar ── */
    .stats-bar {
      display: flex; align-items: center; gap: 0;
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); padding: 0 8px;
      margin-bottom: 20px; width: fit-content;
    }
    .stat { display: flex; align-items: center; gap: 8px; padding: 12px 20px; }
    .stat-num { font-size: 18px; font-weight: 700; font-family: var(--font-heading); color: var(--color-text-main); }
    .stat-num.green { color: var(--color-success); }
    .stat-num.red { color: var(--color-error); }
    .stat-lbl { font-size: 12px; color: var(--color-text-muted); white-space: nowrap; }
    .stat-divider { width: 1px; height: 28px; background: var(--color-border); }

    /* ── Layout ── */
    .layout { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }

    /* ── Sidebar ── */
    .sidebar { padding: 0; overflow: hidden; }
    .sidebar-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px 10px; border-bottom: 1px solid var(--color-border);
    }
    .sidebar-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-muted); }
    .add-cat-btn {
      width: 24px; height: 24px; border-radius: 6px; border: 1px dashed var(--color-border);
      background: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 16px; color: var(--color-text-muted); transition: all var(--transition-fast);
    }
    .add-cat-btn:hover { border-color: var(--color-brand); color: var(--color-brand); background: #FFF1F1; }

    .cat-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 16px; cursor: pointer; border-left: 3px solid transparent;
      transition: all var(--transition-fast); border-bottom: 1px solid var(--color-border);
    }
    .cat-row:last-of-type { border-bottom: none; }
    .cat-row:hover { background: var(--color-bg-light); }
    .cat-row.active { border-left-color: var(--color-brand); background: #FFF8F8; }
    .cat-row.active .cat-row-name { color: var(--color-brand); font-weight: 600; }
    .cat-row-name { font-size: 13px; color: var(--color-text-main); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cat-row-right { display: flex; align-items: center; gap: 4px; }
    .cat-count {
      font-size: 11px; font-weight: 600; color: var(--color-text-muted);
      background: var(--color-bg-light); border: 1px solid var(--color-border);
      padding: 1px 6px; border-radius: 10px; min-width: 20px; text-align: center;
    }
    .cat-row.active .cat-count { background: #FFE4E4; color: var(--color-brand); border-color: #FECACA; }
    .cat-acts { display: flex; gap: 2px; opacity: 0; transition: opacity var(--transition-fast); }
    .cat-row:hover .cat-acts { opacity: 1; }
    .cat-acts button {
      background: none; border: none; cursor: pointer; font-size: 11px; padding: 2px 5px;
      border-radius: 3px; color: var(--color-text-muted); line-height: 1;
    }
    .cat-acts button:hover { background: var(--color-bg-light); color: var(--color-text-main); }
    .cat-acts button.del:hover { background: #FEF2F2; color: var(--color-error); }
    .sidebar-empty { padding: 20px 16px; font-size: 12px; color: var(--color-text-muted); line-height: 1.6; margin: 0; }

    /* ── Items area ── */
    .items-area { min-height: 400px; }

    .toolbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-bottom: 12px;
    }
    .toolbar-left { display: flex; align-items: center; gap: 10px; }
    .section-title { font-size: 15px; font-weight: 600; }
    .item-badge {
      font-size: 11px; font-weight: 600; color: var(--color-text-muted);
      background: var(--color-bg-light); border: 1px solid var(--color-border);
      padding: 2px 8px; border-radius: 12px;
    }
    .toolbar-right { display: flex; align-items: center; gap: 8px; }
    .search-wrap {
      display: flex; align-items: center; gap: 8px;
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-sm); padding: 0 12px; height: 34px;
      transition: border-color var(--transition-fast);
    }
    .search-wrap:focus-within { border-color: var(--color-brand); }
    .search-icon { font-size: 14px; color: var(--color-text-muted); }
    .search-input { border: none; outline: none; font-size: 13px; background: transparent; width: 180px; }
    .btn-sm { padding: 7px 14px; font-size: 13px; }

    /* ── Items list ── */
    .items-list { display: flex; flex-direction: column; gap: 0; background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }

    .item-row {
      display: grid;
      grid-template-columns: 44px 1fr 110px 72px 80px 72px;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border);
      transition: background var(--transition-fast);
    }
    .item-row:last-child { border-bottom: none; }
    .item-row:hover { background: #FAFAFA; }
    .item-row.off { opacity: 0.5; }

    /* ── CSS Toggle switch ── */
    .sw {
      width: 36px; height: 20px; border-radius: 10px; background: #E2E8F0;
      position: relative; cursor: pointer; flex-shrink: 0;
      transition: background var(--transition-fast);
      border: none; padding: 0; appearance: none; -webkit-appearance: none;
    }
    .sw:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
    .sw.sw-on { background: var(--color-success); }
    .sw-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 14px; height: 14px; border-radius: 50%; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: transform 150ms ease;
    }
    .sw.sw-on .sw-thumb { transform: translateX(16px); }

    .item-info { min-width: 0; }
    .item-name { display: block; font-size: 14px; font-weight: 600; color: var(--color-text-main); margin-bottom: 2px; }
    .item-desc { display: block; font-size: 12px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
    .item-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { display: inline-block; padding: 2px 7px; border-radius: 9px; font-size: 10px; font-weight: 600; }
    .chip-station { }
    .chip-diet { background: #F0FDF4; color: #15803D; }
    .chip-warn { background: #FFFBEB; color: #B45309; }

    .item-cat { font-size: 12px; color: var(--color-text-muted); text-align: center; }
    .item-price { font-size: 14px; font-weight: 700; color: var(--color-text-main); text-align: right; }

    .status-pill { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; text-align: center; }
    .pill-on { background: #DCFCE7; color: #15803D; }
    .pill-off { background: #FEE2E2; color: #B91C1C; }

    .item-acts { display: flex; gap: 4px; justify-content: flex-end; }
    .act-btn {
      background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      font-size: 12px; cursor: pointer; color: var(--color-text-muted);
      transition: all var(--transition-fast);
    }
    .act-btn:hover { background: var(--color-bg-light); color: var(--color-text-main); }
    .act-del:hover { background: #FEF2F2; color: var(--color-error); border-color: #FECACA; }

    /* ── Empty / loading states ── */
    .splash { text-align: center; padding: 80px 40px; max-width: 400px; margin: 40px auto; }
    .splash-icon { font-size: 48px; margin-bottom: 16px; }
    .splash h3 { margin-bottom: 8px; }
    .splash p { color: var(--color-text-muted); font-size: 14px; }

    .empty-items { text-align: center; padding: 60px 32px; background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .empty-icon { font-size: 36px; margin-bottom: 12px; }
    .empty-items p { color: var(--color-text-muted); font-size: 14px; margin-bottom: 16px; }

    .list-placeholder { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    .skeleton-row {
      height: 64px; background: linear-gradient(90deg, var(--color-bg-light) 25%, #fff 50%, var(--color-bg-light) 75%);
      background-size: 400% 100%; animation: shimmer 1.4s infinite;
    }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    /* ── Drawer ── */
    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,0.35);
      z-index: 200; backdrop-filter: blur(2px);
    }
    .drawer {
      position: fixed; top: 0; right: 0; height: 100vh; width: 420px;
      background: var(--color-white); z-index: 201;
      box-shadow: -8px 0 40px rgba(0,0,0,0.12);
      display: flex; flex-direction: column;
      transform: translateX(0);
    }
    .drawer-wide { width: 520px; }
    .animate-slide-in { animation: slideIn 220ms cubic-bezier(.16,1,.3,1); }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .drawer-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 24px 28px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .drawer-head h3 { margin: 0 0 2px; font-size: 17px; }
    .drawer-sub { font-size: 12px; color: var(--color-text-muted); margin: 0; }
    .drawer-close {
      background: none; border: none; font-size: 16px; cursor: pointer;
      color: var(--color-text-muted); width: 32px; height: 32px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: all var(--transition-fast);
    }
    .drawer-close:hover { background: var(--color-bg-light); color: var(--color-text-main); }

    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; color: var(--color-text-muted); margin-bottom: 6px; }
    .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-muted); margin-bottom: 8px; }
    .field-hint { font-size: 12px; color: var(--color-text-muted); margin-top: -4px; margin-bottom: 10px; }
    .field-hint-error { display: block; margin-top: 6px; font-size: 12px; color: var(--color-error); }

    .input-prefix-wrap { display: flex; align-items: center; }
    .input-prefix {
      background: var(--color-bg-light); border: 1px solid var(--color-border); border-right: none;
      padding: 0 10px; height: 38px; display: flex; align-items: center;
      font-size: 13px; color: var(--color-text-muted); border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    }
    .input-with-prefix { border-radius: 0 var(--radius-sm) var(--radius-sm) 0 !important; }

    /* ── Pill selectors ── */
    .pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--color-border); background: var(--color-bg-light);
      color: var(--color-text-muted); cursor: pointer;
      transition: all var(--transition-fast);
    }
    .pill:hover { border-color: var(--color-text-muted); color: var(--color-text-main); }
    .pill.pill-selected {
      background: var(--pill-bg, var(--color-brand));
      color: var(--pill-color, white);
      border-color: transparent;
      font-weight: 600;
    }
    .pill-diet.pill-selected { background: #DCFCE7; color: #15803D; border-color: #BBF7D0; }
    .pill-warn.pill-selected { background: #FFFBEB; color: #B45309; border-color: #FDE68A; }

    .drawer-actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 24px; margin-top: 8px; border-top: 1px solid var(--color-border); }
  `],
})
export class MenuComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly DIETARY_LABELS = DIETARY_LABELS;

  locals   = signal<any[]>([]);
  localId  = signal<string>('');
  
  // Icons
  readonly Store = Store;
  readonly UtensilsCrossed = UtensilsCrossed;
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;
  categories    = signal<any[]>([]);
  items         = signal<any[]>([]);
  selectedCategoryId = signal<string | null>(null);
  loadingItems  = signal(false);
  searchQuery   = signal('');

  showCategoryForm = signal(false);
  showItemForm     = signal(false);
  editingCategory  = signal<any>(null);
  editingItem      = signal<any>(null);
  saving    = signal(false);

  selectedStations = signal<string[]>(['kitchen']);
  selectedDietary  = signal<string[]>([]);
  selectedAllergens = signal<string[]>([]);

  readonly stationKeys  = Object.keys(STATION_META);
  readonly dietaryKeys  = Object.keys(DIETARY_LABELS);
  readonly allergenKeys = Object.keys(ALLERGEN_LABELS);

  selectedCategory = computed(() => this.categories().find(c => c._id === this.selectedCategoryId()) ?? null);

  availableCount   = computed(() => this.items().filter(i => i.isAvailable).length);
  unavailableCount = computed(() => this.items().filter(i => !i.isAvailable).length);

  filteredItems = computed(() => {
    const catId = this.selectedCategoryId();
    if (!catId) return this.items();
    return this.items().filter(i =>
      i.categoryId === catId || i.categoryId?._id === catId || i.categoryId?.toString() === catId,
    );
  });

  visibleItems = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.filteredItems();
    return this.filteredItems().filter(i =>
      i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q),
    );
  });

  categoryForm = this.fb.group({ name: ['', Validators.required], description: [''] });
  itemForm = this.fb.group({
    name:        ['', Validators.required],
    description: [''],
    price:       [0, [Validators.required, Validators.min(0)]],
    categoryId:  ['', Validators.required],
  });

  ngOnInit() {
    this.http.get<any[]>(`${API}/locals`).subscribe({ next: d => this.locals.set(d) });
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.showItemForm()) { this.closeItemForm(); return; }
    if (this.showCategoryForm()) this.closeCategoryForm();
  }

  onLocalChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    this.localId.set(id);
    this.selectedCategoryId.set(null);
    this.searchQuery.set('');
    if (id) { this.loadCategories(); this.loadItems(); }
    else    { this.categories.set([]); this.items.set([]); }
  }

  loadCategories() {
    this.http.get<any[]>(`${API}/menu/categories?localId=${this.localId()}`).subscribe({ next: d => this.categories.set(d) });
  }

  loadItems() {
    this.loadingItems.set(true);
    this.http.get<any[]>(`${API}/menu/items?localId=${this.localId()}`).subscribe({
      next: d => { this.items.set(d); this.loadingItems.set(false); },
      error: () => this.loadingItems.set(false),
    });
  }

  selectCategory(id: string) {
    this.selectedCategoryId.set(this.selectedCategoryId() === id ? null : id);
    this.searchQuery.set('');
  }

  countForCategory(catId: string) {
    return this.items().filter(i =>
      i.categoryId === catId || i.categoryId?._id === catId || i.categoryId?.toString() === catId,
    ).length;
  }

  catName(catId: any) {
    const id = catId?._id ?? catId?.toString?.() ?? catId;
    return this.categories().find(c => c._id === id)?.name ?? '—';
  }

  // ── Categories ──────────────────────────────────────────────────────────

  openCategoryForm(cat: any) {
    this.editingCategory.set(cat);
    if (cat) {
      this.categoryForm.patchValue({ name: cat.name, description: cat.description || '' });
    } else {
      this.categoryForm.reset();
    }
    this.showCategoryForm.set(true);
  }

  closeCategoryForm() { this.showCategoryForm.set(false); this.editingCategory.set(null); this.categoryForm.reset(); }

  showCategoryFieldError(name: string): boolean {
    const c = this.categoryForm.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  showItemFieldError(name: string): boolean {
    const c = this.itemForm.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  saveCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const ed = this.editingCategory();
    const body = { ...this.categoryForm.value, localId: this.localId() };
    const req = ed ? this.http.patch(`${API}/menu/categories/${ed._id}`, body)
                   : this.http.post(`${API}/menu/categories`, body);
    req.subscribe({
      next: () => {
        this.toast.success(ed ? 'Categoría actualizada' : 'Categoría creada');
        this.closeCategoryForm(); this.loadCategories(); this.saving.set(false);
      },
      error: err => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  async deleteCategory(id: string) {
    const ok = await this.confirm.confirm({
      title: '¿Eliminar categoría?',
      message: 'Se eliminarán también todos sus ítems. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/menu/categories/${id}`).subscribe({ next: () => {
      this.toast.success('Categoría eliminada');
      if (this.selectedCategoryId() === id) this.selectedCategoryId.set(null);
      this.loadCategories(); this.loadItems();
    }});
  }

  // ── Items ────────────────────────────────────────────────────────────────

  openItemForm(item: any) {
    this.editingItem.set(item);
    const catId = item?.categoryId || this.selectedCategoryId() || '';
    if (item) {
      this.itemForm.patchValue({ name: item.name, description: item.description || '', price: item.price, categoryId: catId });
      this.selectedStations.set([...(item.stations || ['kitchen'])]);
      this.selectedDietary.set([...(item.dietaryTags || [])]);
      this.selectedAllergens.set([...(item.allergens || [])]);
    } else {
      this.itemForm.reset({ categoryId: catId, price: 0 });
      this.selectedStations.set(['kitchen']);
      this.selectedDietary.set([]); this.selectedAllergens.set([]);
    }
    this.showItemForm.set(true);
  }

  closeItemForm() { this.showItemForm.set(false); this.editingItem.set(null); this.itemForm.reset(); }

  saveItem() {
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const ed = this.editingItem();
    const body = { ...this.itemForm.value, localId: this.localId(), stations: this.selectedStations(), dietaryTags: this.selectedDietary(), allergens: this.selectedAllergens() };
    const req = ed ? this.http.patch(`${API}/menu/items/${ed._id}`, body)
                   : this.http.post(`${API}/menu/items`, body);
    req.subscribe({
      next: () => {
        this.toast.success(ed ? 'Ítem actualizado' : 'Ítem creado');
        this.closeItemForm(); this.loadItems(); this.saving.set(false);
      },
      error: err => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  async deleteItem(id: string) {
    const ok = await this.confirm.confirm({
      title: '¿Eliminar ítem?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/menu/items/${id}`).subscribe({
      next: () => { this.toast.success('Ítem eliminado'); this.loadItems(); },
    });
  }

  toggleAvailability(item: any) {
    this.http.patch(`${API}/menu/items/${item._id}/availability`, {}).subscribe({
      next: (u: any) => this.items.update(list => list.map(i => i._id === item._id ? u : i)),
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  station(s: string) { return STATION_META[s] || { label: s, bg: '#F8FAFC', color: '#64748B', icon: '◆' }; }
  dietLabel(t: string)    { return DIETARY_LABELS[t]?.replace(/^\S+\s/, '') || t; }
  allergenLabel(a: string){ return ALLERGEN_LABELS[a] || a; }

  isStationSelected(s: string)  { return this.selectedStations().includes(s); }
  toggleStation(s: string)      { this.selectedStations.update(a => a.includes(s) ? a.filter(x=>x!==s) : [...a,s]); }
  isDietarySelected(t: string)  { return this.selectedDietary().includes(t); }
  toggleDietary(t: string)      { this.selectedDietary.update(a => a.includes(t) ? a.filter(x=>x!==t) : [...a,t]); }
  isAllergenSelected(a: string) { return this.selectedAllergens().includes(a); }
  toggleAllergen(a: string)     { this.selectedAllergens.update(a2 => a2.includes(a) ? a2.filter(x=>x!==a) : [...a2,a]); }
}
