import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, Building2, Plus, LogIn, X, Palette, Undo2, Loader2 } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';
import { BrandService } from '../../core/brand.service';
import { environment } from '../../../environments/environment';

export interface AgencyClient {
  _id: string;
  name: string;
  email: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  usage: { users: number; contacts: number; conversations30d: number };
}

export interface WhiteLabel {
  appName?: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  panelDomain?: string;
}

export interface AgencyOverview {
  agency: { _id: string; name: string; seats: number; used: number };
  whiteLabel: WhiteLabel;
  actingTenantId: string | null;
  clients: AgencyClient[];
}

const API = environment.apiUrl;

/** Panel de la agencia (HU72): sub-cuentas, uso y marca blanca. */
@Component({
  selector: 'app-agency',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="page animate-fade-in">
      <header class="page-head">
        <div>
          <h1>Agencia</h1>
          @if (data(); as d) {
            <p class="muted">{{ d.agency.name }} · {{ d.agency.used }} de {{ d.agency.seats }} sub-cuentas usadas</p>
          }
        </div>
        <button type="button" class="btn btn-primary" (click)="openNew()" [disabled]="full()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Nuevo cliente
        </button>
      </header>

      @if (acting()) {
        <div class="acting card">
          <span>Estás trabajando dentro de <strong>{{ actingName() }}</strong>.</span>
          <button type="button" class="btn btn-secondary btn-sm" (click)="enter(data()!.agency._id)" [disabled]="switching()">
            <lucide-icon [img]="Undo2" [size]="14"></lucide-icon> Volver a la agencia
          </button>
        </div>
      }

      @if (!data()) {
        <div class="card loading"><lucide-icon [img]="Loader2" [size]="18" class="spin"></lucide-icon> Cargando…</div>
      } @else if (!data()!.clients.length) {
        <div class="card empty">
          <lucide-icon [img]="Building2" [size]="32"></lucide-icon>
          <p>Aún no tienes clientes. Crea el primero y entra a su cuenta para configurarla.</p>
        </div>
      } @else {
        <div class="table-wrap table-cards card">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Usuarios</th><th>Contactos</th><th>Chats (30 días)</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              @for (c of data()!.clients; track c._id) {
                <tr>
                  <td><strong>{{ c.name }}</strong><span class="sub">{{ c.email }} · desde {{ c.createdAt | date: 'MMM y' }}</span></td>
                  <td data-label="Usuarios">{{ c.usage.users }}</td>
                  <td data-label="Contactos">{{ c.usage.contacts }}</td>
                  <td data-label="Chats (30 días)">{{ c.usage.conversations30d }}</td>
                  <td data-label="Estado">
                    <span class="badge" [class.badge-success]="c.isActive" [class.badge-danger]="!c.isActive">{{ c.isActive ? 'Activa' : 'Suspendida' }}</span>
                  </td>
                  <td class="right">
                    @if (data()!.actingTenantId === c._id) {
                      <span class="badge badge-brand">Estás aquí</span>
                    } @else {
                      <button type="button" class="btn btn-secondary btn-sm" (click)="enter(c._id)" [disabled]="switching() || !c.isActive" [attr.aria-label]="'Entrar a ' + c.name">
                        <lucide-icon [img]="LogIn" [size]="14"></lucide-icon> Entrar
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (data()) {
        <section class="card wl">
          <div class="wl-head">
            <lucide-icon [img]="Palette" [size]="20"></lucide-icon>
            <div>
              <h2>Marca blanca</h2>
              <p class="muted">Tus clientes ven tu nombre, tu logo y tu color. Apunta un CNAME de tu dominio al de la plataforma y escríbelo aquí.</p>
            </div>
          </div>
          <div class="wl-grid">
            <div><label class="field-label" for="wl-name">Nombre de la app</label><input id="wl-name" class="input" [(ngModel)]="wl.appName" maxlength="40" placeholder="Andes CRM" /></div>
            <div><label class="field-label" for="wl-domain">Dominio del panel</label><input id="wl-domain" class="input" [(ngModel)]="wl.panelDomain" placeholder="crm.miagencia.com" /></div>
            <div><label class="field-label" for="wl-logo">Logo (URL https)</label><input id="wl-logo" class="input" [(ngModel)]="wl.logo" placeholder="https://…/logo.png" /></div>
            <div><label class="field-label" for="wl-fav">Ícono del navegador (URL https)</label><input id="wl-fav" class="input" [(ngModel)]="wl.favicon" placeholder="https://…/favicon.png" /></div>
            <div><label class="field-label" for="wl-color">Color principal</label><input id="wl-color" class="input color" type="color" [(ngModel)]="wl.primaryColor" /></div>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-sm" (click)="saveBrand()" [disabled]="savingBrand()">{{ savingBrand() ? 'Guardando…' : 'Guardar marca' }}</button>
          </div>
        </section>
      }
    </div>

    @if (showNew()) {
      <div class="overlay" (click)="showNew.set(false)">
        <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="ag-new-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2 id="ag-new-title">Nuevo cliente</h2>
            <button type="button" class="btn btn-ghost btn-icon" aria-label="Cerrar" (click)="showNew.set(false)"><lucide-icon [img]="X" [size]="18"></lucide-icon></button>
          </header>
          <label class="field-label" for="ag-name">Nombre de la empresa</label>
          <input id="ag-name" class="input" [(ngModel)]="newName" maxlength="80" />
          <label class="field-label" for="ag-email">Correo de la empresa</label>
          <input id="ag-email" class="input" type="email" [(ngModel)]="newEmail" maxlength="200" />
          <p class="muted small">La sub-cuenta usa el plan Crece y se factura a tu agencia.</p>
          <div class="actions">
            <button type="button" class="btn btn-secondary" (click)="showNew.set(false)">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="create()" [disabled]="creating()">{{ creating() ? 'Creando…' : 'Crear' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; display: flex; flex-direction: column; gap: 20px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    h1 { font-family: var(--font-heading); margin: 0 0 4px; }
    .muted { color: var(--color-text-muted); margin: 0; font-size: 14px; }
    .small { font-size: 12px; }
    .acting { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 24px; flex-wrap: wrap;
      background: color-mix(in srgb, var(--color-brand) 8%, var(--color-white)); }
    .loading, .empty { padding: 32px; display: flex; gap: 12px; align-items: center; color: var(--color-text-muted); }
    .empty { flex-direction: column; text-align: center; }
    .sub { display: block; font-size: 12px; color: var(--color-text-muted); }
    .right { text-align: right; }
    .wl { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .wl-head { display: flex; gap: 12px; align-items: flex-start; color: var(--color-brand); }
    .wl-head h2 { font-family: var(--font-heading); font-size: 17px; margin: 0 0 2px; color: var(--color-text-main); }
    .wl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .wl-grid > div { display: flex; flex-direction: column; gap: 6px; }
    .color { padding: 4px; height: 42px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; display: flex; flex-direction: column; gap: 8px; animation: pop var(--transition-spring); }
    .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .modal-head h2 { font-family: var(--font-heading); font-size: 18px; margin: 0; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
    @media (max-width: 760px) { .page { padding: 20px 16px; } }
  `],
})
export class AgencyComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private brand = inject(BrandService);
  readonly Building2 = Building2; readonly Plus = Plus; readonly LogIn = LogIn; readonly X = X;
  readonly Palette = Palette; readonly Undo2 = Undo2; readonly Loader2 = Loader2;

  data = signal<AgencyOverview | null>(null);
  showNew = signal(false);
  creating = signal(false);
  switching = signal(false);
  savingBrand = signal(false);
  newName = '';
  newEmail = '';
  wl: WhiteLabel = {};

  full = computed(() => !!this.data() && this.data()!.agency.used >= this.data()!.agency.seats);
  acting = computed(() => !!this.data()?.actingTenantId);
  actingName = computed(() => this.data()?.clients.find(c => c._id === this.data()!.actingTenantId)?.name ?? 'un cliente');

  ngOnInit() { this.load(); }

  @HostListener('document:keydown.escape')
  onEsc() { this.showNew.set(false); }

  load() {
    this.http.get<AgencyOverview>(`${API}/agency`).subscribe({
      next: (d) => { this.data.set(d); this.wl = { primaryColor: '#4F46E5', ...d.whiteLabel }; },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo cargar la agencia'),
    });
  }

  openNew() { this.newName = ''; this.newEmail = ''; this.showNew.set(true); }

  create() {
    if (this.newName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(this.newEmail.trim())) {
      this.toast.error('Escribe el nombre y un correo válido');
      return;
    }
    this.creating.set(true);
    this.http.post(`${API}/agency/clients`, { name: this.newName.trim(), email: this.newEmail.trim() }).subscribe({
      next: () => { this.creating.set(false); this.showNew.set(false); this.toast.success('Cliente creado'); this.load(); },
      error: (err) => { this.creating.set(false); this.toast.error(err.error?.message || 'No se pudo crear el cliente'); },
    });
  }

  enter(tenantId: string) {
    this.switching.set(true);
    this.auth.switchTenant(tenantId).subscribe({
      error: (err) => { this.switching.set(false); this.toast.error(err.error?.message || 'No se pudo entrar a esa cuenta'); },
    });
  }

  saveBrand() {
    this.savingBrand.set(true);
    this.http.put<WhiteLabel>(`${API}/agency/white-label`, this.wl).subscribe({
      next: (wl) => {
        this.savingBrand.set(false);
        this.wl = { ...this.wl, ...wl };
        this.toast.success('Marca guardada');
        this.brand.loadForSession();
      },
      error: (err) => { this.savingBrand.set(false); this.toast.error(err.error?.message || 'No se pudo guardar la marca'); },
    });
  }
}
