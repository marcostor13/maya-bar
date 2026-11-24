import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule, Plus, Trash2, FileText, Mail, MessageCircle, Copy, Save } from 'lucide-angular';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { Product, Quote, QuoteInput, QuoteItem, QUOTE_STATUS, QuotesApiService } from '../../core/api/quotes-api.service';
import { computeQuote } from './quote-calc';

interface EditorState {
  items: QuoteItem[];
  igvRate: number;
  validUntil: string;
  notes: string;
  payOnline: boolean;
}

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const blankItem = (): QuoteItem => ({ name: '', unit: 'unidad', quantity: 1, unitPrice: 0, discountPct: 0, taxIncluded: true });

/** Cotización a pantalla completa (HU68): `/cotizaciones/nueva?lead=<id>` o `/cotizaciones/<id>`. */
@Component({
  selector: 'app-quote-editor',
  standalone: true,
  imports: [FormPageComponent, FormsModule, LucideAngularModule, DecimalPipe],
  template: `
    <app-form-page
      [title]="quote()?.number ?? 'Nueva cotización'"
      [subtitle]="quote() ? statusLabel() : 'Arma la propuesta y envíala por WhatsApp o email'"
      backLabel="Oportunidad"
      [dirty]="dirty()"
      (closed)="back()">
      <ng-container formActions>
        @if (quote(); as q) {
          <button type="button" class="btn btn-sm btn-secondary" (click)="openPdf()">
            <lucide-icon [img]="FileText" [size]="14"></lucide-icon> PDF
          </button>
          @if (!closed()) {
            <button type="button" class="btn btn-sm btn-secondary" (click)="send('whatsapp')" [disabled]="busy()">
              <lucide-icon [img]="MessageCircle" [size]="14"></lucide-icon> WhatsApp
            </button>
            <button type="button" class="btn btn-sm btn-secondary" (click)="send('email')" [disabled]="busy()">
              <lucide-icon [img]="Mail" [size]="14"></lucide-icon> Email
            </button>
          }
        }
        @if (!closed()) {
          <button type="button" class="btn btn-sm btn-primary" (click)="save()" [disabled]="busy()">
            <lucide-icon [img]="Save" [size]="14"></lucide-icon> {{ busy() ? 'Guardando…' : 'Guardar' }}
          </button>
        }
      </ng-container>

      <div class="q-grid">
        <div class="card q-card">
          <div class="q-head">
            <h2>Ítems</h2>
            @if (!closed() && products().length) {
              <select class="select add-product" aria-label="Agregar del catálogo" (change)="addProduct($event)">
                <option value="">Agregar del catálogo…</option>
                @for (p of products(); track p._id) { <option [value]="p._id">{{ p.name }} · S/ {{ p.price }}</option> }
              </select>
            }
          </div>
          <div class="items">
            @for (it of state.items; track $index; let i = $index) {
              <div class="item">
                <div class="f name">
                  <label class="field-label" [for]="'it-name-' + i">Descripción</label>
                  <input class="input" [id]="'it-name-' + i" [(ngModel)]="it.name" [disabled]="closed()" maxlength="300" (ngModelChange)="touch()" />
                </div>
                <div class="f">
                  <label class="field-label" [for]="'it-qty-' + i">Cant.</label>
                  <input class="input" type="number" min="0" step="1" [id]="'it-qty-' + i" [(ngModel)]="it.quantity" [disabled]="closed()" (ngModelChange)="touch()" />
                </div>
                <div class="f">
                  <label class="field-label" [for]="'it-price-' + i">P. unit. (S/)</label>
                  <input class="input" type="number" min="0" step="0.01" [id]="'it-price-' + i" [(ngModel)]="it.unitPrice" [disabled]="closed()" (ngModelChange)="touch()" />
                </div>
                <div class="f">
                  <label class="field-label" [for]="'it-disc-' + i">Dscto. %</label>
                  <input class="input" type="number" min="0" max="100" [id]="'it-disc-' + i" [(ngModel)]="it.discountPct" [disabled]="closed()" (ngModelChange)="touch()" />
                </div>
                <label class="check f-igv">
                  <input type="checkbox" [(ngModel)]="it.taxIncluded" [disabled]="closed()" (ngModelChange)="touch()" /> <span>Precio con IGV</span>
                </label>
                <div class="line-total">S/ {{ totals().lines[i]?.total ?? 0 | number:'1.2-2' }}</div>
                @if (!closed()) {
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Quitar línea ' + (i + 1)" (click)="removeItem(i)" [disabled]="state.items.length === 1">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                }
              </div>
            }
          </div>
          @if (!closed()) {
            <button type="button" class="btn btn-ghost btn-sm" (click)="addItem()"><lucide-icon [img]="Plus" [size]="14"></lucide-icon> Agregar línea</button>
          }
        </div>

        <div class="side">
          <div class="card q-card">
            <h2>Condiciones</h2>
            <label class="field-label" for="q-valid">Válida hasta</label>
            <input id="q-valid" class="input" type="date" [(ngModel)]="state.validUntil" [disabled]="closed()" (ngModelChange)="touch()" />
            <label class="field-label" for="q-igv">IGV</label>
            <select id="q-igv" class="select" [(ngModel)]="state.igvRate" [disabled]="closed()" (ngModelChange)="touch()">
              <option [ngValue]="18">18 %</option>
              <option [ngValue]="10.5">10.5 % (restaurantes y hoteles MYPE)</option>
              <option [ngValue]="0">Exonerado</option>
            </select>
            <label class="field-label" for="q-notes">Notas y condiciones</label>
            <textarea id="q-notes" class="textarea" rows="3" [(ngModel)]="state.notes" [disabled]="closed()" maxlength="3000" (ngModelChange)="touch()"
              placeholder="Forma de pago, plazo de entrega…"></textarea>
            <label class="check">
              <input type="checkbox" [(ngModel)]="state.payOnline" [disabled]="closed()" (ngModelChange)="touch()" />
              <span>Ofrecer pago en línea con Mercado Pago</span>
            </label>
            <span class="field-hint">Usa la cuenta conectada en Configuración → Cobros con Mercado Pago.</span>
          </div>

          <div class="card q-card totals">
            <div class="row"><span>Subtotal (sin IGV)</span><span>S/ {{ totals().subtotal | number:'1.2-2' }}</span></div>
            @if (totals().discount > 0) { <div class="row muted"><span>Descuentos</span><span>− S/ {{ totals().discount | number:'1.2-2' }}</span></div> }
            <div class="row"><span>IGV ({{ state.igvRate }} %)</span><span>S/ {{ totals().igv | number:'1.2-2' }}</span></div>
            <div class="row total"><span>Total</span><span>S/ {{ totals().total | number:'1.2-2' }}</span></div>
          </div>

          @if (quote(); as q) {
            <div class="card q-card">
              <h2>Link para el cliente</h2>
              <p class="field-hint">Desde aquí puede verla, aceptarla{{ q.payOnline ? ' o pagarla' : '' }}.</p>
              <div class="link-row">
                <input class="input" readonly [value]="publicLink()" aria-label="Link público" />
                <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Copiar link" (click)="copyLink()"><lucide-icon [img]="Copy" [size]="14"></lucide-icon></button>
              </div>
              @if (q.sentVia.length) { <p class="field-hint">Enviada por {{ q.sentVia.join(' y ') }}.</p> }
            </div>
          }
        </div>
      </div>
    </app-form-page>
  `,
  styles: [`
    .q-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
    .q-card { padding: 24px; display: flex; flex-direction: column; gap: 8px; }
    .q-card h2 { font-family: var(--font-heading); font-size: 16px; margin: 0 0 4px; }
    .side { display: flex; flex-direction: column; gap: 24px; }
    .q-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .add-product { max-width: 280px; }
    .items { display: flex; flex-direction: column; gap: 12px; margin: 8px 0; }
    .item { display: grid; grid-template-columns: minmax(160px, 2.4fr) 80px 110px 80px auto 110px 36px; gap: 10px; align-items: end;
      padding-bottom: 12px; border-bottom: 1px solid var(--color-border); }
    .f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .f-igv { padding-bottom: 10px; }
    .line-total { font-weight: 700; text-align: right; padding-bottom: 10px; }
    .totals .row { display: flex; justify-content: space-between; font-size: 14px; }
    .totals .muted { color: var(--color-text-muted); }
    .totals .total { font-size: 20px; font-weight: 800; padding-top: 8px; border-top: 1px solid var(--color-border); margin-top: 4px; }
    .link-row { display: flex; gap: 6px; }
    .field-hint { font-size: 12px; color: var(--color-text-muted); margin: 0; }
    @media (max-width: 1100px) { .q-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) {
      .item { grid-template-columns: 1fr 1fr 1fr; }
      .item .name { grid-column: 1 / -1; }
      .line-total { grid-column: 1 / 3; text-align: left; }
    }
  `],
})
export class QuoteEditorComponent implements OnInit {
  private api = inject(QuotesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly Plus = Plus; readonly Trash2 = Trash2; readonly FileText = FileText;
  readonly Mail = Mail; readonly MessageCircle = MessageCircle; readonly Copy = Copy; readonly Save = Save;

  quote = signal<Quote | null>(null);
  products = signal<Product[]>([]);
  busy = signal(false);
  /** Cambia en cada edición para recalcular los totales. */
  private rev = signal(0);
  private saved = signal('');
  leadId = '';
  state: EditorState = { items: [blankItem()], igvRate: 18, validUntil: plusDays(15), notes: '', payOnline: false };

  totals = computed(() => { this.rev(); return computeQuote(this.state.items, this.state.igvRate); });
  dirty = computed(() => { this.rev(); return snapshotOf(this.state) !== this.saved(); });
  closed = computed(() => ['accepted', 'rejected', 'paid'].includes(this.quote()?.status ?? ''));
  statusLabel = computed(() => (this.quote() ? QUOTE_STATUS[this.quote()!.status].label : ''));

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'nueva';
    this.api.products().subscribe({ next: (p) => this.products.set(p), error: () => undefined });
    if (id === 'nueva') {
      this.leadId = this.route.snapshot.queryParamMap.get('lead') ?? '';
      this.saved.set(snapshotOf(this.state));
      return;
    }
    this.api.get(id).subscribe({
      next: (q) => this.apply(q),
      error: (err) => {
        this.toast.error(err.error?.message || 'No se encontró la cotización');
        void this.router.navigate(['/leads']);
      },
    });
  }

