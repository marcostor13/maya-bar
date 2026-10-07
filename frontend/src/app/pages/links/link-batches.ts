import { Component, HostListener, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Plus, X, Upload, List, Users, FileSpreadsheet, BarChart3, Download, Trash2,
  Copy, Eye, Search, MessageSquare, Mail, MessageCircle, Link2, RefreshCw,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import {
  BatchInput, BatchRow, LinkBatch, LinkChannel, LinksApiService, ParsedFile, saveBlob,
} from '../../core/api/links-api.service';
import { TemplateVariable, TemplatesApiService } from '../../core/api/templates-api.service';
import { VariableChipsComponent, insertAtCursor } from '../templates/variable-chips';

type ErrorLike = { error?: { message?: string | string[] } };
type Source = 'lists' | 'contacts' | 'file';

interface ListMini { _id: string; name: string; color: string; memberCount: number; type: string }
interface ContactMini { _id: string; name: string; email?: string; phone?: string; tags: string[] }

const CHANNELS: { key: LinkChannel; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'other', label: 'Otro' },
];

/** Adivina la columna de un archivo por su cabecera. */
function guess(columns: string[], patterns: RegExp): string {
  return columns.find(c => patterns.test(c.toLowerCase())) ?? '';
}

/** Links masivos: un link personal por contacto, desde una lista o un Excel. */
@Component({
  selector: 'app-link-batches',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, RouterLink, VariableChipsComponent],
  template: `
    <div class="bar">
      <p class="lead">
        Genera de una vez un link distinto para cada persona. Así sabes exactamente quién hizo clic,
        y te llevas el mensaje ya armado para enviarlo por SMS, WhatsApp o correo.
      </p>
      @if (canCreate()) {
        <button class="btn btn-primary" (click)="openWizard()">
          <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
          Nuevo lote
        </button>
      }
    </div>

    @if (loading()) {
      <div class="card skeleton"></div>
    } @else if (!batches().length) {
      <div class="card empty">
        <lucide-icon [img]="Link2" [size]="40" [strokeWidth]="1.5"></lucide-icon>
        <h3>Aún no hay lotes</h3>
        <p>Crea el primero a partir de una lista de contactos o de un Excel.</p>
      </div>
    } @else {
      <div class="table-wrap card">
        <table>
          <thead>
            <tr><th>Lote</th><th>Canal</th><th>Origen</th><th class="num">Links</th><th>Creado</th><th></th></tr>
          </thead>
          <tbody>
            @for (b of batches(); track b._id) {
              <tr>
                <td data-label="Lote">
                  <div class="t-title">{{ b.name }}</div>
                  <div class="t-sub">{{ b.destination }}</div>
                </td>
                <td data-label="Canal">
                  <span class="badge badge-info">
                    <lucide-icon [img]="channelIcon(b.channel)" [size]="12"></lucide-icon> {{ channelLabel(b.channel) }}
                  </span>
                </td>
                <td data-label="Origen">{{ sourceLabel(b.source) }}</td>
                <td class="num" data-label="Links">{{ b.count }}</td>
                <td data-label="Creado">{{ b.createdAt | date: 'dd/MM/yyyy' }}</td>
                <td>
                  <div class="actions">
                    <button class="btn btn-ghost btn-sm btn-icon" (click)="openDetail(b)" title="Ver links y mensajes" aria-label="Ver links y mensajes">
                      <lucide-icon [img]="Eye" [size]="15"></lucide-icon>
                    </button>
                    <a class="btn btn-ghost btn-sm btn-icon" routerLink="/links/analitica" [queryParams]="{ batchId: b._id }"
                      title="Analítica del lote" aria-label="Analítica del lote">
                      <lucide-icon [img]="BarChart3" [size]="15"></lucide-icon>
                    </a>
                    <button class="btn btn-ghost btn-sm btn-icon" (click)="exportBatch(b)" title="Descargar CSV" aria-label="Descargar CSV">
                      <lucide-icon [img]="Download" [size]="15"></lucide-icon>
                    </button>
                    @if (canDelete()) {
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="remove(b)" title="Eliminar lote" aria-label="Eliminar lote">
                        <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Asistente -->
    @if (wizardOpen()) {
      <div class="overlay" (click)="wizardOpen.set(false)" role="dialog" aria-modal="true" aria-label="Nuevo lote de links">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2>Nuevo lote de links</h2>
            <button class="btn btn-ghost btn-icon" (click)="wizardOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="drawer-body">
            <label class="field">
              <span class="label">Nombre del lote</span>
              <input class="input" [(ngModel)]="form.name" maxlength="120" placeholder="Ej. Promo octubre — clientes VIP" />
            </label>
            <label class="field">
              <span class="label">¿A dónde lleva el link?</span>
              <input class="input" [(ngModel)]="form.destination" maxlength="2000" placeholder="https://tu-sitio.com/oferta" />
            </label>
            @if (domains().length) {
              <label class="field">
                <span class="label">Dominio</span>
                <select class="select" [(ngModel)]="form.domain">
                  <option value="">Predeterminado</option>
                  @for (d of domains(); track d) { <option [value]="d">{{ d }}</option> }
                </select>
              </label>
            }

            <div class="field">
              <span class="label">¿Para quién?</span>
              <div class="chips">
                <button type="button" class="chip" [class.active]="source() === 'lists'" (click)="setSource('lists')">
                  <lucide-icon [img]="List" [size]="13"></lucide-icon> Una lista
                </button>
                <button type="button" class="chip" [class.active]="source() === 'contacts'" (click)="setSource('contacts')">
                  <lucide-icon [img]="Users" [size]="13"></lucide-icon> Elegir contactos
                </button>
                <button type="button" class="chip" [class.active]="source() === 'file'" (click)="setSource('file')">
                  <lucide-icon [img]="FileSpreadsheet" [size]="13"></lucide-icon> Excel o CSV
                </button>
              </div>

              @if (source() === 'lists') {
                <div class="options">
                  @for (l of lists(); track l._id) {
                    <label class="option" [class.selected]="listIds().includes(l._id)">
                      <input type="checkbox" [checked]="listIds().includes(l._id)" (change)="toggleList(l._id)" />
                      <span class="dot" [style.background]="l.color"></span>
                      <span class="option-name">{{ l.name }}</span>
                      <span class="option-sub">{{ l.memberCount }} miembros</span>
                    </label>
                  } @empty {
                    <p class="hint">No hay listas. Crea una en <a routerLink="/lists">Listas</a>.</p>
                  }
                </div>
              }

              @if (source() === 'contacts') {
                <div class="search">
                  <lucide-icon [img]="Search" [size]="14"></lucide-icon>
                  <input class="input" placeholder="Buscar contactos" [ngModel]="contactQuery()" (ngModelChange)="contactQuery.set($event)" />
                </div>
                <label class="option head">
                  <input type="checkbox" [checked]="allShownSelected()" (change)="toggleShown()" />
                  <span class="option-name">Seleccionar los {{ contactResults().length }} que se ven</span>
                  <span class="option-sub">{{ customerIds().length }} elegidos</span>
                </label>
                <div class="options scroll">
                  @for (c of contactResults(); track c._id) {
                    <label class="option" [class.selected]="customerIds().includes(c._id)">
                      <input type="checkbox" [checked]="customerIds().includes(c._id)" (change)="toggleContact(c._id)" />
                      <span class="option-name">{{ c.name }}</span>
                      <span class="option-sub">{{ c.phone || c.email || '—' }}</span>
                    </label>
                  } @empty {
                    <p class="hint">{{ contactsLoading() ? 'Cargando contactos…' : 'Ningún contacto coincide.' }}</p>
                  }
                </div>
              }

              @if (source() === 'file') {
                <label class="upload" [class.busy]="parsing()">
                  <input type="file" accept=".xlsx,.xlsm,.csv,.txt" hidden (change)="onFile($event)" [disabled]="parsing()" />
                  <lucide-icon [img]="parsing() ? RefreshCw : Upload" [size]="20" [class.spin]="parsing()"></lucide-icon>
                  <span>{{ parsing() ? 'Leyendo archivo…' : (file() ? fileName() + ' · ' + file()!.total + ' filas' : 'Elige un archivo .xlsx o .csv') }}</span>
                </label>
                @if (file(); as f) {
                  <p class="hint">Indica qué columna es cada dato. Las demás se pueden usar en el mensaje.</p>
                  <div class="map">
                    <label class="field">
                      <span class="label">Nombre</span>
                      <select class="select" [(ngModel)]="map.name">
                        <option value="">— ninguna —</option>
                        @for (c of f.columns; track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    </label>
                    <label class="field">
                      <span class="label">Teléfono</span>
                      <select class="select" [(ngModel)]="map.phone">
                        <option value="">— ninguna —</option>
                        @for (c of f.columns; track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    </label>
                    <label class="field">
                      <span class="label">Email</span>
                      <select class="select" [(ngModel)]="map.email">
                        <option value="">— ninguna —</option>
                        @for (c of f.columns; track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    </label>
                  </div>
                  @if (f.total > f.rows.length) {
                    <p class="hint warn">El archivo tiene {{ f.total }} filas: se usarán las primeras {{ f.rows.length }}.</p>
                  }
                }
              }
            </div>

            <div class="field">
              <span class="label">¿Por dónde lo vas a enviar?</span>
              <div class="chips">
                @for (c of channels; track c.key) {
                  <button type="button" class="chip" [class.active]="form.channel === c.key" (click)="form.channel = c.key">{{ c.label }}</button>
                }
              </div>
            </div>

            @if (form.channel === 'email') {
              <label class="field">
                <span class="label">Asunto (opcional)</span>
                <input class="input" [(ngModel)]="form.subject" maxlength="200" />
              </label>
            }
            <div class="field">
              <span class="label">Mensaje predeterminado (opcional)</span>
              <app-variable-chips [variables]="messageVariables()" (pick)="insert($event, messageInput)" />
              <textarea class="textarea" #messageInput rows="4" [(ngModel)]="form.message" maxlength="5000"
                placeholder="Hola {primer_nombre}, mira esto: {link}"></textarea>
              <span class="hint">La variable "Link corto" se sustituye por el link de cada persona.</span>
            </div>
          </div>
          <div class="drawer-footer">
            <span class="hint">{{ summary() }}</span>
            <button class="btn btn-primary" (click)="create()" [disabled]="creating() || !canSubmit()">
              {{ creating() ? 'Generando…' : 'Generar links' }}
            </button>
          </div>
        </aside>
      </div>
    }

    <!-- Detalle -->
    @if (detail(); as d) {
      <div class="overlay" (click)="detail.set(null)" role="dialog" aria-modal="true" aria-label="Links del lote">
        <aside class="drawer wide" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div>
              <h2>{{ d.batch.name }}</h2>
              <p class="hint">{{ d.rows.length }} links · {{ clicked(d.rows) }} con clic</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="detail.set(null)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="drawer-body">
            <ul class="rows">
              @for (r of d.rows.slice(0, 300); track r._id) {
                <li class="row">
                  <div class="row-main">
                    <span class="row-name">{{ r.name || r.phone || r.email || 'Sin nombre' }}</span>
                    <span class="row-sub">{{ r.phone }}{{ r.phone && r.email ? ' · ' : '' }}{{ r.email }}</span>
                    <button class="short" (click)="copy(r.shortUrl)">{{ r.shortUrl }} <lucide-icon [img]="Copy" [size]="12"></lucide-icon></button>
                    @if (r.message) { <p class="row-msg">{{ r.message }}</p> }
                  </div>
                  <div class="row-side">
                    <span class="badge" [class.badge-success]="r.clicks > 0" [class.badge-neutral]="!r.clicks">{{ r.clicks }} clic(s)</span>
                    @if (r.message) {
                      <button class="btn btn-ghost btn-sm" (click)="copy(r.message)">
                        <lucide-icon [img]="Copy" [size]="13"></lucide-icon> Mensaje
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
            @if (d.rows.length > 300) {
              <p class="hint center">Se muestran 300 de {{ d.rows.length }}. Descarga el CSV para verlos todos.</p>
            }
          </div>
          <div class="drawer-footer">
            <a class="btn btn-secondary" routerLink="/links/analitica" [queryParams]="{ batchId: d.batch._id }">
              <lucide-icon [img]="BarChart3" [size]="15"></lucide-icon> Analítica
            </a>
            <button class="btn btn-primary" (click)="exportBatch(d.batch)">
              <lucide-icon [img]="Download" [size]="15"></lucide-icon> Descargar CSV
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:16px; }
    .bar { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
    .lead { margin:0; font-size:13px; color:var(--color-text-muted); max-width:640px; }
    .skeleton { height:160px; background:var(--color-bg-light); }
    .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:56px 24px; color:var(--color-text-muted); }
    .empty h3 { margin:8px 0 0; color:var(--color-text-main); font-family:var(--font-heading); }
    .empty p { margin:0; }
    .num { text-align:right; }
    .t-title { font-weight:600; overflow-wrap:anywhere; }
    .t-sub { font-size:12px; color:var(--color-text-muted); overflow-wrap:anywhere; }
    .actions { display:flex; gap:2px; justify-content:flex-end; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      justify-content:flex-end; z-index:100; }
    .drawer { width:100%; max-width:560px; height:100%; background:var(--color-white); display:flex; flex-direction:column;
      box-shadow:var(--shadow-lg); animation:slide-in .35s var(--transition-spring); }
    .drawer.wide { max-width:680px; }
    @keyframes slide-in { from { transform:translateX(40px); opacity:0; } to { transform:none; opacity:1; } }
    .drawer-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:24px 28px 16px; }
    .drawer-header h2 { margin:0; font-family:var(--font-heading); font-size:20px; overflow-wrap:anywhere; }
    .drawer-body { flex:1; overflow-y:auto; padding:8px 28px 24px; display:flex; flex-direction:column; gap:18px; }
    .drawer-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 28px;
      border-top:1px solid var(--color-border); }
    .field { display:flex; flex-direction:column; gap:8px; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); }
    .hint { margin:0; font-size:12px; color:var(--color-text-muted); }
    .hint.warn { color:var(--color-warning); }
    .hint a { color:var(--color-brand); }
    .center { text-align:center; }
    .chips { display:flex; gap:8px; flex-wrap:wrap; }
    .chip { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; font-family:var(--font-base); font-size:13px;
      font-weight:500; border-radius:var(--radius-pill); border:1px solid var(--color-border); background:var(--color-white);
      color:var(--color-text-muted); cursor:pointer; transition:all var(--transition-fast); }
    .chip.active { background:var(--color-brand); border-color:var(--color-brand); color:var(--color-white); }
    .options { display:flex; flex-direction:column; }
    .options.scroll { max-height:240px; overflow-y:auto; }
    .option { display:flex; align-items:center; gap:10px; padding:10px 6px; font-size:13px; cursor:pointer;
      border-top:1px solid var(--color-border); }
    .option.head { border-top:none; color:var(--color-text-muted); }
    .option.selected { background:var(--color-brand-light); }
    .option-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .option-sub { margin-left:auto; font-size:12px; color:var(--color-text-muted); white-space:nowrap; }
    .dot { width:10px; height:10px; border-radius:var(--radius-pill); flex-shrink:0; }
    .search { display:flex; align-items:center; gap:8px; color:var(--color-text-muted); }
    .search .input { flex:1; }
    .upload { display:flex; align-items:center; justify-content:center; gap:10px; padding:20px; cursor:pointer; text-align:center;
      border:1.5px dashed var(--color-border); border-radius:var(--radius-md); color:var(--color-text-muted); font-size:13px; }
    .upload:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .upload.busy { pointer-events:none; opacity:.7; }
    .map { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
    .rows { list-style:none; margin:0; padding:0; }
    .row { display:flex; gap:12px; padding:14px 0; border-top:1px solid var(--color-border); }
    .row:first-child { border-top:none; }
    .row-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; align-items:flex-start; }
    .row-name { font-weight:600; font-size:14px; }
    .row-sub { font-size:12px; color:var(--color-text-muted); overflow-wrap:anywhere; }
    .row-msg { margin:4px 0 0; font-size:12px; color:var(--color-text-main); white-space:pre-wrap; overflow-wrap:anywhere;
      background:var(--color-bg-light); border-radius:var(--radius-md); padding:8px 10px; align-self:stretch; }
    .row-side { display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }
    .short { display:inline-flex; align-items:center; gap:6px; border:none; cursor:pointer; font-family:var(--font-base);
      font-size:12px; font-weight:600; background:var(--color-brand-light); color:var(--color-brand);
      border-radius:var(--radius-pill); padding:4px 10px; overflow-wrap:anywhere; text-align:left; }
    .spin { animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width: 700px) {
      .drawer, .drawer.wide { max-width:100%; }
      .map { grid-template-columns:1fr; }
    }
  `],
})
export class LinkBatchesComponent implements OnInit {
  private api = inject(LinksApiService);
  private templatesApi = inject(TemplatesApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);

