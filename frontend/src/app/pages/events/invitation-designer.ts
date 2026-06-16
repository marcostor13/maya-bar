import {
  Component,
  Input,
  signal,
  computed,
  inject,
  ViewChild,
  ElementRef,
  OnInit,
  HostListener,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Sparkles, Plus, Trash2, AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Type, Save, X, BookmarkPlus, Film, Wand2, ChevronDown, CopyPlus, Eye } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

export interface DesignBackground {
  type: 'image' | 'video' | 'color';
  url: string;
  color: string;
  overlay: { color: string; opacity: number };
}

export interface ElementStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  textAlign: string;
  letterSpacing: string;
  lineHeight: string;
  textTransform: string;
  padding: string;
  background: string;
  borderRadius: string;
}

export interface DesignElement {
  id: string;
  type: 'text' | 'image';
  left: number;
  top: number;
  width: number;
  content: string;
  imageUrl: string;
  imageHeight: number;
  style: ElementStyle;
}

export interface DesignSpec {
  version: string;
  background: DesignBackground;
  elements: DesignElement[];
}

export interface MediaFile {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

interface EventTemplate {
  _id: string;
  name: string;
  design: DesignSpec;
}

const DEFAULT_STYLE: ElementStyle = {
  fontFamily: 'Poppins',
  fontSize: '28px',
  fontWeight: '700',
  color: '#ffffff',
  textAlign: 'center',
  letterSpacing: '0',
  lineHeight: '1.2',
  textTransform: 'none',
  padding: '8px',
  background: 'transparent',
  borderRadius: '0',
};

const DEFAULT_DESIGN: DesignSpec = {
  version: '1',
  background: { type: 'color', url: '', color: '#1a1a2e', overlay: { color: '#000000', opacity: 0 } },
  elements: [],
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parsePx(val: string): number {
  return parseInt(val, 10) || 24;
}

function parseEm(val: string): number {
  return parseFloat(val) || 0;
}

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return opacity === 0 ? 'transparent' : `rgba(${r},${g},${b},${opacity})`;
}

function rgbaToHex(rgba: string): string {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function rgbaOpacity(rgba: string): number {
  const m = rgba.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 1;
}

@Component({
  selector: 'app-invitation-designer',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="designer" (mousemove)="onMouseMove($event)">

      <!-- ── Left Panel ── -->
      <div class="d-left">
        <div class="d-tabs">
          <button class="d-tab" [class.active]="leftTab() === 'ai'" (click)="leftTab.set('ai')">
            <lucide-icon [img]="Wand2" [size]="14"></lucide-icon> IA
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'media'" (click)="leftTab.set('media')">
            <lucide-icon [img]="ImageIcon" [size]="14"></lucide-icon> Medios
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'templates'" (click)="leftTab.set('templates')">
            <lucide-icon [img]="CopyPlus" [size]="14"></lucide-icon> Plantillas
          </button>
        </div>

        <!-- AI Tab -->
        @if (leftTab() === 'ai') {
          <div class="d-panel-body">
            <div class="d-section-label">Describe la invitación</div>
            <textarea class="d-textarea" rows="5"
              [value]="aiPrompt()"
              (input)="aiPrompt.set($any($event.target).value)"
              placeholder="Ej: Cena degustación el viernes 20/06, DJ Gonzalo toca All Rock, patrocinado por Beefeater. Fondo London...">
            </textarea>

            @if (imageFiles().length || videoFiles().length) {
              <div class="d-section-label mt-12">Fondo para la IA</div>
              <div class="bg-thumbs">
                <div class="bg-thumb" [class.selected]="aiBackgroundUrl() === ''" (click)="aiBackgroundUrl.set('')">
                  <div class="bg-thumb-color" style="background:#1a1a2e"></div>
                  <span>Color</span>
                </div>
                @for (f of imageFiles(); track f.url) {
                  <div class="bg-thumb" [class.selected]="aiBackgroundUrl() === f.url" (click)="aiBackgroundUrl.set(f.url)">
                    <img [src]="f.url" [alt]="f.name" />
                  </div>
                }
                @for (f of videoFiles(); track f.url) {
                  <div class="bg-thumb" [class.selected]="aiBackgroundUrl() === f.url" (click)="aiBackgroundUrl.set(f.url)">
                    <div class="bg-thumb-color bg-thumb-video">
                      <lucide-icon [img]="Film" [size]="20"></lucide-icon>
                    </div>
                    <span>{{ f.name.slice(0, 10) }}</span>
                  </div>
                }
              </div>
            }

            <button class="d-btn-primary mt-12" (click)="generateWithAI()" [disabled]="aiGenerating() || !aiPrompt().trim()">
              <lucide-icon [img]="Sparkles" [size]="16"></lucide-icon>
              {{ aiGenerating() ? 'Generando...' : 'Generar con IA' }}
            </button>
          </div>
        }

        <!-- Media Tab -->
        @if (leftTab() === 'media') {
          <div class="d-panel-body">
            @if (!mediaFiles.length) {
              <div class="d-empty">
                <lucide-icon [img]="ImageIcon" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                <p>Sube archivos en la pestaña Medios del evento primero.</p>
              </div>
            }
            @if (imageFiles().length) {
              <div class="d-section-label">Imágenes</div>
              <div class="media-grid-sm">
                @for (f of imageFiles(); track f.url) {
                  <div class="media-thumb-sm">
                    <img [src]="f.url" [alt]="f.name" />
                    <div class="media-thumb-actions">
                      <button class="d-btn-xs" (click)="setBackground(f)" title="Usar como fondo">Fondo</button>
                      <button class="d-btn-xs" (click)="addImageEl(f)" title="Agregar como imagen">+ Img</button>
                    </div>
                  </div>
                }
              </div>
            }
            @if (videoFiles().length) {
              <div class="d-section-label mt-12">Videos</div>
              @for (f of videoFiles(); track f.url) {
                <div class="video-item">
                  <lucide-icon [img]="Film" [size]="20"></lucide-icon>
                  <span class="video-name">{{ f.name }}</span>
                  <button class="d-btn-xs" (click)="setVideoBackground(f)">Fondo</button>
                </div>
              }
            }
          </div>
        }

        <!-- Templates Tab -->
        @if (leftTab() === 'templates') {
          <div class="d-panel-body">
            <button class="d-btn-outline" (click)="showSaveForm.set(true)" [disabled]="design().elements.length === 0">
              <lucide-icon [img]="BookmarkPlus" [size]="15"></lucide-icon>
              Guardar diseño como plantilla
            </button>

            @if (showSaveForm()) {
              <div class="save-tpl-form">
                <input class="d-input" type="text" placeholder="Nombre de la plantilla"
                  [value]="templateName()"
                  (input)="templateName.set($any($event.target).value)" />
                <div class="flex gap-2 mt-8">
                  <button class="d-btn-ghost flex-1" (click)="showSaveForm.set(false)">Cancelar</button>
                  <button class="d-btn-primary flex-1" (click)="doSaveTemplate()" [disabled]="!templateName().trim() || savingTemplate()">
                    {{ savingTemplate() ? '...' : 'Guardar' }}
                  </button>
                </div>
              </div>
            }

            @if (templatesLoading()) {
              <div class="d-empty">Cargando...</div>
            } @else if (templates().length === 0) {
              <div class="d-empty">
                <lucide-icon [img]="CopyPlus" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                <p>Sin plantillas guardadas. Crea un diseño y guárdalo como plantilla.</p>
              </div>
            } @else {
              <div class="d-section-label mt-12">Plantillas guardadas</div>
              @for (tpl of templates(); track tpl._id) {
                <div class="tpl-item">
                  <span class="tpl-name">{{ tpl.name }}</span>
                  <div class="flex gap-2">
                    <button class="d-btn-xs" (click)="loadTemplate(tpl)">Cargar</button>
                    <button class="d-btn-xs danger" (click)="deleteTemplate(tpl)">
                      <lucide-icon [img]="Trash2" [size]="12"></lucide-icon>
                    </button>
                  </div>
                </div>
              }
            }
          </div>
        }
      </div>

      <!-- ── Center: Canvas ── -->
      <div class="d-center">
        <div class="d-toolbar">
          <button class="d-btn-sm" (click)="addTextEl()">
            <lucide-icon [img]="Type" [size]="15"></lucide-icon> Texto
          </button>
          <button class="d-btn-sm" (click)="leftTab.set('media')">
            <lucide-icon [img]="ImageIcon" [size]="15"></lucide-icon> Imagen
          </button>
          <div class="d-toolbar-sep"></div>
          <span class="d-hint">Clic para seleccionar · Doble clic para editar · Arrastra para mover</span>
          <div class="d-toolbar-spacer"></div>
          <button class="d-btn-save" (click)="saveDesign()" [disabled]="saving()">
            <lucide-icon [img]="Save" [size]="15"></lucide-icon>
            {{ saving() ? 'Guardando...' : 'Guardar diseño' }}
          </button>
        </div>

        <div class="d-stage">
          @if (aiGenerating()) {
            <div class="ai-gen-overlay">
              <div class="ai-gen-spinner"></div>
              <span>La IA está diseñando tu invitación...</span>
            </div>
          }
          <div class="canvas" #canvasRef (click)="onCanvasClick($event)">

            <!-- Background -->
            @if (bg().type === 'image' && bg().url) {
              <img class="canvas-bg" [src]="bg().url" />
            } @else if (bg().type === 'video' && bg().url) {
              <video class="canvas-bg" [src]="bg().url" autoplay muted loop playsinline></video>
            } @else {
              <div class="canvas-bg canvas-color" [style.background]="bg().color || '#1a1a2e'"></div>
            }

            <!-- Overlay -->
            @if (bg().overlay.opacity > 0) {
              <div class="canvas-overlay"
                [style.background]="bg().overlay.color"
                [style.opacity]="bg().overlay.opacity">
              </div>
            }

            <!-- Elements -->
            @for (el of design().elements; track el.id) {
              <div class="canvas-el"
                [class.selected]="selectedId() === el.id"
                [class.is-editing]="editingId() === el.id"
                [style.left.%]="el.left"
                [style.top.%]="el.top"
                [style.width.%]="el.width"
                [style.z-index]="selectedId() === el.id ? 10 : 2"
                (mousedown)="onElMouseDown($event, el)"
                (dblclick)="onElDblClick($event, el)">

                @if (el.type === 'text') {
                  @if (editingId() === el.id) {
                    <textarea class="el-edit-textarea"
                      [style]="getTextStyles(el)"
                      [value]="el.content"
                      rows="3"
                      (input)="updateEl(el.id, { content: $any($event.target).value })"
                      (blur)="editingId.set(null)"
                      (keydown.escape)="$event.preventDefault(); editingId.set(null)">
                    </textarea>
                  } @else {
                    <div class="el-text" [style]="getTextStyles(el)">{{ el.content }}</div>
                  }
                }

                @if (el.type === 'image' && el.imageUrl) {
                  <img class="el-img" [src]="el.imageUrl" [style.height.px]="el.imageHeight || 80" />
                }
              </div>
            }

            @if (design().elements.length === 0 && !aiGenerating()) {
              <div class="canvas-empty">
                <lucide-icon [img]="Sparkles" [size]="28" [strokeWidth]="1.5"></lucide-icon>
                <span>Describe tu invitación y genera con IA,<br>o agrega elementos manualmente</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- ── Right Panel: Properties ── -->
      @if (selectedEl()) {
        <div class="d-right">
          <div class="d-right-header">
            <span>{{ selectedEl()!.type === 'text' ? 'Texto' : 'Imagen' }}</span>
            <button class="d-close-btn" (click)="selectedId.set(null)">
              <lucide-icon [img]="X" [size]="16"></lucide-icon>
            </button>
          </div>

          <!-- Text properties -->
          @if (selectedEl()!.type === 'text') {
            <div class="d-props">
              <div class="d-prop">
                <label>Contenido</label>
                <textarea class="d-input" rows="3"
                  [value]="selectedEl()!.content"
                  (input)="updateEl(selectedEl()!.id, { content: $any($event.target).value })">
                </textarea>
              </div>

              <div class="d-prop-row">
                <div class="d-prop">
                  <label>Tamaño (px)</label>
                  <input class="d-input" type="number" min="10" max="120"
                    [value]="parsePx(selectedEl()!.style.fontSize)"
                    (input)="updateStyle(selectedEl()!.id, 'fontSize', $any($event.target).value + 'px')" />
                </div>
                <div class="d-prop">
                  <label>Peso</label>
                  <select class="d-input"
                    [value]="selectedEl()!.style.fontWeight"
                    (change)="updateStyle(selectedEl()!.id, 'fontWeight', $any($event.target).value)">
                    <option value="100">100 Thin</option>
                    <option value="300">300 Light</option>
                    <option value="400">400 Normal</option>
                    <option value="600">600 Semi</option>
                    <option value="700">700 Bold</option>
                    <option value="800">800 Extra</option>
                    <option value="900">900 Black</option>
                  </select>
                </div>
              </div>

              <div class="d-prop">
                <label>Color de texto</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="selectedEl()!.style.color"
                    (input)="updateStyle(selectedEl()!.id, 'color', $any($event.target).value)" />
                  <span class="color-val">{{ selectedEl()!.style.color }}</span>
                </div>
              </div>

              <div class="d-prop">
                <label>Alineación</label>
                <div class="align-btns">
                  <button class="align-btn" [class.active]="selectedEl()!.style.textAlign === 'left'"
                    (click)="updateStyle(selectedEl()!.id, 'textAlign', 'left')">
                    <lucide-icon [img]="AlignLeft" [size]="16"></lucide-icon>
                  </button>
                  <button class="align-btn" [class.active]="selectedEl()!.style.textAlign === 'center'"
                    (click)="updateStyle(selectedEl()!.id, 'textAlign', 'center')">
                    <lucide-icon [img]="AlignCenter" [size]="16"></lucide-icon>
                  </button>
                  <button class="align-btn" [class.active]="selectedEl()!.style.textAlign === 'right'"
                    (click)="updateStyle(selectedEl()!.id, 'textAlign', 'right')">
                    <lucide-icon [img]="AlignRight" [size]="16"></lucide-icon>
                  </button>
                </div>
              </div>

              <div class="d-prop-row">
                <div class="d-prop">
                  <label>Espaciado (em)</label>
                  <input class="d-input" type="number" min="0" max="1" step="0.05"
                    [value]="parseEm(selectedEl()!.style.letterSpacing)"
                    (input)="updateStyle(selectedEl()!.id, 'letterSpacing', $any($event.target).value + 'em')" />
                </div>
                <div class="d-prop">
                  <label>Interlineado</label>
                  <input class="d-input" type="number" min="0.8" max="3" step="0.1"
                    [value]="selectedEl()!.style.lineHeight"
                    (input)="updateStyle(selectedEl()!.id, 'lineHeight', $any($event.target).value)" />
                </div>
              </div>

              <div class="d-prop">
                <label>Mayúsculas</label>
                <select class="d-input"
                  [value]="selectedEl()!.style.textTransform"
                  (change)="updateStyle(selectedEl()!.id, 'textTransform', $any($event.target).value)">
                  <option value="none">Normal</option>
                  <option value="uppercase">MAYÚSCULAS</option>
                  <option value="lowercase">minúsculas</option>
                  <option value="capitalize">Capitalizar</option>
                </select>
              </div>

              <div class="d-divider"></div>

              <div class="d-prop">
                <label>Fondo del texto</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="bgHex(selectedEl()!.style.background)"
                    (input)="updateBgColor(selectedEl()!.id, $any($event.target).value)" />
                  <input class="d-input flex-1" type="number" min="0" max="1" step="0.05"
                    placeholder="Opacidad"
                    [value]="bgOpacity(selectedEl()!.style.background)"
                    (input)="updateBgOpacity(selectedEl()!.id, $any($event.target).value)" />
                </div>
              </div>

              <div class="d-prop">
                <label>Radio borde (px o 9999 = pill)</label>
                <input class="d-input" type="number" min="0" max="9999"
                  [value]="parsePx(selectedEl()!.style.borderRadius)"
                  (input)="updateStyle(selectedEl()!.id, 'borderRadius', $any($event.target).value + 'px')" />
              </div>

              <div class="d-prop">
                <label>Padding (px)</label>
                <input class="d-input" type="number" min="0" max="48"
                  [value]="parsePx(selectedEl()!.style.padding)"
                  (input)="updateStyle(selectedEl()!.id, 'padding', $any($event.target).value + 'px')" />
              </div>
            </div>
          }

          <!-- Image properties -->
          @if (selectedEl()!.type === 'image') {
            <div class="d-props">
              <div class="d-prop">
                <label>Altura (px)</label>
                <input class="d-input" type="number" min="20" max="400"
                  [value]="selectedEl()!.imageHeight || 80"
                  (input)="updateEl(selectedEl()!.id, { imageHeight: +$any($event.target).value })" />
              </div>
              <div class="d-prop">
                <label>Imagen URL</label>
                <select class="d-input"
                  [value]="selectedEl()!.imageUrl"
                  (change)="updateEl(selectedEl()!.id, { imageUrl: $any($event.target).value })">
                  <option value="">— Seleccionar —</option>
                  @for (f of imageFiles(); track f.url) {
                    <option [value]="f.url">{{ f.name }}</option>
                  }
                </select>
              </div>
            </div>
          }

          <!-- Position & size (all elements) -->
          <div class="d-divider"></div>
          <div class="d-props">
            <div class="d-section-label">Posición y tamaño</div>
            <div class="d-prop-row">
              <div class="d-prop">
                <label>X (%)</label>
                <input class="d-input" type="number" min="0" max="99"
                  [value]="Math.round(selectedEl()!.left)"
                  (input)="updateEl(selectedEl()!.id, { left: +$any($event.target).value })" />
              </div>
              <div class="d-prop">
                <label>Y (%)</label>
                <input class="d-input" type="number" min="0" max="99"
                  [value]="Math.round(selectedEl()!.top)"
                  (input)="updateEl(selectedEl()!.id, { top: +$any($event.target).value })" />
              </div>
            </div>
            <div class="d-prop">
              <label>Ancho (%)</label>
              <input class="d-input" type="number" min="1" max="100"
                [value]="Math.round(selectedEl()!.width)"
                (input)="updateEl(selectedEl()!.id, { width: +$any($event.target).value })" />
            </div>
            <button class="d-btn-center" (click)="centerEl(selectedEl()!.id)">
              <lucide-icon [img]="AlignCenter" [size]="14"></lucide-icon>
              Centrar horizontalmente
            </button>
          </div>

          <!-- Background section -->
          <div class="d-divider"></div>
          <div class="d-props">
            <div class="d-section-label">Fondo del canvas</div>
            <div class="d-prop">
              <label>Overlay (oscuridad)</label>
              <div class="color-row">
                <input type="color" class="color-swatch"
                  [value]="design().background.overlay.color"
                  (input)="updateOverlayColor($any($event.target).value)" />
                <input class="d-input flex-1" type="number" min="0" max="1" step="0.05"
                  [value]="design().background.overlay.opacity"
                  (input)="updateOverlayOpacity(+$any($event.target).value)" />
              </div>
            </div>
            @if (design().background.type === 'color') {
              <div class="d-prop">
                <label>Color de fondo</label>
                <input type="color" class="color-swatch"
                  [value]="design().background.color"
                  (input)="updateBgSolidColor($any($event.target).value)" />
              </div>
            }
          </div>

          <div class="d-divider"></div>
          <button class="d-btn-danger" (click)="deleteEl(selectedEl()!.id)">
            <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
            Eliminar elemento
          </button>
        </div>
      } @else {
        <!-- Background controls when nothing selected -->
        <div class="d-right">
          <div class="d-right-header">
            <span>Canvas</span>
          </div>
          <div class="d-props">
            <div class="d-section-label">Fondo</div>
            <div class="d-prop">
              <label>Overlay (oscuridad {{ overlayPct() }}%)</label>
              <input class="d-range" type="range" min="0" max="0.8" step="0.05"
                [value]="design().background.overlay.opacity"
                (input)="updateOverlayOpacity(+$any($event.target).value)" />
            </div>
            @if (design().background.type === 'color') {
              <div class="d-prop">
                <label>Color de fondo</label>
                <input type="color" class="color-swatch-lg"
                  [value]="design().background.color"
                  (input)="updateBgSolidColor($any($event.target).value)" />
              </div>
            }
            @if (design().background.url) {
              <button class="d-btn-outline mt-8" (click)="clearBackground()">
                <lucide-icon [img]="X" [size]="14"></lucide-icon>
                Quitar fondo
              </button>
            }
          </div>

          <div class="d-divider"></div>
          <div class="d-props">
            <div class="d-section-label">Elementos ({{ design().elements.length }})</div>
            @for (el of design().elements; track el.id; let i = $index) {
              <div class="el-list-item" (click)="selectedId.set(el.id)">
                <span class="el-list-icon">{{ el.type === 'text' ? '🔤' : '🖼️' }}</span>
                <span class="el-list-label">{{ el.type === 'text' ? (el.content.slice(0, 20) || 'Texto') : 'Imagen' }}</span>
              </div>
            }
            @if (design().elements.length === 0) {
              <p class="d-hint-sm">Sin elementos. Genera con IA o agrega texto manualmente.</p>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host { display: block; }

    .designer {
      display: flex;
      height: 700px;
      background: #f8f9fa;
      border-radius: 0 0 16px 16px;
      overflow: hidden;
      user-select: none;
    }

    /* ── Left Panel ── */
    .d-left {
      width: 240px;
      flex-shrink: 0;
      background: #fff;
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .d-tabs {
      display: flex;
      border-bottom: 1px solid var(--color-border);
      background: #fafafa;
    }
    .d-tab {
      flex: 1;
      padding: 10px 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-muted);
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s;
      margin-bottom: -1px;
    }
    .d-tab:hover { color: var(--color-text-main); }
    .d-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); background: #fff; }

    .d-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .d-section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
      margin-top: 4px;
    }
    .mt-12 { margin-top: 12px; }
    .mt-8 { margin-top: 8px; }

    .d-textarea {
      width: 100%;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
      color: var(--color-text-main);
      background: var(--color-bg-app);
    }
    .d-textarea:focus { border-color: var(--color-brand); background: #fff; }

    .bg-thumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .bg-thumb {
      width: 52px;
      height: 52px;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.15s;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .bg-thumb:hover { border-color: var(--color-brand); }
    .bg-thumb.selected { border-color: var(--color-brand); outline: 2px solid rgba(var(--color-brand-rgb, 225,29,72), 0.3); }
    .bg-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .bg-thumb span { font-size: 9px; color: #fff; position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; background: rgba(0,0,0,0.5); }
    .bg-thumb-color {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .bg-thumb-video { background: #1e2030; }

    .d-btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: linear-gradient(135deg, #a855f7, #7c3aed);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
    }
    .d-btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    .d-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .d-btn-outline {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 14px;
      background: none;
      color: var(--color-text-main);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
    }
    .d-btn-outline:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
    .d-btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }

    .d-btn-ghost {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      background: none;
      color: var(--color-text-muted);
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .d-btn-ghost:hover { background: var(--color-bg-app); color: var(--color-text-main); }

    .d-btn-xs {
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      color: var(--color-text-main);
      transition: all 0.15s;
      white-space: nowrap;
    }
    .d-btn-xs:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .d-btn-xs.danger:hover { border-color: var(--color-error); color: var(--color-error); }

    .d-btn-center {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      color: var(--color-text-muted);
      transition: all 0.15s;
      width: 100%;
    }
    .d-btn-center:hover { color: var(--color-brand); border-color: var(--color-brand); }

    .d-btn-danger {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      background: #fee2e2;
      color: var(--color-error);
      border: 1px solid #fca5a5;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      margin: 4px 16px 16px;
    }
    .d-btn-danger:hover { background: #fecaca; }

    .d-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 32px 16px;
      color: var(--color-text-muted);
      text-align: center;
      font-size: 13px;
    }

    .media-grid-sm {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .media-thumb-sm {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--color-border);
      position: relative;
      background: var(--color-bg-app);
    }
    .media-thumb-sm img {
      width: 100%;
      height: 64px;
      object-fit: cover;
      display: block;
    }
    .media-thumb-actions {
      display: flex;
      gap: 4px;
      padding: 4px;
    }
    .media-thumb-actions .d-btn-xs { flex: 1; text-align: center; }

    .video-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-app);
      color: var(--color-text-muted);
    }
    .video-name {
      flex: 1;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .save-tpl-form {
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 12px;
      margin-top: 8px;
    }
    .d-input {
      width: 100%;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
      color: var(--color-text-main);
      background: #fff;
    }
    .d-input:focus { border-color: var(--color-brand); }
    select.d-input { cursor: pointer; }

    .flex { display: flex; }
    .flex-1 { flex: 1; }
    .gap-2 { gap: 8px; }

    .tpl-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--color-border);
    }
    .tpl-item:last-child { border-bottom: none; }
    .tpl-name { font-size: 13px; font-weight: 600; color: var(--color-text-main); flex: 1; }

    /* ── Center Panel ── */
    .d-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    .d-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #fff;
      border-bottom: 1px solid var(--color-border);
    }
    .d-btn-sm {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: var(--color-text-main);
      transition: all 0.15s;
    }
    .d-btn-sm:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .d-toolbar-sep { width: 1px; height: 20px; background: var(--color-border); }
    .d-toolbar-spacer { flex: 1; }
    .d-hint {
      font-size: 12px;
      color: var(--color-text-muted);
    }
    .d-btn-save {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      background: var(--color-brand);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }
    .d-btn-save:hover:not(:disabled) { opacity: 0.9; }
    .d-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    .d-stage {
      flex: 1;
      background: #121218;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 24px;
      overflow-y: auto;
      position: relative;
    }

    .ai-gen-overlay {
      position: absolute;
      inset: 0;
      background: rgba(18, 18, 24, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: #a855f7;
      font-size: 15px;
      font-weight: 600;
      z-index: 100;
      backdrop-filter: blur(4px);
    }
    .ai-gen-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(168, 85, 247, 0.3);
      border-top-color: #a855f7;
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg) } }

    /* ── Canvas ── */
    .canvas {
      width: 324px;
      height: 576px;
      position: relative;
      overflow: hidden;
      border-radius: 20px;
      flex-shrink: 0;
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.08),
        0 32px 80px rgba(0,0,0,0.7);
    }

    .canvas-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }
    .canvas-color { background: #1a1a2e; }
    .canvas-overlay {
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
    }

    .canvas-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: rgba(255,255,255,0.3);
      font-size: 13px;
      text-align: center;
      padding: 32px;
      z-index: 2;
      line-height: 1.5;
    }

    /* ── Canvas Elements ── */
    .canvas-el {
      position: absolute;
      cursor: grab;
      box-sizing: border-box;
    }
    .canvas-el:active { cursor: grabbing; }
    .canvas-el.selected {
      outline: 2px solid rgba(99, 179, 237, 0.9);
      outline-offset: 1px;
    }
    .canvas-el.is-editing { cursor: text; }

    .el-text {
      width: 100%;
      display: block;
      box-sizing: border-box;
      white-space: pre-wrap;
      word-wrap: break-word;
      pointer-events: none;
    }

    .el-img {
      display: block;
      width: 100%;
      object-fit: contain;
    }

    .el-edit-textarea {
      width: 100%;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(99, 179, 237, 0.8);
      border-radius: 4px;
      resize: none;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      cursor: text;
    }

    /* ── Right Panel ── */
    .d-right {
      width: 240px;
      flex-shrink: 0;
      background: #fff;
      border-left: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .d-right-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
      font-weight: 700;
      color: var(--color-text-main);
      position: sticky;
      top: 0;
      background: #fff;
      z-index: 5;
    }
    .d-close-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: 6px;
      transition: all 0.15s;
    }
    .d-close-btn:hover { background: var(--color-bg-app); color: var(--color-text-main); }