  private apply(q: Quote) {
    this.quote.set(q);
    this.leadId = String(q.leadId);
    this.state = {
      items: q.items.map((i) => ({
        productId: i.productId, name: i.name, unit: i.unit, quantity: i.quantity,
        unitPrice: i.unitPrice, discountPct: i.discountPct ?? 0, taxIncluded: i.taxIncluded ?? true,
      })),
      igvRate: q.igvRate,
      validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
      notes: q.notes ?? '',
      payOnline: q.payOnline,
    };
    this.saved.set(snapshotOf(this.state));
    this.touch();
  }

  touch() { this.rev.update((n) => n + 1); }

  addItem() { this.state.items.push(blankItem()); this.touch(); }

  removeItem(i: number) { this.state.items.splice(i, 1); this.touch(); }

  addProduct(e: Event) {
    const sel = e.target as HTMLSelectElement;
    const p = this.products().find((x) => x._id === sel.value);
    sel.value = '';
    if (!p) return;
    const line = { productId: p._id, name: p.name, unit: p.unit, quantity: 1, unitPrice: p.price, discountPct: 0, taxIncluded: p.taxIncluded };
    const only = this.state.items.length === 1 && !this.state.items[0].name.trim();
    if (only) this.state.items[0] = line; else this.state.items.push(line);
    this.touch();
  }