  /** Dominios cortos activos, para elegir con cuál salen los links. */
  domains = input<string[]>([]);

  readonly Plus = Plus; readonly X = X; readonly Upload = Upload; readonly List = List; readonly Users = Users;
  readonly FileSpreadsheet = FileSpreadsheet; readonly BarChart3 = BarChart3; readonly Download = Download;
  readonly Trash2 = Trash2; readonly Copy = Copy; readonly Eye = Eye; readonly Search = Search;
  readonly Link2 = Link2; readonly RefreshCw = RefreshCw;
  readonly channels = CHANNELS;

  batches = signal<LinkBatch[]>([]);
  loading = signal(true);
  wizardOpen = signal(false);
  creating = signal(false);
  detail = signal<{ batch: LinkBatch; rows: BatchRow[] } | null>(null);

  source = signal<Source>('lists');
  lists = signal<ListMini[]>([]);
  listIds = signal<string[]>([]);
  contacts = signal<ContactMini[]>([]);
  contactsLoading = signal(false);
  contactQuery = signal('');
  customerIds = signal<string[]>([]);
  file = signal<ParsedFile | null>(null);
  fileName = signal('');
  parsing = signal(false);
  variables = signal<TemplateVariable[]>([]);

  form = { name: '', destination: '', domain: '', channel: 'sms' as LinkChannel, message: '', subject: '' };
  map = { name: '', phone: '', email: '' };

