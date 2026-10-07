import {
  Component, HostListener, OnDestroy, OnInit, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  LucideAngularModule, X, Save, Monitor, Smartphone, Send, ArrowUp, ArrowDown, Copy, Trash2, Plus,
  Heading, Type, Image, MousePointerClick, Minus, MoveVertical, Columns2, PanelBottom, Code,
  Settings2, Blocks, Upload, RefreshCw,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import {
  EmailTemplate, EmailTemplateInput, TemplateVariable, TemplatesApiService,
} from '../../core/api/templates-api.service';
import {
  Align, BLOCK_LABELS, BlockProps, ColumnItem, DEFAULT_SETTINGS, EmailBlock, EmailBlockType,
  EmailDesign, EmailSettings, FONT_OPTIONS, compileEmail, createBlock, emptyDesign, fillSample,
  newId, normalizeDesign,
} from './email-design';
import { VariableChipsComponent, insertAtCursor } from './variable-chips';

type ErrorLike = { error?: { message?: string } };

/** Lo que el editor necesita para abrir: una plantilla guardada o un borrador. */
export interface EmailEditorDraft extends EmailTemplateInput {
  _id?: string;
}

const PALETTE: EmailBlockType[] = ['header', 'text', 'image', 'button', 'columns', 'divider', 'spacer', 'footer', 'html'];

/**
 * Editor de plantillas de email a pantalla completa: constructor por bloques
 * con inspector, o modo HTML para pegar código, siempre con vista previa.
 */
@Component({
  selector: 'app-email-editor',
  standalone: true,
  imports: [LucideAngularModule, VariableChipsComponent],
  template: `
    <div class="editor" role="dialog" aria-modal="true" aria-label="Editor de plantilla de email">
      <!-- Barra superior -->
      <header class="bar">
        <input class="input name-input" [value]="name()" (input)="name.set($any($event.target).value)"
          maxlength="80" placeholder="Nombre de la plantilla" aria-label="Nombre de la plantilla" />
        <div class="seg" role="tablist" aria-label="Modo de edición">
          <button class="seg-btn" [class.active]="mode() === 'blocks'" (click)="setMode('blocks')">
            <lucide-icon [img]="Blocks" [size]="14"></lucide-icon> Bloques
          </button>
          <button class="seg-btn" [class.active]="mode() === 'html'" (click)="setMode('html')">
            <lucide-icon [img]="Code" [size]="14"></lucide-icon> HTML
          </button>
        </div>
        <div class="seg" role="group" aria-label="Vista previa">
          <button class="seg-btn" [class.active]="device() === 'desktop'" (click)="device.set('desktop')" aria-label="Escritorio">
            <lucide-icon [img]="Monitor" [size]="15"></lucide-icon>
          </button>
          <button class="seg-btn" [class.active]="device() === 'mobile'" (click)="device.set('mobile')" aria-label="Móvil">
            <lucide-icon [img]="Smartphone" [size]="15"></lucide-icon>
          </button>
        </div>
        <span class="bar-spacer"></span>
        <button class="btn btn-secondary btn-sm" (click)="testOpen.set(true)">
          <lucide-icon [img]="Send" [size]="14"></lucide-icon> Enviar prueba
        </button>
        <button class="btn btn-primary btn-sm" (click)="save()" [disabled]="saving()">
          <lucide-icon [img]="Save" [size]="14"></lucide-icon> {{ saving() ? 'Guardando…' : 'Guardar' }}
        </button>
        <button class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar editor">
          <lucide-icon [img]="X" [size]="20"></lucide-icon>
        </button>
      </header>

      <div class="body" [class.html-mode]="mode() === 'html'">
        <!-- Columna izquierda: estructura o código -->
        <aside class="left">
          @if (mode() === 'blocks') {
            <p class="section-title">Añadir bloque</p>
            <div class="palette">
              @for (type of palette; track type) {
                <button class="palette-btn" (click)="addBlock(type)" [title]="'Añadir ' + labels[type]">
                  <lucide-icon [img]="iconFor(type)" [size]="16"></lucide-icon>
                  <span>{{ labels[type] }}</span>
                </button>
              }
            </div>

            <p class="section-title">Estructura</p>
            <button class="layer" [class.active]="selectedId() === null" (click)="selectedId.set(null)">
              <lucide-icon [img]="Settings2" [size]="15"></lucide-icon>
              <span class="layer-name">Ajustes del correo</span>
            </button>
            @for (b of design().blocks; track b.id; let i = $index) {
              <div class="layer" [class.active]="selectedId() === b.id" (click)="selectedId.set(b.id)"
                role="button" tabindex="0" (keydown.enter)="selectedId.set(b.id)">
                <lucide-icon [img]="iconFor(b.type)" [size]="15"></lucide-icon>
                <span class="layer-name">{{ labels[b.type] }}<small>{{ summary(b) }}</small></span>
                <span class="layer-tools" (click)="$event.stopPropagation()">
                  <button class="tool" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Subir bloque">
                    <lucide-icon [img]="ArrowUp" [size]="13"></lucide-icon>
                  </button>
                  <button class="tool" (click)="move(i, 1)" [disabled]="i === design().blocks.length - 1" aria-label="Bajar bloque">
                    <lucide-icon [img]="ArrowDown" [size]="13"></lucide-icon>
                  </button>
                  <button class="tool" (click)="duplicate(i)" aria-label="Duplicar bloque">
                    <lucide-icon [img]="Copy" [size]="13"></lucide-icon>
                  </button>
                  <button class="tool danger" (click)="removeBlock(i)" aria-label="Eliminar bloque">
                    <lucide-icon [img]="Trash2" [size]="13"></lucide-icon>
                  </button>
                </span>
              </div>
            }
          } @else {
            <p class="section-title">Código HTML</p>
            <app-variable-chips [variables]="variables()" (pick)="insertInto(codeArea, $event)" />
            <textarea class="textarea code" #codeArea spellcheck="false" [value]="htmlCode()"
              (input)="htmlCode.set($any($event.target).value)"
              placeholder="Pega aquí el HTML completo de tu correo"></textarea>
            <p class="hint">Usa estilos en línea y tablas: es lo que respetan Gmail y Outlook. Añade {{ '{baja}' }} como enlace de baja.</p>
          }
        </aside>

        <!-- Centro: vista previa -->
        <main class="center">
          <div class="frame" [class.mobile]="device() === 'mobile'">
            <iframe class="preview" title="Vista previa del correo" sandbox="" [srcdoc]="previewDoc()"></iframe>
          </div>
        </main>

        <!-- Derecha: inspector -->
        <aside class="right" (focusin)="rememberField($event)">
          <p class="section-title">Asunto y vista previa</p>
          <label class="field">
            <span class="label">Asunto</span>
            <input class="input" [value]="subject()" (input)="subject.set($any($event.target).value)" maxlength="200" />
          </label>
          <label class="field">
            <span class="label">Texto de vista previa</span>
            <input class="input" [value]="preheader()" (input)="preheader.set($any($event.target).value)" maxlength="200"
              placeholder="Lo que se ve junto al asunto" />
          </label>
          <app-variable-chips [variables]="variables()" (pick)="insertInField($event)" />

          @if (mode() === 'blocks') {
            @if (selected(); as b) {
              <p class="section-title">{{ labels[b.type] }}</p>
              @switch (b.type) {
                @case ('header') {
                  <label class="field"><span class="label">Título</span>
                    <input class="input" [value]="b.props.title || ''" (input)="set(b, 'title', $any($event.target).value)" /></label>
                  <label class="field"><span class="label">Subtítulo</span>
                    <input class="input" [value]="b.props.subtitle || ''" (input)="set(b, 'subtitle', $any($event.target).value)" /></label>
                  <div class="field"><span class="label">Logo</span>
                    <div class="upload-row">
                      <input class="input" [value]="b.props.logoUrl || ''" (input)="set(b, 'logoUrl', $any($event.target).value)" placeholder="https://…" />
                      <label class="btn btn-secondary btn-sm btn-icon" [class.busy]="uploading()" aria-label="Subir logo">
                        <lucide-icon [img]="uploading() ? RefreshCw : Upload" [size]="14"></lucide-icon>
                        <input type="file" accept="image/*" hidden (change)="upload($event, b, 'logoUrl')" />
                      </label>
                    </div>
                  </div>
                  <div class="row2">
                    <label class="field"><span class="label">Fondo</span>
                      <input class="color" type="color" [value]="b.props.bg || settings().brandColor" (input)="set(b, 'bg', $any($event.target).value)" /></label>
                    <label class="field"><span class="label">Texto</span>
                      <input class="color" type="color" [value]="b.props.color || '#ffffff'" (input)="set(b, 'color', $any($event.target).value)" /></label>
                  </div>
                }
                @case ('text') {
                  <label class="field"><span class="label">Contenido</span>
                    <textarea class="textarea" rows="8" [value]="b.props.content || ''" (input)="set(b, 'content', $any($event.target).value)"></textarea></label>
                  <p class="hint">**negrita**, *cursiva*, [texto](https://enlace). Una línea en blanco separa párrafos.</p>
                  <div class="row2">
                    <label class="field"><span class="label">Estilo</span>
                      <select class="select" [value]="b.props.heading || 'p'" (change)="set(b, 'heading', $any($event.target).value)">
                        <option value="p">Párrafo</option><option value="h2">Subtítulo</option><option value="h1">Título</option>
                      </select></label>
                    <label class="field"><span class="label">Tamaño</span>
                      <input class="input" type="number" min="10" max="48" [value]="b.props.size || 16" (input)="set(b, 'size', +$any($event.target).value)" /></label>
                  </div>
                  <label class="field"><span class="label">Color</span>
                    <input class="color" type="color" [value]="b.props.color || settings().textColor" (input)="set(b, 'color', $any($event.target).value)" /></label>
                }
                @case ('image') {
                  <div class="field"><span class="label">Imagen</span>
                    <div class="upload-row">
                      <input class="input" [value]="b.props.src || ''" (input)="set(b, 'src', $any($event.target).value)" placeholder="https://…" />
                      <label class="btn btn-secondary btn-sm btn-icon" [class.busy]="uploading()" aria-label="Subir imagen">
                        <lucide-icon [img]="uploading() ? RefreshCw : Upload" [size]="14"></lucide-icon>
                        <input type="file" accept="image/*" hidden (change)="upload($event, b, 'src')" />
                      </label>
                    </div>
                  </div>
                  <label class="field"><span class="label">Texto alternativo</span>
                    <input class="input" [value]="b.props.alt || ''" (input)="set(b, 'alt', $any($event.target).value)" /></label>
                  <label class="field"><span class="label">Enlace al hacer clic</span>
                    <input class="input" [value]="b.props.href || ''" (input)="set(b, 'href', $any($event.target).value)" placeholder="https://… o {{ '{link}' }}" /></label>
                  <div class="row2">
                    <label class="field"><span class="label">Ancho %</span>
                      <input class="input" type="number" min="10" max="100" [value]="b.props.width || 100" (input)="set(b, 'width', +$any($event.target).value)" /></label>
                    <label class="field"><span class="label">Esquinas</span>
                      <input class="input" type="number" min="0" max="60" [value]="b.props.radius ?? 8" (input)="set(b, 'radius', +$any($event.target).value)" /></label>
                  </div>
                }
                @case ('button') {
                  <label class="field"><span class="label">Texto del botón</span>
                    <input class="input" [value]="b.props.label || ''" (input)="set(b, 'label', $any($event.target).value)" /></label>
                  <label class="field"><span class="label">Enlace</span>
                    <input class="input" [value]="b.props.href || ''" (input)="set(b, 'href', $any($event.target).value)" placeholder="https://… o {{ '{link}' }}" /></label>
                  <div class="row2">
                    <label class="field"><span class="label">Fondo</span>
                      <input class="color" type="color" [value]="b.props.bg || settings().brandColor" (input)="set(b, 'bg', $any($event.target).value)" /></label>
                    <label class="field"><span class="label">Texto</span>
                      <input class="color" type="color" [value]="b.props.color || '#ffffff'" (input)="set(b, 'color', $any($event.target).value)" /></label>
                  </div>
                  <div class="row2">
                    <label class="field"><span class="label">Esquinas</span>
                      <input class="input" type="number" min="0" max="999" [value]="b.props.radius ?? 999" (input)="set(b, 'radius', +$any($event.target).value)" /></label>
                    <label class="check"><input type="checkbox" [checked]="!!b.props.full" (change)="set(b, 'full', $any($event.target).checked)" /> Ancho completo</label>
                  </div>
                }
                @case ('divider') {
                  <div class="row2">
                    <label class="field"><span class="label">Color</span>
                      <input class="color" type="color" [value]="b.props.color || '#e5e7eb'" (input)="set(b, 'color', $any($event.target).value)" /></label>
                    <label class="field"><span class="label">Grosor</span>
                      <input class="input" type="number" min="1" max="12" [value]="b.props.thickness || 1" (input)="set(b, 'thickness', +$any($event.target).value)" /></label>
                  </div>
                }
                @case ('spacer') {
                  <label class="field"><span class="label">Alto (px)</span>
                    <input class="input" type="number" min="4" max="200" [value]="b.props.height || 24" (input)="set(b, 'height', +$any($event.target).value)" /></label>
                }
                @case ('columns') {
                  @for (item of b.props.items || []; track $index; let ci = $index) {
                    <div class="col-card">
                      <div class="col-head">
                        <span class="label">Columna {{ ci + 1 }}</span>
                        <button class="tool danger" (click)="removeColumn(b, ci)" [disabled]="(b.props.items || []).length <= 1" aria-label="Quitar columna">
                          <lucide-icon [img]="Trash2" [size]="13"></lucide-icon>
                        </button>
                      </div>
                      <input class="input" [value]="item.title || ''" (input)="setColumn(b, ci, 'title', $any($event.target).value)" placeholder="Título" />
                      <textarea class="textarea" rows="3" [value]="item.text || ''" (input)="setColumn(b, ci, 'text', $any($event.target).value)" placeholder="Texto"></textarea>
                      <input class="input" [value]="item.image || ''" (input)="setColumn(b, ci, 'image', $any($event.target).value)" placeholder="URL de imagen (opcional)" />
                      <div class="row2">
                        <input class="input" [value]="item.buttonLabel || ''" (input)="setColumn(b, ci, 'buttonLabel', $any($event.target).value)" placeholder="Botón (opcional)" />
                        <input class="input" [value]="item.buttonHref || ''" (input)="setColumn(b, ci, 'buttonHref', $any($event.target).value)" placeholder="Enlace" />
                      </div>
                    </div>
                  }
                  @if ((b.props.items || []).length < 3) {
                    <button class="btn btn-secondary btn-sm" (click)="addColumn(b)">
                      <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Añadir columna
                    </button>
                  }
                }
                @case ('footer') {
                  <label class="field"><span class="label">Texto</span>
                    <textarea class="textarea" rows="3" [value]="b.props.text || ''" (input)="set(b, 'text', $any($event.target).value)"></textarea></label>
                  <label class="field"><span class="label">Dirección o datos legales</span>
                    <input class="input" [value]="b.props.address || ''" (input)="set(b, 'address', $any($event.target).value)" /></label>
                  <label class="check"><input type="checkbox" [checked]="b.props.showUnsubscribe !== false" (change)="set(b, 'showUnsubscribe', $any($event.target).checked)" /> Mostrar enlace de baja</label>
                }
                @case ('html') {
                  <label class="field"><span class="label">Código</span>
                    <textarea class="textarea code small" rows="10" spellcheck="false" [value]="b.props.code || ''" (input)="set(b, 'code', $any($event.target).value)"></textarea></label>
                }
              }
              @if (hasAlign(b.type)) {
                <div class="field"><span class="label">Alineación</span>
                  <div class="seg">
                    @for (a of aligns; track a.key) {
                      <button class="seg-btn" [class.active]="(b.props.align || defaultAlign(b.type)) === a.key" (click)="set(b, 'align', a.key)">{{ a.label }}</button>
                    }
                  </div>
                </div>
              }
            } @else {
              <p class="section-title">Ajustes del correo</p>
              <div class="row2">
                <label class="field"><span class="label">Color de marca</span>
                  <input class="color" type="color" [value]="settings().brandColor" (input)="setSetting('brandColor', $any($event.target).value)" /></label>
                <label class="field"><span class="label">Texto</span>
                  <input class="color" type="color" [value]="settings().textColor" (input)="setSetting('textColor', $any($event.target).value)" /></label>
              </div>
              <div class="row2">
                <label class="field"><span class="label">Fondo exterior</span>
                  <input class="color" type="color" [value]="settings().bg" (input)="setSetting('bg', $any($event.target).value)" /></label>
                <label class="field"><span class="label">Fondo del contenido</span>
                  <input class="color" type="color" [value]="settings().contentBg" (input)="setSetting('contentBg', $any($event.target).value)" /></label>
              </div>
              <label class="field"><span class="label">Tipografía</span>
                <select class="select" [value]="settings().font" (change)="setSetting('font', $any($event.target).value)">
                  @for (f of fonts; track f.value) { <option [value]="f.value">{{ f.label }}</option> }
                </select></label>
              <div class="row2">
                <label class="field"><span class="label">Ancho (px)</span>
                  <input class="input" type="number" min="320" max="800" [value]="settings().width" (input)="setSetting('width', +$any($event.target).value)" /></label>
                <label class="field"><span class="label">Margen interior</span>
                  <input class="input" type="number" min="8" max="64" [value]="settings().padding" (input)="setSetting('padding', +$any($event.target).value)" /></label>
              </div>
              <label class="field"><span class="label">Esquinas del contenido</span>
                <input class="input" type="number" min="0" max="40" [value]="settings().radius" (input)="setSetting('radius', +$any($event.target).value)" /></label>
              <p class="hint">Selecciona un bloque en la estructura para editar su contenido.</p>
            }
          }
        </aside>
      </div>
    </div>

    @if (testOpen()) {
      <div class="overlay" (click)="testOpen.set(false)" role="dialog" aria-modal="true" aria-label="Enviar prueba">
        <div class="modal card" (click)="$event.stopPropagation()">
          <h3>Enviar una prueba</h3>
          <p class="hint">Llega con datos de ejemplo en lugar de las variables.</p>
          <input class="input" #testInput type="email" [value]="testTo()" (input)="testTo.set($any($event.target).value)"
            placeholder="tu@correo.com" (keydown.enter)="sendTest()" />
          <div class="modal-actions">
            <button class="btn btn-ghost" (click)="testOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="sendTest()" [disabled]="sendingTest() || !testTo().trim()">
              {{ sendingTest() ? 'Enviando…' : 'Enviar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .editor { position:fixed; inset:0; z-index:90; background:var(--color-bg-app); display:flex; flex-direction:column; }
    .bar { display:flex; align-items:center; gap:12px; padding:12px 20px; background:var(--color-white);
      border-bottom:1px solid var(--color-border); flex-wrap:wrap; }
    .name-input { max-width:280px; font-weight:600; }
    .bar-spacer { flex:1; }
    .seg { display:inline-flex; background:var(--color-bg-light); border-radius:var(--radius-pill); padding:3px; gap:2px; }
    .seg-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border:none; background:none; cursor:pointer;
      border-radius:var(--radius-pill); font-family:var(--font-base); font-size:13px; font-weight:500; color:var(--color-text-muted);
      transition:all var(--transition-fast); }
    .seg-btn.active { background:var(--color-white); color:var(--color-brand); box-shadow:var(--shadow-sm); }

    .body { flex:1; min-height:0; display:grid; grid-template-columns:300px 1fr 340px; }
    .body.html-mode { grid-template-columns:minmax(320px, 42%) 1fr 300px; }
    .left, .right { background:var(--color-white); overflow-y:auto; padding:16px 18px 32px; display:flex; flex-direction:column; gap:10px; }
    .left { border-right:1px solid var(--color-border); }
    .right { border-left:1px solid var(--color-border); }
    .center { overflow:auto; padding:24px; display:flex; justify-content:center; }
    .frame { width:100%; max-width:760px; height:100%; min-height:480px; background:var(--color-white);
      border-radius:var(--radius-md); box-shadow:var(--shadow-md); overflow:hidden; transition:max-width var(--transition-smooth); }
    .frame.mobile { max-width:390px; }
    .preview { width:100%; height:100%; border:0; display:block; }

    .section-title { margin:12px 0 2px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--color-text-muted); }
    .palette { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
    .palette-btn { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 4px; cursor:pointer;
      border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-white);
      font-family:var(--font-base); font-size:11px; color:var(--color-text-main); transition:all var(--transition-fast); }
    .palette-btn:hover { border-color:var(--color-brand); color:var(--color-brand); background:var(--color-brand-light); }

    .layer { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; cursor:pointer; text-align:left;
      border:1px solid transparent; border-radius:var(--radius-md); background:var(--color-bg-light);
      font-family:var(--font-base); font-size:13px; color:var(--color-text-main); box-sizing:border-box; }
    .layer.active { border-color:var(--color-brand); background:var(--color-brand-light); }
    .layer-name { flex:1; min-width:0; display:flex; flex-direction:column; font-weight:600; }
    .layer-name small { font-weight:400; font-size:11px; color:var(--color-text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .layer-tools { display:flex; gap:2px; }
    .tool { width:24px; height:24px; display:grid; place-items:center; border:none; background:none; cursor:pointer;
      border-radius:var(--radius-sm); color:var(--color-text-muted); }
    .tool:hover:not(:disabled) { background:var(--color-white); color:var(--color-brand); }
    .tool.danger:hover:not(:disabled) { color:var(--color-error); }
    .tool:disabled { opacity:.3; cursor:default; }

    .field { display:flex; flex-direction:column; gap:6px; }
    .label { font-size:12px; font-weight:600; color:var(--color-text-main); }
    .row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:end; }
    .color { width:100%; height:38px; padding:2px; border:1px solid var(--color-border); border-radius:var(--radius-md);
      background:var(--color-white); cursor:pointer; box-sizing:border-box; }
    .check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-main); padding-bottom:8px; }
    .hint { margin:0; font-size:12px; color:var(--color-text-muted); }
    .upload-row { display:flex; gap:8px; }
    .upload-row .input { flex:1; min-width:0; }
    .busy { pointer-events:none; opacity:.6; }
    .col-card { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--color-border); border-radius:var(--radius-md); }
    .col-head { display:flex; justify-content:space-between; align-items:center; }
    .code { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12px; line-height:1.5; flex:1; min-height:320px;
      border-radius:var(--radius-md); white-space:pre; overflow:auto; }
    .code.small { min-height:160px; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      align-items:center; justify-content:center; z-index:100; }
    .modal { width:calc(100% - 48px); max-width:480px; padding:28px 32px; display:flex; flex-direction:column; gap:12px; }
    .modal h3 { margin:0; font-family:var(--font-heading); }
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }

    @media (max-width: 1100px) {
      .body, .body.html-mode { grid-template-columns:1fr; overflow-y:auto; }
      .left, .right { border:none; overflow:visible; }
      .center { min-height:520px; order:3; }
      .frame { height:520px; }
    }
  `],
})
export class EmailEditorComponent implements OnInit, OnDestroy {
  private api = inject(TemplatesApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private sanitizer = inject(DomSanitizer);

  draft = input.required<EmailEditorDraft>();
  variables = input<TemplateVariable[]>([]);
  saved = output<EmailTemplate>();
  closed = output<void>();

  readonly X = X; readonly Save = Save; readonly Monitor = Monitor; readonly Smartphone = Smartphone;
  readonly Send = Send; readonly ArrowUp = ArrowUp; readonly ArrowDown = ArrowDown; readonly Copy = Copy;
  readonly Trash2 = Trash2; readonly Plus = Plus; readonly Code = Code; readonly Settings2 = Settings2;
  readonly Blocks = Blocks; readonly Upload = Upload; readonly RefreshCw = RefreshCw;

  readonly palette = PALETTE;
  readonly labels = BLOCK_LABELS;
  readonly fonts = FONT_OPTIONS;
  readonly aligns: { key: Align; label: string }[] = [
    { key: 'left', label: 'Izquierda' },
    { key: 'center', label: 'Centro' },
    { key: 'right', label: 'Derecha' },
  ];

  id = signal<string | undefined>(undefined);
  name = signal('');
  subject = signal('');
  preheader = signal('');
  mode = signal<'blocks' | 'html'>('blocks');
  design = signal<EmailDesign>(emptyDesign());
  htmlCode = signal('');
  selectedId = signal<string | null>(null);
  device = signal<'desktop' | 'mobile'>('desktop');
  saving = signal(false);
  uploading = signal(false);
  dirty = signal(false);
  testOpen = signal(false);
  testTo = signal('');
  sendingTest = signal(false);

  settings = computed<EmailSettings>(() => ({ ...DEFAULT_SETTINGS, ...this.design().settings }));
  selected = computed(() => this.design().blocks.find(b => b.id === this.selectedId()) ?? null);

  /** HTML final: lo que se guarda y lo que se envía. */
  html = computed(() =>
    this.mode() === 'blocks'
      ? compileEmail(this.design(), { subject: this.subject(), preheader: this.preheader() })
      : this.htmlCode(),
  );

  /** La vista previa va con retardo para no recargar el iframe en cada tecla. */
  private previewHtml = signal('');
  previewDoc = computed<SafeHtml>(() =>
    // Es HTML del propio usuario y se pinta en un iframe con sandbox vacío:
    // sin scripts, sin formularios y sin acceso a la app.
    this.sanitizer.bypassSecurityTrustHtml(fillSample(this.previewHtml(), this.variables())),
  );
  private timer?: ReturnType<typeof setTimeout>;
  private lastField: HTMLInputElement | HTMLTextAreaElement | null = null;
  private loaded = false;

  constructor() {
    effect(() => {
      const html = this.html();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.previewHtml.set(html), this.loaded ? 180 : 0);
      if (this.loaded) this.dirty.set(true);
    });
  }

