import { Component, HostListener, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  LucideAngularModule, X, Upload, Database, FileSpreadsheet, ArrowLeft, ArrowRight,
  CheckCircle2, AlertTriangle, RefreshCw, Trash2, Play, Save,
} from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { ConfirmService } from '../../../shared/confirm';
import {
  AnalyzeResult, ContactImportApiService, ContactSource, DedupeKey,
  ImportMapping, ImportResult, TargetField,
} from '../../../core/api/contact-import-api.service';

type Step = 'source' | 'mapping' | 'result';
type Mode = 'file' | 'mongo';

/** Campos del contacto, con la etiqueta y ayuda que ve el usuario. */
const FIELDS: { key: TargetField; label: string; hint: string }[] = [
  { key: 'name', label: 'Nombre', hint: 'Si falta, se usa el email o el teléfono' },
  { key: 'email', label: 'Email', hint: 'Identifica al contacto' },
  { key: 'phone', label: 'Teléfono', hint: 'Identifica al contacto en WhatsApp' },
  { key: 'tags', label: 'Etiquetas', hint: 'Separadas por ; o ,' },
  { key: 'notes', label: 'Notas', hint: 'Texto libre' },
];

@Component({
  selector: 'app-contact-import',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="overlay" (click)="tryClose()">
      <aside class="drawer" (click)="$event.stopPropagation()" role="dialog" aria-label="Importar contactos">
        <header class="drawer-head">
          <div>
            <h2>Importar contactos</h2>
            <p class="steps">
              <span [class.active]="step() === 'source'">1. Origen</span>
              <span [class.active]="step() === 'mapping'">2. Campos</span>
              <span [class.active]="step() === 'result'">3. Resultado</span>
            </p>
          </div>
          <button class="btn btn-sm btn-ghost btn-icon" (click)="tryClose()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18"></lucide-icon>
          </button>
        </header>

        <div class="drawer-body">
          @if (error()) { <div class="error-box">{{ error() }}</div> }

          <!-- ══ Paso 1: origen ══ -->
          @if (step() === 'source') {
            <div class="tabs">
              <button class="tab" [class.active]="mode() === 'file'" (click)="mode.set('file')">
                <lucide-icon [img]="FileSpreadsheet" [size]="16"></lucide-icon> Archivo
              </button>
              <button class="tab" [class.active]="mode() === 'mongo'" (click)="mode.set('mongo')">
                <lucide-icon [img]="Database" [size]="16"></lucide-icon> MongoDB
              </button>
            </div>

            @if (mode() === 'file') {
              <input type="file" #picker hidden accept=".xlsx,.xlsm,.csv,.json,.ndjson,.jsonl"
                (change)="onFile($event)" />
              <button class="drop-zone" (click)="picker.click()" [disabled]="loading()">
                <lucide-icon [img]="loading() ? RefreshCw : Upload" [size]="26" [class.spin]="loading()"></lucide-icon>
                <span>{{ file() ? file()!.name : 'Elige un archivo .xlsx, .csv o .json' }}</span>
                <small>
                  En Excel y CSV, la primera fila son los nombres de columna.
                  En JSON, el volcado de una colección de MongoDB Compass.
                </small>
              </button>
            } @else {
              @if (sources().length) {
                <div class="saved">
                  <span class="saved-title">Conexiones guardadas</span>
                  @for (s of sources(); track s._id) {
                    <div class="saved-row">
                      <div class="saved-info">
                        <span class="saved-label">{{ s.label }}</span>
                        <span class="saved-sub">{{ s.host }} · {{ s.database }}.{{ s.collection }}</span>
                        @if (s.lastRunAt) {
                          <span class="saved-sub">
                            Última: {{ s.lastRunAt | date:'d MMM y, HH:mm' }} —
                            {{ s.lastImported }} nuevos, {{ s.lastUpdated }} actualizados
                          </span>
                        }
                        @if (s.lastError) {
                          <span class="saved-error">
                            <lucide-icon [img]="AlertTriangle" [size]="12"></lucide-icon> {{ s.lastError }}
                          </span>
                        }
                      </div>
                      <div class="saved-actions">
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="runSource(s)"
                          [disabled]="loading()" title="Volver a importar">
                          <lucide-icon [img]="Play" [size]="14"></lucide-icon>
                        </button>
                        <button class="btn btn-sm btn-ghost btn-icon" (click)="removeSource(s)" title="Eliminar">
                          <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }

              <div class="field">
                <label class="label">URI de conexión *</label>
                <input class="input" [(ngModel)]="conn.uri" placeholder="mongodb+srv://usuario:clave@cluster.mongodb.net" />
                <span class="field-hint">Se guarda cifrada en el servidor y nunca vuelve al navegador.</span>
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="label">Base de datos *</label>
                  <input class="input" [(ngModel)]="conn.database" placeholder="crm" />
                </div>
                <div class="field">
                  <label class="label">Colección *</label>
                  <input class="input" [(ngModel)]="conn.collection" placeholder="clientes" />
                </div>
              </div>
              <div class="field">
                <label class="label">Filtro <span class="opt">(opcional, JSON)</span></label>
                <textarea class="textarea" rows="2" [(ngModel)]="filterText"
                  placeholder='{ "activo": true }'></textarea>
                <span class="field-hint">Acota qué documentos se importan. Vacío = toda la colección.</span>
              </div>
            }
          }

          <!-- ══ Paso 2: mapeo ══ -->
          @if (step() === 'mapping' && analysis()) {
            <div class="hint-box">
              {{ analysis()!.totalRows }} registro(s) encontrados.
              Indica qué columna del origen corresponde a cada campo del contacto.
            </div>

            @for (f of fields; track f.key) {
              <div class="map-row">
                <div class="map-target">
                  <span class="map-label">{{ f.label }}</span>
                  <span class="map-hint">{{ f.hint }}</span>
                </div>
                <div class="map-source">
                  <select class="select" [ngModel]="mapping()[f.key] || ''" (ngModelChange)="setMapping(f.key, $event)">
                    <option value="">— No importar —</option>
                    @for (col of analysis()!.columns; track col) {
                      <option [value]="col">{{ col }}</option>
                    }
                  </select>
                  @if (mapping()[f.key] && sampleOf(mapping()[f.key]!)) {
                    <span class="map-sample">Ej.: {{ sampleOf(mapping()[f.key]!) }}</span>
                  }
                </div>
              </div>
            }

            <div class="section-sep">Opciones</div>

            <div class="field">
              <label class="label">Identificar contactos existentes por</label>
              <select class="select" [(ngModel)]="dedupeBy">
                <option value="both">Email y, si falta, teléfono</option>
                <option value="email">Solo email</option>
                <option value="phone">Solo teléfono</option>
              </select>
            </div>

            <div class="field">
              <label class="label">Etiquetas para todos <span class="opt">(opcional)</span></label>
              <input class="input" [(ngModel)]="tagsText" placeholder="importado, black-friday" />
              <span class="field-hint">Separadas por comas. Se añaden a las que traiga el origen.</span>
            </div>

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="updateExisting" />
              <span>Actualizar los contactos que ya existen. Si lo desmarcas, solo se crean los nuevos.</span>
            </label>

            <div class="section-sep">Campos adicionales</div>

            @if (extraColumns().length === 0) {
              <p class="field-hint">Todas las columnas del origen están asignadas a un campo del contacto.</p>
            } @else {
              <div class="extras-head">
                <span class="field-hint">
                  Elige qué otras columnas guardar en el contacto.
                  {{ customFields().length }} de {{ extraColumns().length }} seleccionada(s).
                </span>
                <div class="extras-actions">
                  <button type="button" class="btn btn-sm btn-ghost" (click)="selectAllExtras()">Todas</button>
                  <button type="button" class="btn btn-sm btn-ghost" (click)="clearExtras()">Ninguna</button>
                </div>
              </div>
              <div class="extras-list">
                @for (col of extraColumns(); track col) {
                  <label class="extra-row" [class.picked]="customFields().includes(col)">
                    <input type="checkbox" [checked]="customFields().includes(col)"
                      (change)="toggleExtra(col)" />
                    <span class="extra-info">
                      <span class="extra-name">{{ col }}</span>
                      @if (sampleOf(col)) { <span class="extra-sample">{{ sampleOf(col) }}</span> }
                    </span>
                  </label>
                }
              </div>
            }

            @if (mode() === 'mongo') {
              <div class="field">
                <label class="label">Guardar esta conexión como <span class="opt">(opcional)</span></label>
                <input class="input" [(ngModel)]="saveAs" placeholder="CRM antiguo" />
                <span class="field-hint">Guardada podrás re-importar con un clic, sin volver a escribir la URI.</span>
              </div>
            }
          }

          <!-- ══ Paso 3: resultado ══ -->
          @if (step() === 'result' && result()) {
            <div class="result">
              <lucide-icon [img]="CheckCircle2" [size]="40" [strokeWidth]="1.6" class="result-icon"></lucide-icon>
              <h3>Importación terminada</h3>
              <div class="result-grid">
                <div class="result-cell">
                  <span class="result-value">{{ result()!.imported }}</span>
                  <span class="result-label">Nuevos</span>
                </div>
                <div class="result-cell">
                  <span class="result-value">{{ result()!.updated }}</span>
                  <span class="result-label">Actualizados</span>
                </div>
                <div class="result-cell">
                  <span class="result-value">{{ result()!.skipped }}</span>
                  <span class="result-label">Omitidos</span>
                </div>
                <div class="result-cell">
                  <span class="result-value">{{ result()!.total }}</span>
                  <span class="result-label">Leídos</span>
                </div>
              </div>
              @if (result()!.errors.length) {
                <div class="result-errors">
                  <span class="result-errors-title">
                    <lucide-icon [img]="AlertTriangle" [size]="14"></lucide-icon>
                    Filas omitidas
                  </span>
                  @for (e of result()!.errors; track $index) { <span class="result-error">{{ e }}</span> }
                </div>
              }
            </div>
          }
        </div>

        <footer class="drawer-foot">
          @if (step() === 'mapping') {
            <button class="btn btn-ghost" (click)="back()">
              <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Atrás
            </button>
          }
          <span class="spacer"></span>
          @if (step() === 'source') {
            <button class="btn btn-ghost" (click)="tryClose()">Cancelar</button>
            <button class="btn btn-primary" (click)="analyze()" [disabled]="loading() || !canAnalyze()">
              <lucide-icon [img]="loading() ? RefreshCw : ArrowRight" [size]="16" [class.spin]="loading()"></lucide-icon>
              {{ loading() ? 'Leyendo…' : 'Continuar' }}
            </button>
          } @else if (step() === 'mapping') {
            <button class="btn btn-primary" (click)="runImport()" [disabled]="loading()">
              <lucide-icon [img]="loading() ? RefreshCw : Save" [size]="16" [class.spin]="loading()"></lucide-icon>
              {{ loading() ? 'Importando…' : 'Importar contactos' }}
            </button>
          } @else {
            <button class="btn btn-primary" (click)="finish()">Listo</button>
          }
        </footer>
      </aside>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: flex-end; z-index: 100;
    }
    .drawer {
      width: 620px; max-width: 100%; background: var(--color-white);
      display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
      animation: slide-in var(--transition-spring);
    }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .drawer-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-head h2 { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .steps { display: flex; gap: 12px; margin: 0; font-size: 12px; color: var(--color-text-muted); }
    .steps .active { color: var(--color-brand); font-weight: 700; }

    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 18px; }
    .drawer-foot { display: flex; align-items: center; gap: 10px; padding: 20px 28px; border-top: 1px solid var(--color-border); flex-shrink: 0; }
    .spacer { flex: 1; }

    .tabs { display: flex; gap: 8px; }
    .tab {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      border: 1px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted);
      border-radius: var(--radius-pill); padding: 10px 18px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all var(--transition-fast);
    }
    .tab:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .tab.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }

    .drop-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 40px 20px; cursor: pointer;
      border: 1.5px dashed var(--color-border); border-radius: var(--radius-lg);
      background: var(--color-bg-app); color: var(--color-text-muted);
      font-size: 14px; font-weight: 600; transition: all var(--transition-fast);
    }
    .drop-zone:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
    .drop-zone small { font-weight: 500; font-size: 12px; }

    .saved { display: flex; flex-direction: column; gap: 10px; }
    .saved-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }
    .saved-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 14px 16px; }
    .saved-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .saved-label { font-size: 14px; font-weight: 700; color: var(--color-text-main); }
    .saved-sub { font-size: 12px; color: var(--color-text-muted); word-break: break-all; }
    .saved-error { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-error); }
    .saved-actions { display: flex; gap: 2px; flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .label .opt { font-weight: 500; color: var(--color-text-muted); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .map-row { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; align-items: start; }
    .map-target { display: flex; flex-direction: column; gap: 2px; padding-top: 10px; }
    .map-label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .map-hint { font-size: 11px; color: var(--color-text-muted); }
    .map-source { display: flex; flex-direction: column; gap: 4px; }
    .map-sample { font-size: 11px; color: var(--color-text-muted); padding-left: 14px; word-break: break-all; }

    .section-sep { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); border-top: 1px solid var(--color-border); padding-top: 16px; }

    .extras-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .extras-head .field-hint { flex: 1; min-width: 200px; }
    .extras-actions { display: flex; gap: 4px; flex-shrink: 0; }
    /*
     * flex-shrink: 0 es obligatorio. La lista scrollea, así que su min-height
     * resuelve a 0 y el .drawer-body (columna flex) la aplastaba hasta dejarla
     * invisible en cuanto el paso de mapeo crecía.
     */
    .extras-list {
      flex-shrink: 0; display: grid; gap: 4px;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      max-height: 300px; overflow-y: auto;
      border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px;
    }
    .extra-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: background var(--transition-fast); min-width: 0; }
    .extra-row:hover { background: var(--color-bg-app); }
    .extra-row.picked { background: var(--color-brand-light); }
    .extra-row input { margin-top: 3px; flex-shrink: 0; accent-color: var(--color-brand); }
    .extra-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .extra-name { font-size: 13px; font-weight: 600; color: var(--color-text-main); word-break: break-all; }
    .extra-sample { font-size: 11px; color: var(--color-text-muted); word-break: break-all; }

    .check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--color-text-main); cursor: pointer; }
    .check-row input { margin-top: 2px; flex-shrink: 0; }

    .result { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 24px 0; text-align: center; }
    .result-icon { color: #16A34A; }
    .result h3 { font-family: var(--font-heading); font-size: 18px; margin: 0; }
    .result-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 100%; }
    .result-cell { background: var(--color-bg-app); border-radius: var(--radius-lg); padding: 16px 10px; display: flex; flex-direction: column; gap: 2px; }
    .result-value { font-size: 22px; font-weight: 700; color: var(--color-text-main); }
    .result-label { font-size: 11px; color: var(--color-text-muted); }
    .result-errors { width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left; background: #FEFCE8; border: 1px solid #FEF08A; border-radius: var(--radius-lg); padding: 14px 16px; }
    .result-errors-title { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #854D0E; }
    .result-error { font-size: 12px; color: #854D0E; }

    .error-box { background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; border-radius: var(--radius-lg); padding: 12px 16px; font-size: 13px; }
    .hint-box { background: var(--color-bg-app); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 13px; color: var(--color-text-muted); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 768px) {
      .drawer { width: 100%; }
      .drawer-head, .drawer-body, .drawer-foot { padding-left: 20px; padding-right: 20px; }
      .field-row, .map-row { grid-template-columns: 1fr; }
      .map-target { padding-top: 0; }
      .result-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class ContactImportComponent implements OnInit {
  private api = inject(ContactImportApiService);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  /** Se emite al cerrar; `true` si algo se importó y la lista debe recargarse. */
  closed = output<boolean>();

  readonly X = X;
  readonly Upload = Upload;
  readonly Database = Database;
  readonly FileSpreadsheet = FileSpreadsheet;
  readonly ArrowLeft = ArrowLeft;
  readonly ArrowRight = ArrowRight;
  readonly CheckCircle2 = CheckCircle2;
  readonly AlertTriangle = AlertTriangle;
  readonly RefreshCw = RefreshCw;
  readonly Trash2 = Trash2;
  readonly Play = Play;
  readonly Save = Save;

  readonly fields = FIELDS;

  step = signal<Step>('source');
  mode = signal<Mode>('file');
  loading = signal(false);
  error = signal('');

  file = signal<File | null>(null);
  conn = { uri: '', database: '', collection: '' };
  filterText = '';

  sources = signal<ContactSource[]>([]);
  analysis = signal<AnalyzeResult | null>(null);
  mapping = signal<ImportMapping>({});
  result = signal<ImportResult | null>(null);

  dedupeBy: DedupeKey = 'both';
  tagsText = '';
  updateExisting = true;
  saveAs = '';

  /** Columnas del origen elegidas para guardarse como campos adicionales. */
  customFields = signal<string[]>([]);

  /** true si algo llegó a importarse: la lista de fuera debe recargarse. */
  private touched = false;

  /** Columnas que no están asignadas a ningún campo del contacto. */
  extraColumns = computed(() => {
    const taken = new Set(Object.values(this.mapping()).filter(Boolean));
    return (this.analysis()?.columns ?? []).filter(col => !taken.has(col));
  });

  canAnalyze = computed(() =>
    this.mode() === 'file'
      ? !!this.file()
      : !!this.conn.uri.trim() && !!this.conn.database.trim() && !!this.conn.collection.trim(),
  );

  ngOnInit() {
    this.api.listSources().subscribe({
      next: list => this.sources.set(list),
      error: () => this.sources.set([]),
    });
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.tryClose(); }

  async tryClose() {
    if (this.step() === 'mapping') {
      const ok = await this.confirmSvc.confirm({
        title: 'Cancelar importación',
        message: 'Se perderá el mapeo de campos que llevas hecho.',
        confirmText: 'Cancelar importación',
        danger: true,
      });
      if (!ok) return;
    }
    this.closed.emit(this.touched);
  }

  finish() { this.closed.emit(true); }

  back() {
    this.step.set('source');
    this.error.set('');
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (picked) {
      this.file.set(picked);
      this.error.set('');
    }
  }

  // ── Paso 1 → 2 ──

  analyze() {
    this.error.set('');
    this.loading.set(true);
    const done = (a: AnalyzeResult) => {
      this.analysis.set(a);
      this.mapping.set({ ...a.suggested } as ImportMapping);
      this.customFields.set([]);
      this.loading.set(false);
      this.step.set('mapping');
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.loading.set(false);
      this.error.set(err.error?.message || 'No se pudo leer el origen de datos');
    };

    if (this.mode() === 'file') {
      const file = this.file();
      if (!file) return;
      this.api.analyzeFile(file).subscribe({ next: done, error: fail });
      return;
    }

    const filter = this.parseFilter();
    if (filter === undefined) { this.loading.set(false); return; }
    this.api.analyzeMongo({ ...this.conn, filter }).subscribe({ next: done, error: fail });
  }

  setMapping(field: TargetField, column: string) {
    this.mapping.update(m => ({ ...m, [field]: column || undefined }));
    // La columna recién asignada ya no es un campo adicional.
    if (column) this.customFields.update(cols => cols.filter(c => c !== column));
  }

  sampleOf(column: string): string {
    return (this.analysis()?.samples[column] ?? []).slice(0, 2).join(' · ');
  }

  toggleExtra(column: string) {
    this.customFields.update(cols =>
      cols.includes(column) ? cols.filter(c => c !== column) : [...cols, column],
    );
  }

  selectAllExtras() { this.customFields.set([...this.extraColumns()]); }

  clearExtras() { this.customFields.set([]); }

  // ── Paso 2 → 3 ──

  runImport() {
    const map = this.mapping();
    if (!map.email && !map.phone) {
      this.error.set('Mapea al menos el email o el teléfono: son los campos que identifican al contacto');
      return;
    }

    this.error.set('');
    this.loading.set(true);
    const options = {
      mapping: map,
      dedupeBy: this.dedupeBy,
      tags: this.tagsText.split(',').map(t => t.trim()).filter(Boolean),
      updateExisting: this.updateExisting,
      customFields: this.customFields(),
    };
    const done = (r: ImportResult) => {
      this.result.set(r);
      this.touched = true;
      this.loading.set(false);
      this.step.set('result');
      this.toast.success(`${r.imported} contacto(s) nuevos, ${r.updated} actualizados`);
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.loading.set(false);
      const message = err.error?.message || 'No se pudo completar la importación';
      this.error.set(message);
      this.toast.error(message);
    };

    if (this.mode() === 'file') {
      const file = this.file();
      if (!file) return;
      this.api.importFile(file, options).subscribe({ next: done, error: fail });
      return;
    }

    const filter = this.parseFilter();
    if (filter === undefined) { this.loading.set(false); return; }
    this.api.importMongo({
      ...this.conn,
      filter,
      options,
      saveAs: this.saveAs.trim() || undefined,
    }).subscribe({ next: done, error: fail });
  }

  // ── Conexiones guardadas ──

  runSource(source: ContactSource) {
    this.loading.set(true);
    this.error.set('');
    this.api.runSource(source._id).subscribe({
      next: r => {
        this.result.set(r);
        this.touched = true;
        this.loading.set(false);
        this.step.set('result');
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        const message = err.error?.message || 'No se pudo importar desde esa conexión';
        this.error.set(message);
        this.toast.error(message);
      },
    });
  }

  async removeSource(source: ContactSource) {
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar conexión',
      message: `¿Eliminar "${source.label}"? Los contactos ya importados se quedan.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteSource(source._id).subscribe({
      next: () => {
        this.sources.update(list => list.filter(s => s._id !== source._id));
        this.toast.success('Conexión eliminada');
      },
      error: () => this.toast.error('No se pudo eliminar la conexión'),
    });
  }

  /** `undefined` significa JSON inválido: el error ya quedó en pantalla. */
  private parseFilter(): Record<string, unknown> | undefined {
    const text = this.filterText.trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('no es un objeto');
      return parsed as Record<string, unknown>;
    } catch {
      this.error.set('El filtro debe ser un objeto JSON válido, por ejemplo { "activo": true }');
      return undefined;
    }
  }
}
