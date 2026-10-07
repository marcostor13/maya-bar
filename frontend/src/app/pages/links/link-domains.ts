import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Globe, Plus, RefreshCw, Trash2, Star, CircleCheck, Clock, TriangleAlert, Copy,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import { injectRoles } from '../../shared/roles';
import { DomainStatus, LinksApiService, ShortDomain } from '../../core/api/links-api.service';

type ErrorLike = { error?: { message?: string | string[] } };

const STATUS: Record<DomainStatus, { label: string; badge: string }> = {
  pending: { label: 'Pendiente de DNS', badge: 'badge-warning' },
  dns_ok: { label: 'DNS correcto · falta activarlo', badge: 'badge-info' },
  active: { label: 'Activo', badge: 'badge-success' },
};

/** Dominios propios para los links cortos: alta, instrucciones DNS y verificación. */
@Component({
  selector: 'app-link-domains',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="card intro">
      <div class="intro-icon"><lucide-icon [img]="Globe" [size]="20"></lucide-icon></div>
      <div class="intro-text">
        <h3>Usa tu propio dominio corto</h3>
        <p>
          Sin dominio propio tus links salen como <code>{{ platformBase() }}abc1234</code>.
          Con uno propio quedan como <code>https://tu-dominio.com/abc1234</code>.
        </p>
        <ol>
          <li>Registra un dominio o subdominio corto (por ejemplo <code>ir.tuempresa.com</code>).</li>
          <li>
            En tu proveedor de DNS crea un registro <strong>A</strong> hacia
            <button class="ip" (click)="copy(serverIp())" title="Copiar IP">
              {{ serverIp() || 'la IP del servidor' }} <lucide-icon [img]="Copy" [size]="12"></lucide-icon>
            </button>
            Si usas Cloudflare, déjalo sin proxy (nube gris).
          </li>
          <li>Añádelo aquí y pulsa <strong>Verificar</strong>.</li>
        </ol>
      </div>
    </div>

    @if (canManage()) {
      <div class="card add">
        <input class="input" [(ngModel)]="newDomain" placeholder="ir.tuempresa.com" (keydown.enter)="add()"
          aria-label="Dominio a registrar" />
        <button class="btn btn-primary" (click)="add()" [disabled]="adding() || !newDomain.trim()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon>
          {{ adding() ? 'Registrando…' : 'Registrar dominio' }}
        </button>
      </div>
    }

    @if (loading()) {
      <div class="card skeleton"></div>
    } @else if (!domains().length) {
      <div class="card empty">
        <lucide-icon [img]="Globe" [size]="36" [strokeWidth]="1.5"></lucide-icon>
        <p>Aún no has registrado ningún dominio. Tus links usan el de la plataforma.</p>
      </div>
    } @else {
      <div class="list">
        @for (d of domains(); track d._id) {
          <article class="card domain">
            <div class="domain-head">
              <div class="domain-name">
                <strong>{{ d.domain }}</strong>
                @if (d.isDefault) { <span class="badge badge-brand">Predeterminado</span> }
              </div>
              <span class="badge" [class]="'badge ' + status(d).badge">
                <lucide-icon [img]="statusIcon(d)" [size]="12"></lucide-icon>
                {{ status(d).label }}
              </span>
            </div>
            @if (d.checkMessage) { <p class="message" [class.ok]="d.status === 'active'">{{ d.checkMessage }}</p> }
            @if (d.status === 'dns_ok') {
              <p class="hint">
                Este paso lo hace quien administra el servidor: añadir <code>{{ d.domain }}</code> a
                <code>SHORT_LINK_DOMAINS</code> y ejecutar <code>npm run provision</code>. Luego vuelve a verificar.
              </p>
            }
            <div class="domain-foot">
              <span class="hint">
                @if (d.checkedAt) { Comprobado {{ d.checkedAt | date: 'dd/MM HH:mm' }} }
                @if (d.resolvedTo.length) { · apunta a {{ d.resolvedTo.join(', ') }} }
              </span>
              <span class="spacer"></span>
              <button class="btn btn-secondary btn-sm" (click)="verify(d)" [disabled]="verifying() === d._id">
                <lucide-icon [img]="RefreshCw" [size]="13" [class.spin]="verifying() === d._id"></lucide-icon>
                Verificar
              </button>
              @if (canManage() && d.status === 'active' && !d.isDefault) {
                <button class="btn btn-ghost btn-sm" (click)="makeDefault(d)">
                  <lucide-icon [img]="Star" [size]="13"></lucide-icon> Predeterminado
                </button>
              }
              @if (canManage()) {
                <button class="btn btn-ghost btn-sm btn-icon" (click)="remove(d)" aria-label="Eliminar dominio">
                  <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                </button>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:16px; }
    .intro { display:flex; gap:16px; padding:24px; }
    .intro-icon { width:44px; height:44px; border-radius:var(--radius-md); display:grid; place-items:center; flex-shrink:0;
      background:var(--color-brand-light); color:var(--color-brand); }
    .intro-text { min-width:0; }
    .intro-text h3 { margin:0 0 6px; font-family:var(--font-heading); font-size:16px; }
    .intro-text p { margin:0 0 10px; font-size:13px; color:var(--color-text-muted); }
    .intro-text ol { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--color-text-main); }
    code { background:var(--color-bg-light); padding:1px 6px; border-radius:var(--radius-sm); font-size:12px; overflow-wrap:anywhere; }
    .ip { display:inline-flex; align-items:center; gap:4px; border:none; cursor:pointer; font-family:ui-monospace, Menlo, Consolas, monospace;
      font-size:12px; font-weight:600; background:var(--color-brand-light); color:var(--color-brand); border-radius:var(--radius-pill); padding:3px 10px; }
    .add { display:flex; gap:10px; padding:16px 24px; flex-wrap:wrap; }
    .add .input { flex:1; min-width:220px; }
    .skeleton { height:110px; background:var(--color-bg-light); }
    .empty { display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; padding:40px 24px; color:var(--color-text-muted); }
    .empty p { margin:0; }
    .list { display:flex; flex-direction:column; gap:12px; }
    .domain { padding:20px 24px; display:flex; flex-direction:column; gap:10px; }
    .domain-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
    .domain-name { display:flex; align-items:center; gap:10px; font-size:15px; overflow-wrap:anywhere; }
    .message { margin:0; font-size:13px; color:var(--color-text-main); }
    .message.ok { color:var(--color-success); }
    .hint { margin:0; font-size:12px; color:var(--color-text-muted); }
    .domain-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .spacer { flex:1; }
    .spin { animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width: 600px) { .intro { flex-direction:column; } }
  `],
})
export class LinkDomainsComponent implements OnInit {
  private api = inject(LinksApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);
  private roles = injectRoles();

  /** Avisa al padre de que la lista de dominios activos pudo cambiar. */
  changed = output<void>();

  readonly Globe = Globe; readonly Plus = Plus; readonly RefreshCw = RefreshCw; readonly Trash2 = Trash2;
  readonly Star = Star; readonly Copy = Copy;

  domains = signal<ShortDomain[]>([]);
  serverIp = signal('');
  platformBase = signal('');
  loading = signal(true);
  adding = signal(false);
  verifying = signal<string | null>(null);
  newDomain = '';

  /** Registrar o quitar dominios es de administradores; verificar, de cualquiera. */
  canManage = computed(() => this.roles.canManage() && this.permissions.canAct('campaigns', 'edit'));

  ngOnInit() { this.load(); }

  private load() {
    this.api.domains().subscribe({
      next: res => {
        this.domains.set(res.domains);
        this.serverIp.set(res.serverIp);
        this.platformBase.set(res.platformBase);
        this.loading.set(false);
      },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(this.message(err, 'No se pudieron cargar los dominios'));
      },
    });
  }

  status(d: ShortDomain) { return STATUS[d.status]; }
  statusIcon(d: ShortDomain) { return d.status === 'active' ? CircleCheck : d.status === 'dns_ok' ? Clock : TriangleAlert; }

  add() {
    const domain = this.newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    this.adding.set(true);
    this.api.addDomain(domain).subscribe({
      next: d => {
        this.adding.set(false);
        this.newDomain = '';
        this.toast.success(d.status === 'active' ? 'Dominio registrado y activo' : 'Dominio registrado: falta apuntar el DNS');
        this.load();
        this.changed.emit();
      },
      error: (err: ErrorLike) => {
        this.adding.set(false);
        this.toast.error(this.message(err, 'No se pudo registrar el dominio'));
      },
    });
  }

  verify(d: ShortDomain) {
    this.verifying.set(d._id);
    this.api.verifyDomain(d._id).subscribe({
      next: updated => {
        this.verifying.set(null);
        this.domains.update(list => list.map(x => (x._id === updated._id ? updated : x)));
        if (updated.status === 'active') this.toast.success('Dominio activo');
        else this.toast.error(updated.checkMessage || 'El dominio aún no está listo');
        this.changed.emit();
      },
      error: (err: ErrorLike) => {
        this.verifying.set(null);
        this.toast.error(this.message(err, 'No se pudo verificar'));
      },
    });
  }

  makeDefault(d: ShortDomain) {
    this.api.setDefaultDomain(d._id).subscribe({
      next: () => { this.toast.success('Dominio predeterminado actualizado'); this.load(); this.changed.emit(); },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo cambiar el predeterminado')),
    });
  }

  async remove(d: ShortDomain) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar dominio',
      message: 'Se quitará ' + d.domain + '. Solo se puede si ningún link lo usa.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.removeDomain(d._id).subscribe({
      next: () => { this.toast.success('Dominio eliminado'); this.load(); this.changed.emit(); },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo eliminar el dominio')),
    });
  }

  copy(text: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => this.toast.success('Copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  private message(err: ErrorLike, fallback: string): string {
    const m = err.error?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
  }
}