  ngOnInit() {
    const d = this.draft();
    this.id.set(d._id);
    this.name.set(d.name);
    this.subject.set(d.subject ?? '');
    this.preheader.set(d.preheader ?? '');
    this.mode.set(d.mode);
    this.design.set(d.mode === 'blocks' ? normalizeDesign(d.design) : emptyDesign());
    this.htmlCode.set(d.mode === 'html' ? d.html : '');
    // Lo que se cargó no cuenta como cambio sin guardar.
    // Un borrador nuevo (galería, IA) sí: cerrarlo sin guardar lo perdería.
    queueMicrotask(() => { this.loaded = true; this.dirty.set(!d._id); });
  }

  ngOnDestroy() { clearTimeout(this.timer); }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.testOpen()) this.testOpen.set(false);
    else void this.close();
  }

  // ── Modo ──
  async setMode(next: 'blocks' | 'html') {
    if (next === this.mode()) return;
    if (next === 'html') {
      // Se parte del HTML ya compilado para poder retocarlo a mano.
      this.htmlCode.set(compileEmail(this.design(), { subject: this.subject(), preheader: this.preheader() }));
      this.mode.set('html');
      return;
    }
    if (this.htmlCode().trim()) {
      const ok = await this.confirm.confirm({
        title: 'Volver a bloques',
        message: 'Los cambios hechos directamente en el HTML no se trasladan a los bloques. Se conservará el último diseño por bloques.',
        confirmText: 'Volver a bloques',
      });
      if (!ok) return;
    }
    this.mode.set('blocks');
  }

  // ── Bloques ──
  addBlock(type: EmailBlockType) {
    const block = createBlock(type);
    const blocks = [...this.design().blocks];
    const at = blocks.findIndex(b => b.id === this.selectedId());
    // Tras el seleccionado; si no hay, antes del pie (o al final).
    const footer = blocks.findIndex(b => b.type === 'footer');
    const index = at >= 0 ? at + 1 : footer >= 0 && type !== 'footer' ? footer : blocks.length;
    blocks.splice(index, 0, block);
    this.design.update(d => ({ ...d, blocks }));
    this.selectedId.set(block.id);
  }

  move(index: number, delta: number) {
    const blocks = [...this.design().blocks];
    const to = index + delta;
    if (to < 0 || to >= blocks.length) return;
    [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
    this.design.update(d => ({ ...d, blocks }));
  }

  duplicate(index: number) {
    const blocks = [...this.design().blocks];
    const copy: EmailBlock = JSON.parse(JSON.stringify(blocks[index])) as EmailBlock;
    copy.id = newId();
    blocks.splice(index + 1, 0, copy);
    this.design.update(d => ({ ...d, blocks }));
    this.selectedId.set(copy.id);
  }

  removeBlock(index: number) {
    const blocks = [...this.design().blocks];
    const [gone] = blocks.splice(index, 1);
    this.design.update(d => ({ ...d, blocks }));
    if (gone?.id === this.selectedId()) this.selectedId.set(null);
  }

  set<K extends keyof BlockProps>(block: EmailBlock, key: K, value: BlockProps[K]) {
    this.design.update(d => ({
      ...d,
      blocks: d.blocks.map(b => (b.id === block.id ? { ...b, props: { ...b.props, [key]: value } } : b)),
    }));
  }

  setSetting<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    this.design.update(d => ({ ...d, settings: { ...d.settings, [key]: value } }));
  }

  setColumn(block: EmailBlock, index: number, key: keyof ColumnItem, value: string) {
    const items = (block.props.items ?? []).map((it, i) => (i === index ? { ...it, [key]: value } : it));
    this.set(block, 'items', items);
  }

  addColumn(block: EmailBlock) {
    this.set(block, 'items', [...(block.props.items ?? []), { title: 'Nuevo punto', text: '' }]);
  }

  removeColumn(block: EmailBlock, index: number) {
    this.set(block, 'items', (block.props.items ?? []).filter((_, i) => i !== index));
  }

  hasAlign(type: EmailBlockType) { return ['header', 'text', 'image', 'button'].includes(type); }
  defaultAlign(type: EmailBlockType): Align { return type === 'text' ? 'left' : 'center'; }

  summary(b: EmailBlock): string {
    const p = b.props;
    return (p.title || p.content || p.label || p.text || p.alt || p.src || '').toString().replace(/\s+/g, ' ').slice(0, 40);
  }

  iconFor(type: EmailBlockType) {
    switch (type) {
      case 'header': return Heading;
      case 'text': return Type;
      case 'image': return Image;
      case 'button': return MousePointerClick;
      case 'divider': return Minus;
      case 'spacer': return MoveVertical;
      case 'columns': return Columns2;
      case 'footer': return PanelBottom;
      default: return Code;
    }
  }

  // ── Variables ──
  rememberField(event: FocusEvent) {
    const el = event.target;
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) this.lastField = el;
  }

  /** Inserta en el último campo de texto enfocado del inspector. */
  insertInField(token: string) {
    if (!this.lastField || !this.lastField.isConnected) {
      this.toast.error('Haz clic primero en el campo donde quieres la variable');
      return;
    }
    this.insertInto(this.lastField, token);
  }

  insertInto(el: HTMLInputElement | HTMLTextAreaElement, token: string) {
    insertAtCursor(el, token);
    // Los campos escuchan (input): así el cambio llega al modelo sin más cableado.
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Imágenes ──
  upload(event: Event, block: EmailBlock, key: 'src' | 'logoUrl') {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.toast.error('La imagen no puede superar 5 MB'); return; }
    this.uploading.set(true);
    this.api.uploadImage(file).subscribe({
      next: res => { this.uploading.set(false); this.set(block, key, res.url); this.toast.success('Imagen subida'); },
      error: (err: ErrorLike) => { this.uploading.set(false); this.toast.error(err.error?.message || 'No se pudo subir la imagen'); },
    });
  }

  // ── Guardar, probar, cerrar ──
  save() {
    const name = this.name().trim();
    if (!name) { this.toast.error('Ponle un nombre a la plantilla'); return; }
    if (!this.html().trim()) { this.toast.error('La plantilla está vacía'); return; }
    const payload: EmailTemplateInput = {
      name,
      subject: this.subject().trim(),
      preheader: this.preheader().trim(),
      mode: this.mode(),
      design: this.mode() === 'blocks' ? this.design() : undefined,
      html: this.html(),
    };
    const id = this.id();
    this.saving.set(true);
    (id ? this.api.updateEmailTemplate(id, payload) : this.api.createEmailTemplate(payload)).subscribe({
      next: tpl => {
        this.saving.set(false);
        this.id.set(tpl._id);
        this.dirty.set(false);
        this.toast.success('Plantilla guardada');
        this.saved.emit(tpl);
      },
      error: (err: ErrorLike) => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar la plantilla');
      },
    });
  }

  sendTest() {
    const to = this.testTo().trim();
    if (!to) return;
    this.sendingTest.set(true);
    this.api.sendTestEmail(to, this.subject().trim() || this.name().trim() || 'Plantilla', this.html()).subscribe({
      next: () => { this.sendingTest.set(false); this.testOpen.set(false); this.toast.success('Prueba enviada a ' + to); },
      error: (err: ErrorLike) => {
        this.sendingTest.set(false);
        const message = err.error?.message;
        this.toast.error((Array.isArray(message) ? message[0] : message) || 'No se pudo enviar la prueba');
      },
    });
  }

  async close() {
    if (this.dirty()) {
      const ok = await this.confirm.confirm({
        title: 'Salir sin guardar',
        message: 'Hay cambios sin guardar en la plantilla. Si sales, se pierden.',
        confirmText: 'Salir',
        danger: true,
      });
      if (!ok) return;
    }
    this.closed.emit();
  }
}