    .d-props {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .d-prop {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .d-prop label {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .d-prop-row {
      display: flex;
      gap: 8px;
    }
    .d-prop-row .d-prop { flex: 1; }

    .color-row { display: flex; align-items: center; gap: 8px; }
    .color-swatch {
      width: 36px;
      height: 32px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 2px;
      cursor: pointer;
      background: none;
      flex-shrink: 0;
    }
    .color-swatch-lg {
      width: 100%;
      height: 40px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 3px;
      cursor: pointer;
      background: none;
    }
    .color-val { font-size: 12px; color: var(--color-text-muted); font-family: monospace; }

    .align-btns { display: flex; gap: 4px; }
    .align-btn {
      width: 36px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      color: var(--color-text-muted);
      transition: all 0.15s;
    }
    .align-btn:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .align-btn.active { background: var(--color-brand); color: #fff; border-color: var(--color-brand); }

    .d-divider { height: 1px; background: var(--color-border); margin: 0 16px; }

    .d-range {
      width: 100%;
      cursor: pointer;
    }

    .el-list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .el-list-item:hover { background: var(--color-bg-app); }
    .el-list-icon { font-size: 14px; }
    .el-list-label { font-size: 12px; color: var(--color-text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .d-hint-sm { font-size: 12px; color: var(--color-text-muted); text-align: center; line-height: 1.5; }
  `],
})
export class InvitationDesignerComponent implements OnInit {
  @Input() mediaFiles: MediaFile[] = [];
  @Input() eventId: string | null = null;
  @Input() set initialDesign(v: DesignSpec | null) {
    if (v && v.elements) this.design.set(v);
  }

  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Sparkles = Sparkles; readonly Plus = Plus; readonly Trash2 = Trash2;
  readonly AlignCenter = AlignCenter; readonly AlignLeft = AlignLeft; readonly AlignRight = AlignRight;
  readonly ImageIcon = ImageIcon; readonly Type = Type; readonly Save = Save;
  readonly X = X; readonly BookmarkPlus = BookmarkPlus; readonly Film = Film;
  readonly Wand2 = Wand2; readonly ChevronDown = ChevronDown; readonly CopyPlus = CopyPlus;
  readonly Eye = Eye;
  readonly Math = Math;

  design = signal<DesignSpec>({ ...DEFAULT_DESIGN, elements: [], background: { ...DEFAULT_DESIGN.background, overlay: { ...DEFAULT_DESIGN.background.overlay } } });
  selectedId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  leftTab = signal<'ai' | 'media' | 'templates'>('ai');
  aiPrompt = signal('');
  aiBackgroundUrl = signal('');
  aiGenerating = signal(false);
  saving = signal(false);

  templates = signal<EventTemplate[]>([]);
  templatesLoading = signal(false);
  showSaveForm = signal(false);
  templateName = signal('');
  savingTemplate = signal(false);

  selectedEl = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.design().elements.find(e => e.id === id) ?? null;
  });

  bg = computed(() => this.design().background);
  imageFiles = computed(() => this.mediaFiles.filter(f => f.mimeType.startsWith('image/')));
  videoFiles = computed(() => this.mediaFiles.filter(f => f.mimeType.startsWith('video/')));
  overlayPct = computed(() => Math.round(this.design().background.overlay.opacity * 100));

  private dragState: {
    elId: string;
    startMouseX: number;
    startMouseY: number;
    startElLeft: number;
    startElTop: number;
    canvasRect: DOMRect;
    moved: boolean;
  } | null = null;

  private bgColorMap = new Map<string, string>();

  ngOnInit() {
    this.loadTemplates();
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.dragState = null;
  }

  // ── Canvas interactions ───────────────────────────────────────────────────

  onCanvasClick(e: MouseEvent) {
    if (this.dragState?.moved) return;
    if (e.target === this.canvasRef?.nativeElement) {
      this.selectedId.set(null);
      this.editingId.set(null);
    }
  }

  onElMouseDown(e: MouseEvent, el: DesignElement) {
    e.preventDefault();
    e.stopPropagation();
    this.selectedId.set(el.id);
    if (this.editingId() === el.id) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.dragState = {
      elId: el.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElLeft: el.left,
      startElTop: el.top,
      canvasRect: rect,
      moved: false,
    };
  }

  onElDblClick(e: MouseEvent, el: DesignElement) {
    e.stopPropagation();
    if (el.type !== 'text') return;
    this.editingId.set(el.id);
  }

  onMouseMove(e: MouseEvent) {
    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.startMouseX;
    const dy = e.clientY - this.dragState.startMouseY;
    if (!this.dragState.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    this.dragState.moved = true;
    const rect = this.dragState.canvasRect;
    const el = this.design().elements.find(el => el.id === this.dragState!.elId);
    if (!el) return;
    const newLeft = Math.max(0, Math.min(100 - el.width, this.dragState.startElLeft + (dx / rect.width) * 100));
    const newTop = Math.max(0, Math.min(95, this.dragState.startElTop + (dy / rect.height) * 100));
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === this.dragState!.elId ? { ...e, left: newLeft, top: newTop } : e),
    }));
  }

  // ── Element management ────────────────────────────────────────────────────

  addTextEl() {
    const el: DesignElement = {
      id: genId(),
      type: 'text',
      left: 0,
      top: 45,
      width: 100,
      content: 'Texto nuevo',
      imageUrl: '',
      imageHeight: 0,
      style: { ...DEFAULT_STYLE },
    };
    this.design.update(d => ({ ...d, elements: [...d.elements, el] }));
    this.selectedId.set(el.id);
    this.editingId.set(el.id);
  }

  addImageEl(file: MediaFile) {
    const el: DesignElement = {
      id: genId(),
      type: 'image',
      left: 20,
      top: 70,
      width: 60,
      content: '',
      imageUrl: file.url,
      imageHeight: 80,
      style: { ...DEFAULT_STYLE },
    };
    this.design.update(d => ({ ...d, elements: [...d.elements, el] }));
    this.selectedId.set(el.id);
  }

  updateEl(id: string, updates: Partial<DesignElement>) {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  }

  updateStyle(id: string, key: keyof ElementStyle, value: string) {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, style: { ...e.style, [key]: value } } : e),
    }));
  }

  centerEl(id: string) {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, left: 0, width: 100, style: { ...e.style, textAlign: 'center' } } : e),
    }));
  }

  async deleteEl(id: string) {
    const ok = await this.confirm.confirm({ title: 'Eliminar elemento', message: '¿Eliminar este elemento?', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.design.update(d => ({ ...d, elements: d.elements.filter(e => e.id !== id) }));
    this.selectedId.set(null);
  }

  // ── Background ────────────────────────────────────────────────────────────

  setBackground(file: MediaFile) {
    this.design.update(d => ({
      ...d,
      background: { ...d.background, type: 'image', url: file.url, overlay: d.background.overlay.opacity > 0 ? d.background.overlay : { color: '#000000', opacity: 0.35 } },
    }));
    this.aiBackgroundUrl.set(file.url);
  }

  setVideoBackground(file: MediaFile) {
    this.design.update(d => ({
      ...d,
      background: { ...d.background, type: 'video', url: file.url, overlay: d.background.overlay.opacity > 0 ? d.background.overlay : { color: '#000000', opacity: 0.35 } },
    }));
    this.aiBackgroundUrl.set(file.url);
  }

  clearBackground() {
    this.design.update(d => ({ ...d, background: { ...d.background, type: 'color', url: '' } }));
    this.aiBackgroundUrl.set('');
  }

  updateOverlayColor(color: string) {
    this.design.update(d => ({ ...d, background: { ...d.background, overlay: { ...d.background.overlay, color } } }));
  }

  updateOverlayOpacity(opacity: number) {
    this.design.update(d => ({ ...d, background: { ...d.background, overlay: { ...d.background.overlay, opacity } } }));
  }

  updateBgSolidColor(color: string) {
    this.design.update(d => ({ ...d, background: { ...d.background, color } }));
  }

  // ── Element background color helpers ─────────────────────────────────────

  updateBgColor(id: string, hex: string) {
    const el = this.design().elements.find(e => e.id === id);
    if (!el) return;
    const opacity = this.bgOpacity(el.style.background);
    this.bgColorMap.set(id, hex);
    this.updateStyle(id, 'background', hexToRgba(hex, opacity > 0 ? opacity : 0.5));
  }

  updateBgOpacity(id: string, opacity: number) {
    const el = this.design().elements.find(e => e.id === id);
    if (!el) return;
    const hex = this.bgColorMap.get(id) || this.bgHex(el.style.background);
    this.updateStyle(id, 'background', opacity === 0 ? 'transparent' : hexToRgba(hex, opacity));
  }

  bgHex(bg: string): string {
    if (!bg || bg === 'transparent') return '#000000';
    return rgbaToHex(bg);
  }

  bgOpacity(bg: string): number {
    if (!bg || bg === 'transparent') return 0;
    if (bg.startsWith('#')) return 1;
    return rgbaOpacity(bg);
  }

  // ── Style helpers ─────────────────────────────────────────────────────────

  parsePx = parsePx;
  parseEm = parseEm;

  getTextStyles(el: DesignElement): Record<string, string> {
    const s = el.style;
    return {
      fontFamily: s.fontFamily || 'Poppins',
      fontSize: s.fontSize || '24px',
      fontWeight: s.fontWeight || '700',
      color: s.color || '#ffffff',
      textAlign: s.textAlign || 'center',
      letterSpacing: s.letterSpacing || '0',
      lineHeight: s.lineHeight || '1.2',
      textTransform: s.textTransform || 'none',
      padding: s.padding || '8px',
      background: s.background || 'transparent',
      borderRadius: s.borderRadius || '0',
      width: '100%',
      display: 'block',
      boxSizing: 'border-box',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
    };
  }

  // ── AI Generation ─────────────────────────────────────────────────────────

  async generateWithAI() {
    if (!this.aiPrompt().trim()) return;
    this.aiGenerating.set(true);
    try {
      const bgUrl = this.aiBackgroundUrl();
      const allMedia = this.mediaFiles.map(f => ({ name: f.name, url: f.url, mimeType: f.mimeType }));
      const result = await firstValueFrom(
        this.http.post<DesignSpec>(`${API}/events/ai-design`, {
          prompt: this.aiPrompt() + (bgUrl ? `\nFondo a usar: ${bgUrl}` : ''),
          mediaFiles: allMedia,
        })
      );
      const normalized = this.normalizeDesign(result);
      this.design.set(normalized);
      this.selectedId.set(null);
      this.toast.success('Diseño generado con IA');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'Error al generar diseño');
    } finally {
      this.aiGenerating.set(false);
    }
  }

  private normalizeDesign(raw: unknown): DesignSpec {
    const d = raw as Record<string, unknown>;
    const bg = (d['background'] as Record<string, unknown>) ?? {};
    const overlay = (bg['overlay'] as Record<string, unknown>) ?? {};
    const elements = ((d['elements'] as unknown[]) ?? []).map((el, i) => {
      const e = el as Record<string, unknown>;
      const style = (e['style'] as Record<string, unknown>) ?? {};
      return {
        id: (e['id'] as string) || genId(),
        type: (e['type'] === 'image' ? 'image' : 'text') as 'text' | 'image',
        left: Number(e['left']) || 0,
        top: Number(e['top']) || i * 15,
        width: Number(e['width']) || 100,
        content: String(e['content'] ?? ''),
        imageUrl: String(e['imageUrl'] ?? ''),
        imageHeight: Number(e['imageHeight']) || 80,
        style: {
          fontFamily: String(style['fontFamily'] ?? 'Poppins'),
          fontSize: String(style['fontSize'] ?? '24px'),
          fontWeight: String(style['fontWeight'] ?? '700'),
          color: String(style['color'] ?? '#ffffff'),
          textAlign: String(style['textAlign'] ?? 'center'),
          letterSpacing: String(style['letterSpacing'] ?? '0'),
          lineHeight: String(style['lineHeight'] ?? '1.2'),
          textTransform: String(style['textTransform'] ?? 'none'),
          padding: String(style['padding'] ?? '8px'),
          background: String(style['background'] ?? 'transparent'),
          borderRadius: String(style['borderRadius'] ?? '0'),
        },
      };
    });
    return {
      version: '1',
      background: {
        type: ((bg['type'] as string) === 'video' ? 'video' : (bg['type'] as string) === 'image' ? 'image' : 'color') as 'image' | 'video' | 'color',
        url: String(bg['url'] ?? ''),
        color: String(bg['color'] ?? '#1a1a2e'),
        overlay: {
          color: String(overlay['color'] ?? '#000000'),
          opacity: Math.min(1, Math.max(0, Number(overlay['opacity']) || 0)),
        },
      },
      elements,
    };
  }

  // ── Save design ───────────────────────────────────────────────────────────

  async saveDesign() {
    if (!this.eventId) { this.toast.error('Guarda el evento primero para poder guardar el diseño'); return; }
    this.saving.set(true);
    try {
      await firstValueFrom(this.http.patch(`${API}/events/${this.eventId}`, { invitationDesign: this.design() }));
      this.toast.success('Diseño guardado');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'Error al guardar diseño');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async loadTemplates() {
    this.templatesLoading.set(true);
    try {
      const tpls = await firstValueFrom(this.http.get<EventTemplate[]>(`${API}/event-templates`));
      this.templates.set(tpls);
    } catch {
      // silent
    } finally {
      this.templatesLoading.set(false);
    }
  }

  async doSaveTemplate() {
    if (!this.templateName().trim()) return;
    this.savingTemplate.set(true);
    try {
      const tpl = await firstValueFrom(
        this.http.post<EventTemplate>(`${API}/event-templates`, { name: this.templateName().trim(), design: this.design() })
      );
      this.templates.update(t => [tpl, ...t]);
      this.showSaveForm.set(false);
      this.templateName.set('');
      this.toast.success('Plantilla guardada');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'Error al guardar plantilla');
    } finally {
      this.savingTemplate.set(false);
    }
  }

  loadTemplate(tpl: EventTemplate) {
    this.design.set(this.normalizeDesign(tpl.design));
    this.selectedId.set(null);
    this.toast.success(`Plantilla "${tpl.name}" cargada`);
  }

  async deleteTemplate(tpl: EventTemplate) {
    const ok = await this.confirm.confirm({ title: 'Eliminar plantilla', message: `¿Eliminar la plantilla "${tpl.name}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await firstValueFrom(this.http.delete(`${API}/event-templates/${tpl._id}`));
      this.templates.update(t => t.filter(tp => tp._id !== tpl._id));
      this.toast.success('Plantilla eliminada');
    } catch {
      this.toast.error('Error al eliminar plantilla');
    }
  }
}