  canCreate = computed(() => this.permissions.canAct('campaigns', 'create'));
  canDelete = computed(() => this.permissions.canAct('campaigns', 'delete'));

  private contactMatches = computed(() => {
    const q = this.contactQuery().trim().toLowerCase();
    if (!q) return this.contacts();
    return this.contacts().filter(c =>
      c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) || (c.tags ?? []).some(t => t.toLowerCase().includes(q)),
    );
  });
  contactResults = computed(() => this.contactMatches().slice(0, 150));
  allShownSelected = computed(() => {
    const shown = this.contactResults();
    return shown.length > 0 && shown.every(c => this.customerIds().includes(c._id));
  });

  /** Variables del mensaje: las fijas, o las columnas del archivo si viene de un Excel. */
  messageVariables = computed<TemplateVariable[]>(() => {
    const base = this.variables().filter(v => !v.token.startsWith('{campo:') && v.token !== '{baja}');
    const f = this.file();
    if (this.source() !== 'file' || !f) return this.variables().filter(v => v.token !== '{baja}');
    const used = new Set([this.map.name, this.map.phone, this.map.email]);
    return [
      ...base,
      ...f.columns.filter(c => !used.has(c)).slice(0, 12).map(c => ({ token: '{campo:' + c + '}', label: c, example: f.rows[0]?.[c] ?? '' })),
    ];
  });

  ngOnInit() {
    this.load();
    this.templatesApi.variables().subscribe({ next: v => this.variables.set(v), error: () => {} });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.detail()) this.detail.set(null);
    else if (this.wizardOpen()) this.wizardOpen.set(false);
  }

  private load() {
    this.api.batches().subscribe({
      next: b => { this.batches.set(b); this.loading.set(false); },
      error: (err: ErrorLike) => { this.loading.set(false); this.toast.error(this.message(err, 'No se pudieron cargar los lotes')); },
    });
  }

  channelLabel(c: LinkChannel) { return CHANNELS.find(x => x.key === c)?.label ?? c; }
  channelIcon(c: LinkChannel) { return c === 'email' ? Mail : c === 'whatsapp' ? MessageCircle : c === 'sms' ? MessageSquare : Link2; }
  sourceLabel(s: Source) { return s === 'lists' ? 'Lista' : s === 'file' ? 'Archivo' : 'Contactos'; }
  clicked(rows: BatchRow[]) { return rows.filter(r => r.clicks > 0).length; }

  openWizard() {
    this.form = { name: '', destination: '', domain: '', channel: 'sms', message: '', subject: '' };
    this.map = { name: '', phone: '', email: '' };
    this.listIds.set([]);
    this.customerIds.set([]);
    this.file.set(null);
    this.source.set('lists');
    this.wizardOpen.set(true);
    if (!this.lists().length) {
      this.http.get<ListMini[]>(environment.apiUrl + '/lists').subscribe({ next: l => this.lists.set(l), error: () => {} });
    }
  }

  setSource(s: Source) {
    this.source.set(s);
    if (s === 'contacts' && !this.contacts().length && !this.contactsLoading()) {
      this.contactsLoading.set(true);
      this.http.get<ContactMini[]>(environment.apiUrl + '/customers').subscribe({
        next: c => { this.contacts.set(c); this.contactsLoading.set(false); },
        error: () => { this.contactsLoading.set(false); this.toast.error('No se pudieron cargar los contactos'); },
      });
    }
  }

  toggleList(id: string) { this.listIds.update(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])); }
  toggleContact(id: string) { this.customerIds.update(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])); }
  toggleShown() {
    const shown = this.contactResults().map(c => c._id);
    if (this.allShownSelected()) this.customerIds.update(ids => ids.filter(id => !shown.includes(id)));
    else this.customerIds.update(ids => [...new Set([...ids, ...shown])]);
  }

  onFile(event: Event) {
    const el = event.target as HTMLInputElement;
    const picked = el.files?.[0];
    el.value = '';
    if (!picked) return;
    this.parsing.set(true);
    this.api.parseFile(picked).subscribe({
      next: parsed => {
        this.parsing.set(false);
        this.file.set(parsed);
        this.fileName.set(picked.name);
        this.map = {
          name: guess(parsed.columns, /nombre|name|cliente|contacto/),
          phone: guess(parsed.columns, /tel|cel|phone|m[oó]vil|whatsapp|n[uú]mero/),
          email: guess(parsed.columns, /mail|correo/),
        };
        this.toast.success(parsed.total + ' filas leídas');
      },
      error: (err: ErrorLike) => { this.parsing.set(false); this.toast.error(this.message(err, 'No se pudo leer el archivo')); },
    });
  }

  private recipientCount(): number {
    if (this.source() === 'contacts') return this.customerIds().length;
    if (this.source() === 'file') return this.file()?.rows.length ?? 0;
    return this.lists().filter(l => this.listIds().includes(l._id)).reduce((n, l) => n + (l.memberCount ?? 0), 0);
  }

  summary(): string {
    const n = this.recipientCount();
    return n ? 'Se generarán hasta ' + n + ' link(s)' : 'Elige destinatarios';
  }

  canSubmit(): boolean {
    if (!this.form.name.trim() || !this.form.destination.trim() || !this.recipientCount()) return false;
    return this.source() !== 'file' || !!(this.map.name || this.map.phone || this.map.email);
  }

  insert(token: string, el: HTMLTextAreaElement) { this.form.message = insertAtCursor(el, token); }

  create() {
    const input: BatchInput = {
      name: this.form.name.trim(),
      destination: this.form.destination.trim(),
      domain: this.form.domain || undefined,
      channel: this.form.channel,
      message: this.form.message || undefined,
      subject: this.form.channel === 'email' ? this.form.subject.trim() || undefined : undefined,
    };
    const f = this.file();
    if (this.source() === 'lists') input.listIds = this.listIds();
    else if (this.source() === 'contacts') input.customerIds = this.customerIds();
    else if (f) {
      const mapped = new Set([this.map.name, this.map.phone, this.map.email].filter(Boolean));
      input.rows = f.rows.map(row => {
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) if (!mapped.has(key) && value) fields[key] = String(value);
        return {
          name: this.map.name ? row[this.map.name] : undefined,
          phone: this.map.phone ? row[this.map.phone] : undefined,
          email: this.map.email ? row[this.map.email] : undefined,
          fields,
        };
      });
    }
    this.creating.set(true);
    this.api.createBatch(input).subscribe({
      next: batch => {
        this.creating.set(false);
        this.wizardOpen.set(false);
        this.toast.success(batch.count + ' links generados');
        this.load();
        this.openDetail(batch);
      },
      error: (err: ErrorLike) => { this.creating.set(false); this.toast.error(this.message(err, 'No se pudo generar el lote')); },
    });
  }

  openDetail(b: LinkBatch) {
    this.api.batch(b._id).subscribe({
      next: d => this.detail.set(d),
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo abrir el lote')),
    });
  }

  exportBatch(b: LinkBatch) {
    this.api.exportBatch(b._id).subscribe({
      next: blob => { saveBlob(blob, 'links-' + b.name.replace(/[^\w-]+/g, '_').slice(0, 40) + '.csv'); this.toast.success('CSV descargado'); },
      error: () => this.toast.error('No se pudo descargar'),
    });
  }

  async remove(b: LinkBatch) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar lote',
      message: 'Se eliminarán los ' + b.count + ' links de "' + b.name + '" y dejarán de funcionar. También se pierde su historial de clics.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.removeBatch(b._id).subscribe({
      next: () => { this.toast.success('Lote eliminado'); this.load(); },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo eliminar')),
    });
  }

  copy(text: string) {
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