  private body(): QuoteInput | null {
    const items = this.state.items
      .map((i) => ({ ...i, name: i.name.trim(), quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0, discountPct: Number(i.discountPct) || 0 }))
      .filter((i) => i.name);
    if (!items.length) { this.toast.error('Agrega al menos un ítem con descripción'); return null; }
    if (items.some((i) => i.quantity <= 0)) { this.toast.error('La cantidad de cada ítem debe ser mayor que 0'); return null; }
    return {
      leadId: this.leadId,
      items: items.map((i) => (i.productId ? i : { ...i, productId: undefined })),
      igvRate: Number(this.state.igvRate),
      ...(this.state.validUntil ? { validUntil: this.state.validUntil } : {}),
      notes: this.state.notes.trim(),
      payOnline: this.state.payOnline,
    };
  }

  save(): Promise<Quote | null> {
    const body = this.body();
    if (!body) return Promise.resolve(null);
    const id = this.quote()?._id;
    this.busy.set(true);
    return new Promise((resolve) => {
      (id ? this.api.update(id, body) : this.api.create(body)).subscribe({
        next: (q) => {
          this.busy.set(false);
          this.apply(q);
          this.toast.success(id ? 'Cotización guardada' : `Cotización ${q.number} creada`);
          if (!id) void this.router.navigate(['/cotizaciones', q._id], { replaceUrl: true });
          resolve(q);
        },
        error: (err) => {
          this.busy.set(false);
          this.toast.error(err.error?.message || 'No se pudo guardar la cotización');
          resolve(null);
        },
      });
    });
  }

  async send(channel: 'whatsapp' | 'email') {
    if (this.dirty() && !(await this.save())) return;
    const q = this.quote();
    if (!q) return;
    const ok = await this.confirm.confirm({
      title: channel === 'email' ? 'Enviar por email' : 'Enviar por WhatsApp',
      message: channel === 'email'
        ? `El cliente recibirá el link a ${q.number} por S/ ${q.total.toFixed(2)}.`
        : `Se enviará el PDF de ${q.number} al chat de WhatsApp del cliente.`,
      confirmText: 'Enviar',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.send(q._id, channel).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.apply(updated);
        this.toast.success(channel === 'email' ? 'Cotización enviada por email' : 'Cotización enviada por WhatsApp');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err.error?.message || 'No se pudo enviar');
      },
    });
  }

  publicLink() {
    const q = this.quote();
    return q ? `${window.location.origin}/q/${q.publicToken}` : '';
  }

  copyLink() {
    navigator.clipboard.writeText(this.publicLink()).then(
      () => this.toast.success('Link copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  openPdf() {
    const q = this.quote();
    if (!q) return;
    this.api.pdf(q._id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.toast.error('No se pudo generar el PDF'),
    });
  }

  back() {
    void this.router.navigate(['/leads'], this.leadId ? { queryParams: { lead: this.leadId } } : {});
  }
}
