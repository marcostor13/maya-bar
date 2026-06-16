import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface MenuCategory { _id: string; name: string; sortOrder: number; }
interface Variant { name: string; options: { label: string; priceModifier: number }[]; }
interface Modifier { name: string; required: boolean; options: { label: string; price: number }[]; }
interface MenuItem {
  _id: string; categoryId: string; name: string; description?: string;
  price: number; photos: string[]; variants: Variant[]; modifiers: Modifier[];
  allergens: string[]; dietaryTags: string[]; stations: string[]; isAvailable: boolean;
}
interface LocalInfo { _id: string; name: string; type: string; address?: string; }
interface CartItem {
  itemId: string; name: string; price: number; quantity: number;
  notes: string; stations: string[]; subtotal: number;
}

const DIET_ICONS: Record<string, string> = {
  vegetarian: '🌿', vegan: '🌱', 'gluten-free': '🌾', spicy: '🌶', 'sugar-free': '🍃',
};

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [],
  template: `
    <div class="pub-page">
      @if (loading()) {
        <div class="pub-loading">
          <div class="spinner"></div>
          <p>Cargando carta...</p>
        </div>
      } @else if (error()) {
        <div class="pub-error">
          <div class="error-icon">✕</div>
          <h2>Local no disponible</h2>
          <p>{{ error() }}</p>
        </div>
      } @else {
        <!-- Header -->
        <header class="pub-header">
          <div class="pub-local-name">{{ local()?.name }}</div>
          <div class="pub-table">Mesa {{ tableNumber() }}</div>
        </header>

        <!-- Category nav -->
        <nav class="cat-nav">
          @for (cat of categories(); track cat._id) {
            <button
              class="cat-btn"
              [class.active]="activeCatId() === cat._id"
              (click)="activeCatId.set(cat._id)"
            >
              {{ cat.name }}
            </button>
          }
        </nav>

        <!-- Items -->
        <main class="pub-items">
          @for (item of filteredItems(); track item._id) {
            <div class="item-card" [class.item-unavailable]="!item.isAvailable">
              <div class="item-info">
                <div class="item-name-row">
                  <span class="item-name">{{ item.name }}</span>
                  @if (!item.isAvailable) {
                    <span class="item-86">Agotado</span>
                  }
                </div>
                @if (item.description) {
                  <p class="item-desc">{{ item.description }}</p>
                }
                <div class="item-tags">
                  @for (tag of item.dietaryTags; track tag) {
                    <span class="item-tag" [title]="tag">{{ dietIcon(tag) }}</span>
                  }
                  @for (al of item.allergens; track al) {
                    <span class="item-allergen" [title]="al">⚠ {{ al }}</span>
                  }
                </div>
                <div class="item-price">S/. {{ item.price.toFixed(2) }}</div>
              </div>
              @if (item.photos.length > 0) {
                <img [src]="item.photos[0]" [alt]="item.name" class="item-photo" />
              }
              <button
                class="add-btn"
                [disabled]="!item.isAvailable"
                (click)="addToCart(item)"
                [attr.aria-label]="'Agregar ' + item.name + ' al carrito'"
              >
                +
              </button>
            </div>
          }
        </main>

        <!-- Cart FAB -->
        @if (cartCount() > 0) {
          <div class="cart-fab" (click)="showCart.set(true)" role="button" tabindex="0"
            aria-label="Ver carrito">
            <span class="cart-icon">🛒</span>
            <span class="cart-badge">{{ cartCount() }}</span>
            <span class="cart-total">S/. {{ cartTotal().toFixed(2) }}</span>
          </div>
        }

        <!-- Cart drawer -->
        @if (showCart()) {
          <div class="drawer-backdrop" (click)="showCart.set(false)"></div>
          <div class="drawer animate-slide-in" role="dialog" aria-modal="true">
            <div class="drawer-head">
              <h3>Tu pedido</h3>
              <button class="drawer-close" (click)="showCart.set(false)" aria-label="Cerrar carrito">✕</button>
            </div>
            <div class="drawer-body">
              @for (ci of cart(); track ci.itemId) {
                <div class="cart-row">
                  <div class="cart-item-info">
                    <span class="cart-item-name">{{ ci.name }}</span>
                    <span class="cart-item-price">S/. {{ ci.subtotal.toFixed(2) }}</span>
                  </div>
                  <div class="cart-item-controls">
                    <button class="qty-btn" (click)="decreaseQty(ci)" aria-label="Reducir cantidad">−</button>
                    <span class="qty-val">{{ ci.quantity }}</span>
                    <button class="qty-btn" (click)="increaseQty(ci)" aria-label="Aumentar cantidad">+</button>
                  </div>
                  <input
                    class="notes-input input"
                    [value]="ci.notes"
                    (input)="setNotes(ci, $event)"
                    placeholder="Notas (sin cebolla...)"
                    aria-label="Notas para este ítem"
                  />
                </div>
              }
              <div class="cart-summary">
                <span>Total</span>
                <span class="cart-total-big">S/. {{ cartTotal().toFixed(2) }}</span>
              </div>
              <div class="cart-actions">
                <button class="btn btn-primary submit-btn" (click)="submitOrder()" [disabled]="submitting()">
                  {{ submitting() ? 'Enviando...' : 'Enviar pedido' }}
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Order sent confirmation -->
        @if (orderId()) {
          <div class="overlay">
            <div class="confirm-card animate-scale-in">
              <div class="confirm-icon">✓</div>
              <h3>¡Pedido enviado!</h3>
              <p>Tu pedido está siendo preparado. Puedes seguir el estado a continuación.</p>
              <button class="btn btn-primary" (click)="goToTracking()">Ver estado del pedido</button>
              <button class="btn btn-secondary" (click)="orderId.set('')" style="margin-top:8px">Seguir pidiendo</button>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .pub-page { min-height: 100vh; background: var(--color-bg-light); padding-bottom: 100px; font-family: var(--font-base); }

    /* Loading/error */
    .pub-loading, .pub-error { display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; gap: 16px; color: var(--color-text-muted); }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--color-border); border-top-color: var(--color-brand);
      border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-icon { font-size: 40px; color: var(--color-error); }
    .pub-error h2 { font-size: 20px; color: var(--color-text-main); }

    /* Header */
    .pub-header { background: white; padding: 16px 20px; border-bottom: 1px solid var(--color-border);
      display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .pub-local-name { font-size: 16px; font-weight: 700; color: var(--color-text-main); }
    .pub-table { font-size: 13px; font-weight: 600; color: var(--color-brand);
      background: var(--color-brand-light); padding: 4px 10px; border-radius: 20px; }

    /* Category nav */
    .cat-nav { display: flex; gap: 6px; padding: 12px 16px; overflow-x: auto;
      background: white; border-bottom: 1px solid var(--color-border); -webkit-overflow-scrolling: touch; }
    .cat-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--color-border);
      background: none; font-size: 13px; font-weight: 500; cursor: pointer;
      color: var(--color-text-muted); white-space: nowrap; transition: all var(--transition-fast); }
    .cat-btn.active { background: var(--color-brand); color: white; border-color: var(--color-brand); }
    .cat-btn:hover:not(.active) { background: var(--color-bg-light); }

    /* Items */
    .pub-items { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
    .item-card {
      background: white; border-radius: var(--radius-md); padding: 14px 16px;
      display: flex; align-items: flex-start; gap: 12px; position: relative;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .item-unavailable { opacity: 0.5; }
    .item-info { flex: 1; }
    .item-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .item-name { font-size: 15px; font-weight: 600; color: var(--color-text-main); }
    .item-86 { font-size: 11px; background: #FEF2F2; color: var(--color-error); padding: 2px 7px; border-radius: 20px; font-weight: 600; }
    .item-desc { font-size: 13px; color: var(--color-text-muted); margin: 0 0 6px; line-height: 1.5; }
    .item-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
    .item-tag { font-size: 14px; }
    .item-allergen { font-size: 11px; color: #D97706; background: #FEF3C7; padding: 1px 6px; border-radius: 20px; }
    .item-price { font-size: 15px; font-weight: 700; color: var(--color-brand); }
    .item-photo { width: 80px; height: 80px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; }
    .add-btn {
      position: absolute; bottom: 12px; right: 12px;
      width: 32px; height: 32px; border-radius: 50%; border: none;
      background: var(--color-brand); color: white; font-size: 20px; line-height: 1;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background var(--transition-fast);
    }
    .add-btn:hover:not(:disabled) { background: #3B4EF8; }
    .add-btn:disabled { background: var(--color-bg-light); color: var(--color-text-muted); cursor: not-allowed; }

    /* Cart FAB */
    .cart-fab {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--color-brand); color: white; border-radius: 32px;
      padding: 12px 20px; display: flex; align-items: center; gap: 10px;
      box-shadow: 0 4px 20px rgba(82,97,220,0.35); cursor: pointer;
      font-size: 15px; font-weight: 600; z-index: 50;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }
    .cart-fab:hover { box-shadow: 0 6px 24px rgba(82,97,220,0.45); }
    .cart-icon { font-size: 18px; }
    .cart-badge { background: white; color: var(--color-brand); border-radius: 50%;
      width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; }
    .cart-total { font-size: 14px; }

    /* Cart drawer */
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); z-index: 200; }
    .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 100%; max-width: 420px;
      background: white; z-index: 201; box-shadow: -8px 0 40px rgba(0,0,0,0.12);
      display: flex; flex-direction: column; }
    .animate-slide-in { animation: slideIn 220ms cubic-bezier(.16,1,.3,1); }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-head { display: flex; align-items: center; justify-content: space-between;
      padding: 20px 20px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-head h3 { margin: 0; font-size: 17px; }
    .drawer-close { background: none; border: none; font-size: 16px; cursor: pointer;
      color: var(--color-text-muted); padding: 4px 8px; border-radius: 4px; }
    .drawer-close:hover { background: var(--color-bg-light); }
    .drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }

    .cart-row { background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 12px; }
    .cart-item-info { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .cart-item-name { font-weight: 500; font-size: 14px; }
    .cart-item-price { font-weight: 600; color: var(--color-brand); }
    .cart-item-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .qty-btn { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--color-border);
      background: white; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
    .qty-btn:hover { background: var(--color-brand); color: white; border-color: var(--color-brand); }
    .qty-val { font-size: 15px; font-weight: 600; min-width: 20px; text-align: center; }
    .notes-input { font-size: 13px; width: 100%; box-sizing: border-box; }

    .cart-summary { display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0; border-top: 1px solid var(--color-border); margin-top: 4px; font-weight: 500; }
    .cart-total-big { font-size: 18px; font-weight: 700; color: var(--color-brand); }
    .cart-actions { padding-bottom: 8px; }
    .submit-btn { width: 100%; padding: 14px; font-size: 16px; }

    /* Order confirmation overlay */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;
      z-index: 300; padding: 16px; }
    .confirm-card { background: white; border-radius: 16px; padding: 32px; max-width: 360px; width: 100%;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 12px; }
    .confirm-icon { font-size: 36px; color: var(--color-success); }
    .confirm-card h3 { font-size: 20px; margin: 0; }
    .confirm-card p { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .animate-scale-in { animation: scaleIn 200ms ease forwards; }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
  `],
})
export class PublicMenuComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  error = signal('');
  local = signal<LocalInfo | null>(null);
  categories = signal<MenuCategory[]>([]);
  items = signal<MenuItem[]>([]);
  activeCatId = signal('');
  cart = signal<CartItem[]>([]);
  showCart = signal(false);
  submitting = signal(false);
  orderId = signal('');

  localId = '';
  tableNumber = signal('');

  filteredItems = computed(() => {
    const catId = this.activeCatId();
    return this.items().filter((i) => i.categoryId === catId);
  });

  cartCount = computed(() => this.cart().reduce((s, i) => s + i.quantity, 0));
  cartTotal = computed(() => this.cart().reduce((s, i) => s + i.subtotal, 0));

  ngOnInit() {
    this.localId = this.route.snapshot.paramMap.get('localId') ?? '';
    this.tableNumber.set(this.route.snapshot.paramMap.get('table') ?? '?');
    this.loadMenu();
  }

  loadMenu() {
    if (!this.localId) { this.error.set('Local no especificado'); this.loading.set(false); return; }
    this.http.get<{ local: LocalInfo; categories: MenuCategory[]; items: MenuItem[] }>(
      `${API}/public/menu`, { params: { localId: this.localId } }
    ).subscribe({
      next: (data) => {
        this.local.set(data.local);
        this.categories.set(data.categories);
        this.items.set(data.items);
        if (data.categories.length > 0) this.activeCatId.set(data.categories[0]._id);
        this.loading.set(false);
      },
      error: () => { this.error.set('No se pudo cargar la carta.'); this.loading.set(false); },
    });
  }

  dietIcon(tag: string): string {
    return DIET_ICONS[tag] ?? '•';
  }

  addToCart(item: MenuItem) {
    const existing = this.cart().find((c) => c.itemId === item._id);
    if (existing) {
      this.cart.update((c) =>
        c.map((ci) =>
          ci.itemId === item._id
            ? { ...ci, quantity: ci.quantity + 1, subtotal: item.price * (ci.quantity + 1) }
            : ci,
        ),
      );
    } else {
      this.cart.update((c) => [
        ...c,
        { itemId: item._id, name: item.name, price: item.price, quantity: 1, notes: '', stations: item.stations, subtotal: item.price },
      ]);
    }
  }

  increaseQty(ci: CartItem) {
    this.cart.update((c) =>
      c.map((x) =>
        x.itemId === ci.itemId
          ? { ...x, quantity: x.quantity + 1, subtotal: x.price * (x.quantity + 1) }
          : x,
      ),
    );
  }

  decreaseQty(ci: CartItem) {
    if (ci.quantity === 1) {
      this.cart.update((c) => c.filter((x) => x.itemId !== ci.itemId));
    } else {
      this.cart.update((c) =>
        c.map((x) =>
          x.itemId === ci.itemId
            ? { ...x, quantity: x.quantity - 1, subtotal: x.price * (x.quantity - 1) }
            : x,
        ),
      );
    }
  }

  setNotes(ci: CartItem, event: Event) {
    const notes = (event.target as HTMLInputElement).value;
    this.cart.update((c) => c.map((x) => (x.itemId === ci.itemId ? { ...x, notes } : x)));
  }

  submitOrder() {
    if (this.cart().length === 0) return;
    this.submitting.set(true);
    const body = {
      localId: this.localId,
      tableNumber: this.tableNumber(),
      type: 'dine-in',
      items: this.cart().map((ci) => ({
        itemId: ci.itemId, name: ci.name, price: ci.price,
        quantity: ci.quantity, notes: ci.notes, stations: ci.stations,
      })),
    };
    this.http.post<{ _id: string }>(`${API}/public/orders`, body).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.showCart.set(false);
        this.cart.set([]);
        this.orderId.set(res._id);
      },
      error: () => { this.submitting.set(false); },
    });
  }

  goToTracking() {
    this.router.navigate(['/track', this.orderId()]);
  }
}
