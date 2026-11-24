import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { LucideAngularModule, Package, Plus, Pencil, Trash2, Download, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { Product, ProductInput, QuotesApiService } from '../../core/api/quotes-api.service';

const EMPTY: ProductInput = { name: '', price: 0, taxIncluded: true, unit: 'unidad' };

/** Catálogo de productos y servicios para cotizar (HU68). */
@Component({
  selector: 'app-products-settings',
  standalone: true,
  imports: [LucideAngularModule, FormsModule, DecimalPipe],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Package" [size]="22"></lucide-icon></div>
        <div>
          <h2 class="section-title">Productos y servicios</h2>
          <p class="section-desc">Tu catálogo para armar cotizaciones desde cada oportunidad.</p>
        </div>
      </div>

      <div class="toolbar">
        <button type="button" class="btn btn-primary btn-sm" (click)="openNew()">
          <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Nuevo producto
        </button>
        <div class="woo">
          <input class="input" [(ngModel)]="storeUrl" placeholder="https://mitienda.pe" aria-label="URL de tu tienda WooCommerce" />
          <button type="button" class="btn btn-secondary btn-sm" (click)="importWoo()" [disabled]="importing() || !storeUrl.trim()">
            <lucide-icon [img]="Download" [size]="14"></lucide-icon> {{ importing() ? 'Importando…' : 'Importar de WooCommerce' }}
          </button>
        </div>
      </div>

      @if (products().length === 0) {
        <p class="muted">Aún no tienes productos. Puedes escribirlos al cotizar, pero con el catálogo vas más rápido.</p>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Unidad</th><th class="num">Precio</th><th>IGV</th><th></th></tr></thead>
            <tbody>
              @for (p of products(); track p._id) {
                <tr [class.inactive]="!p.active">
                  <td data-label="Nombre">{{ p.name }} @if (!p.active) { <span class="badge badge-neutral">Oculto</span> }</td>
                  <td data-label="Unidad">{{ p.unit }}</td>
                  <td data-label="Precio" class="num">S/ {{ p.price | number:'1.2-2' }}</td>
                  <td data-label="IGV">{{ p.taxIncluded ? 'Incluido' : 'Se suma' }}</td>
                  <td class="actions">
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Editar ' + p.name" (click)="openEdit(p)">
                      <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                    </button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Eliminar ' + p.name" (click)="remove(p)">
                      <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (editing(); as e) {
      <div class="overlay" (click)="close()">
        <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="prod-title" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h3 id="prod-title">{{ e.id ? 'Editar producto' : 'Nuevo producto' }}</h3>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" (click)="close()"><lucide-icon [img]="X" [size]="16"></lucide-icon></button>
          </div>
          <label class="field-label" for="prod-name">Nombre *</label>
          <input id="prod-name" class="input" [(ngModel)]="form.name" maxlength="200" />
          <div class="row">
            <div>
              <label class="field-label" for="prod-price">Precio (S/) *</label>
              <input id="prod-price" class="input" type="number" min="0" step="0.01" [(ngModel)]="form.price" />
            </div>
            <div>
              <label class="field-label" for="prod-unit">Unidad</label>
              <input id="prod-unit" class="input" [(ngModel)]="form.unit" maxlength="30" placeholder="unidad, hora, mes…" />
            </div>
          </div>
          <label class="check"><input type="checkbox" [(ngModel)]="form.taxIncluded" /> <span>El precio ya incluye IGV</span></label>
          <label class="check"><input type="checkbox" [(ngModel)]="form.active" /> <span>Mostrar al cotizar</span></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0;
      background: color-mix(in srgb, var(--color-brand) 10%, var(--color-white)); color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .woo { display: flex; gap: 8px; flex: 1; justify-content: flex-end; min-width: 260px; }
    .woo .input { max-width: 280px; }
    .num { text-align: right; }
    .actions { text-align: right; white-space: nowrap; }
    tr.inactive td { color: var(--color-text-muted); }
    .muted { color: var(--color-text-muted); font-size: 14px; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; display: flex; flex-direction: column; gap: 8px; animation: pop .25s var(--transition-spring, ease); }
    .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .modal-head h3 { font-family: var(--font-heading); margin: 0; font-size: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 14px; margin-top: 6px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    @keyframes pop { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (max-width: 640px) { .section-card { padding: 20px; } .woo { justify-content: stretch; } .woo .input { max-width: none; } }
  `],
})
export class ProductsSettingsComponent implements OnInit {
  private api = inject(QuotesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  readonly Package = Package; readonly Plus = Plus; readonly Pencil = Pencil;
  readonly Trash2 = Trash2; readonly Download = Download; readonly X = X;

  products = signal<Product[]>([]);
  editing = signal<{ id: string | null } | null>(null);
  saving = signal(false);
  importing = signal(false);
  form: ProductInput & { active: boolean } = { ...EMPTY, active: true };
  storeUrl = '';

  ngOnInit() { this.load(); }

  load() {
    this.api.products(true).subscribe({
      next: (list) => this.products.set(list),
      error: () => this.toast.error('No se pudo cargar el catálogo'),
    });
  }

  openNew() {
    this.form = { ...EMPTY, active: true };
    this.editing.set({ id: null });
  }

  openEdit(p: Product) {
    this.form = { name: p.name, price: p.price, taxIncluded: p.taxIncluded, unit: p.unit, active: p.active };
    this.editing.set({ id: p._id });
  }

  @HostListener('document:keydown.escape')
  close() { this.editing.set(null); }

  save() {
    const id = this.editing()?.id;
    const body = { ...this.form, name: this.form.name.trim(), price: Number(this.form.price) || 0 };
    if (!body.name) { this.toast.error('Escribe el nombre del producto'); return; }
    this.saving.set(true);
    (id ? this.api.updateProduct(id, body) : this.api.createProduct(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.close();
        this.toast.success(id ? 'Producto actualizado' : 'Producto creado');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar');
      },
    });
  }

  async remove(p: Product) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar producto',
      message: `"${p.name}" dejará de aparecer al cotizar. Las cotizaciones ya hechas no cambian.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.removeProduct(p._id).subscribe({
      next: () => { this.toast.success('Producto eliminado'); this.load(); },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  importWoo() {
    this.importing.set(true);
    this.api.importWoo(this.storeUrl.trim()).subscribe({
      next: (r) => {
        this.importing.set(false);
        this.toast.success(`Importados ${r.total} productos (${r.created} nuevos, ${r.updated} actualizados)`);
        this.load();
      },
      error: (err) => {
        this.importing.set(false);
        this.toast.error(err.error?.message || 'No se pudo importar la tienda');
      },
    });
  }
}
