import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
  ViewChild,
  ElementRef,
  OnInit,
  HostListener,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Sparkles, Plus, Trash2, AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Type, Save, X, BookmarkPlus, Film, Wand2, ChevronDown, CopyPlus, Eye, MousePointerClick, Palette, CheckCircle, Music, Mail } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

export interface DesignBackground {
  type: 'image' | 'video' | 'color';
  url: string;
  color: string;
  overlay: { color: string; opacity: number };
  backgroundSize: 'cover' | 'contain';
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
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
  fontStyle: string;
  textDecoration: string;
  wordSpacing: string;
  textShadow: string;
}

export interface DesignElement {
  id: string;
  type: 'text' | 'image' | 'button';
  left: number;
  top: number;
  width: number;
  content: string;
  imageUrl: string;
  imageHeight: number;
  style: ElementStyle;
}

export interface LandingTheme {
  formBg: string;          // fondo del drawer y tarjeta de éxito
  textColor: string;       // títulos y labels del formulario
  buttonBg: string;        // fondo del botón principal
  buttonText: string;      // texto del botón principal
  accent: string;          // badges, código de ticket, acentos
  formTitle: string;       // título del formulario ('' = default)
  formButton: string;      // texto del botón de envío ('' = default)
  successTitle: string;    // título de la pantalla de confirmación ('' = default)
  successMessage: string;  // mensaje de confirmación ('' = default dinámico)
}

export interface DesignMusic {
  embedCode: string;
}

export interface EmailDesign {
  subject: string;          // asunto ('' = default; admite {eventTitle})
  headerImageUrl: string;   // imagen de cabecera ('' = logo MAYA)
  bannerImageUrl: string;   // banner opcional bajo la cabecera
  title: string;            // encabezado principal
  intro: string;            // párrafo de introducción (admite {name} {eventTitle})
  accent: string;           // color del código de ticket
  bgColor: string;          // fondo del correo
  cardColor: string;        // fondo de la tarjeta
  textColor: string;        // color de títulos
  ticketLabel: string;      // etiqueta del código
  footerNote: string;       // nota antes del pie
  footerText: string;       // texto del pie
  showTicket: boolean;      // mostrar el código de acceso
}

export interface DesignSpec {
  version: string;
  background: DesignBackground;
  elements: DesignElement[];
  theme?: LandingTheme;
  music?: DesignMusic;
  emailDesign?: EmailDesign;
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
  borderColor: 'transparent',
  borderWidth: '0px',
  borderStyle: 'solid',
  fontStyle: 'normal',
  textDecoration: 'none',
  wordSpacing: '0px',
  textShadow: 'none',
};

const DEFAULT_THEME: LandingTheme = {
  formBg: '#ffffff',
  textColor: '#0f172a',
  buttonBg: '#e11d48',
  buttonText: '#ffffff',
  accent: '#e11d48',
  formTitle: '',
  formButton: '',
  successTitle: '',
  successMessage: '',
};

const DEFAULT_EMAIL: EmailDesign = {
  subject: '',
  headerImageUrl: '',
  bannerImageUrl: '',
  title: '¡Tu entrada está lista!',
  intro: 'Hola {name}, te has registrado con éxito para {eventTitle}.',
  accent: '#E11D48',
  bgColor: '#f3f4f6',
  cardColor: '#ffffff',
  textColor: '#111827',
  ticketLabel: 'Tu Código de Acceso',
  footerNote: 'Presenta este código al llegar para tu check-in.',
  footerText: '© 2026 MAYA Platform. Gestionado por BAR.',
  showTicket: true,
};

const DEFAULT_DESIGN: DesignSpec = {
  version: '1',
  background: { type: 'color', url: '', color: '#1a1a2e', overlay: { color: '#000000', opacity: 0 }, backgroundSize: 'cover' },
  elements: [],
  theme: { ...DEFAULT_THEME },
  music: { embedCode: '' },
  emailDesign: { ...DEFAULT_EMAIL },
};

const FONTS = [
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Oswald', value: 'Oswald' },
  { label: 'Raleway', value: 'Raleway' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Bebas Neue', value: 'Bebas Neue' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Dancing Script', value: 'Dancing Script' },
  { label: 'Roboto Condensed', value: 'Roboto Condensed' },
];

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
      <div class="d-left" [class.d-left-wide]="configTab()">
        <div class="d-tabs">
          <button class="d-tab" [class.active]="leftTab() === 'ai'" (click)="leftTab.set('ai')" title="IA">
            <lucide-icon [img]="Wand2" [size]="16"></lucide-icon>
            <span class="d-tab-label">IA</span>
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'media'" (click)="leftTab.set('media')" title="Medios">
            <lucide-icon [img]="ImageIcon" [size]="16"></lucide-icon>
            <span class="d-tab-label">Medios</span>
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'templates'" (click)="leftTab.set('templates')" title="Plantillas">
            <lucide-icon [img]="CopyPlus" [size]="16"></lucide-icon>
            <span class="d-tab-label">Plantillas</span>
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'form'" (click)="leftTab.set('form')" title="Formulario y confirmación">
            <lucide-icon [img]="Palette" [size]="16"></lucide-icon>
            <span class="d-tab-label">Registro</span>
          </button>
          <button class="d-tab" [class.active]="leftTab() === 'email'" (click)="leftTab.set('email')" title="Correo de confirmación">
            <lucide-icon [img]="Mail" [size]="16"></lucide-icon>
            <span class="d-tab-label">Email</span>
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

        <!-- Form / Thank-you Theme Tab -->
        @if (leftTab() === 'form') {
          <div class="d-panel-body">
            <!-- Contenido: Formulario -->
            <div class="d-section-label">Formulario</div>
            <div class="d-prop">
              <label>Título</label>
              <input class="d-input" type="text"
                [value]="theme().formTitle"
                (focus)="formPreview.set('form')"
                (input)="updateTheme('formTitle', $any($event.target).value)"
                placeholder="Reservar lugar gratuito" />
            </div>
            <div class="d-prop">
              <label>Texto del botón</label>
              <input class="d-input" type="text"
                [value]="theme().formButton"
                (focus)="formPreview.set('form')"
                (input)="updateTheme('formButton', $any($event.target).value)"
                placeholder="Confirmar asistencia" />
            </div>

            <!-- Contenido: Confirmación -->
            <div class="d-section-label mt-12">Confirmación</div>
            <div class="d-prop">
              <label>Título</label>
              <input class="d-input" type="text"
                [value]="theme().successTitle"
                (focus)="formPreview.set('success')"
                (input)="updateTheme('successTitle', $any($event.target).value)"
                placeholder="¡Registro confirmado!" />
            </div>
            <div class="d-prop">
              <label>Mensaje</label>
              <textarea class="d-input" rows="2"
                [value]="theme().successMessage"
                (focus)="formPreview.set('success')"
                (input)="updateTheme('successMessage', $any($event.target).value)"
                placeholder="Nos vemos pronto. ¡Gracias por registrarte!"></textarea>
            </div>

            <!-- Colores -->
            <div class="d-section-label mt-12">Colores</div>
            <p class="d-hint-sm" style="text-align:left;margin:0 0 4px;">Aplican al formulario y a la pantalla de confirmación.</p>
            <div class="form-colors">
              <div class="d-prop">
                <label>Fondo</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="theme().formBg"
                    (input)="updateTheme('formBg', $any($event.target).value)" />
                  <span class="color-val">{{ theme().formBg }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Texto</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="theme().textColor"
                    (input)="updateTheme('textColor', $any($event.target).value)" />
                  <span class="color-val">{{ theme().textColor }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Fondo botón</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="theme().buttonBg"
                    (input)="updateTheme('buttonBg', $any($event.target).value)" />
                  <span class="color-val">{{ theme().buttonBg }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Texto botón</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="theme().buttonText"
                    (input)="updateTheme('buttonText', $any($event.target).value)" />
                  <span class="color-val">{{ theme().buttonText }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Acento (ticket)</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="theme().accent"
                    (input)="updateTheme('accent', $any($event.target).value)" />
                  <span class="color-val">{{ theme().accent }}</span>
                </div>
              </div>
            </div>

            <button class="d-btn-save mt-12" (click)="saveDesign()" [disabled]="saving()" style="width:100%;justify-content:center;">
              <lucide-icon [img]="Save" [size]="15"></lucide-icon>
              {{ saving() ? 'Guardando...' : (eventId ? 'Guardar' : 'Aplicar') }}
            </button>
          </div>
        }

        <!-- Email Tab -->
        @if (leftTab() === 'email') {
          <div class="d-panel-body">
            <p class="d-hint-sm" style="text-align:left;margin:0 0 4px;">
              Personaliza el correo que recibe el cliente al registrarse. Usa <code>&#123;name&#125;</code> y <code>&#123;eventTitle&#125;</code> como variables.
            </p>

            <div class="d-section-label">Contenido</div>
            <div class="d-prop">
              <label>Asunto</label>
              <input class="d-input" type="text"
                [value]="emailDesign().subject"
                (input)="updateEmail('subject', $any($event.target).value)"
                placeholder="Confirmación: {eventTitle} - MAYA" />
            </div>
            <div class="d-prop">
              <label>Título</label>
              <input class="d-input" type="text"
                [value]="emailDesign().title"
                (input)="updateEmail('title', $any($event.target).value)"
                placeholder="¡Tu entrada está lista!" />
            </div>
            <div class="d-prop">
              <label>Texto de introducción</label>
              <textarea class="d-input" rows="3"
                [value]="emailDesign().intro"
                (input)="updateEmail('intro', $any($event.target).value)"
                placeholder="Hola {name}, te has registrado con éxito para {eventTitle}."></textarea>
            </div>

            <div class="d-section-label mt-12">Imágenes</div>
            <div class="d-prop">
              <label>Imagen de cabecera (logo)</label>
              <select class="d-input"
                [value]="emailDesign().headerImageUrl"
                (change)="updateEmail('headerImageUrl', $any($event.target).value)">
                <option value="">— Logo MAYA por defecto —</option>
                @for (f of imageFiles(); track f.url) {
                  <option [value]="f.url">{{ f.name }}</option>
                }
              </select>
            </div>
            <div class="d-prop">
              <label>Imagen banner (opcional)</label>
              <select class="d-input"
                [value]="emailDesign().bannerImageUrl"
                (change)="updateEmail('bannerImageUrl', $any($event.target).value)">
                <option value="">— Sin banner —</option>
                @for (f of imageFiles(); track f.url) {
                  <option [value]="f.url">{{ f.name }}</option>
                }
              </select>
            </div>

            <div class="d-section-label mt-12">Estilos</div>
            <div class="form-colors">
              <div class="d-prop">
                <label>Fondo</label>
                <div class="color-row">
                  <input type="color" class="color-swatch" [value]="emailDesign().bgColor"
                    (input)="updateEmail('bgColor', $any($event.target).value)" />
                  <span class="color-val">{{ emailDesign().bgColor }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Tarjeta</label>
                <div class="color-row">
                  <input type="color" class="color-swatch" [value]="emailDesign().cardColor"
                    (input)="updateEmail('cardColor', $any($event.target).value)" />
                  <span class="color-val">{{ emailDesign().cardColor }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Texto</label>
                <div class="color-row">
                  <input type="color" class="color-swatch" [value]="emailDesign().textColor"
                    (input)="updateEmail('textColor', $any($event.target).value)" />
                  <span class="color-val">{{ emailDesign().textColor }}</span>
                </div>
              </div>
              <div class="d-prop">
                <label>Acento (ticket)</label>
                <div class="color-row">
                  <input type="color" class="color-swatch" [value]="emailDesign().accent"
                    (input)="updateEmail('accent', $any($event.target).value)" />
                  <span class="color-val">{{ emailDesign().accent }}</span>
                </div>
              </div>
            </div>

            <div class="d-section-label mt-12">Código de acceso</div>
            <label class="d-toggle-row">
              <input type="checkbox" [checked]="emailDesign().showTicket"
                (change)="updateEmail('showTicket', $any($event.target).checked)" />
              <span>Mostrar el código de ticket en el correo</span>
            </label>
            @if (emailDesign().showTicket) {
              <div class="d-prop mt-8">
                <label>Etiqueta del código</label>
                <input class="d-input" type="text"
                  [value]="emailDesign().ticketLabel"
                  (input)="updateEmail('ticketLabel', $any($event.target).value)"
                  placeholder="Tu Código de Acceso" />
              </div>
            }

            <div class="d-section-label mt-12">Pie</div>
            <div class="d-prop">
              <label>Nota final</label>
              <input class="d-input" type="text"
                [value]="emailDesign().footerNote"
                (input)="updateEmail('footerNote', $any($event.target).value)"
                placeholder="Presenta este código al llegar para tu check-in." />
            </div>
            <div class="d-prop">
              <label>Texto del pie</label>
              <input class="d-input" type="text"
                [value]="emailDesign().footerText"
                (input)="updateEmail('footerText', $any($event.target).value)" />
            </div>

            <div class="flex gap-2 mt-12">
              <button class="d-btn-ghost flex-1" (click)="resetEmail()">Restaurar</button>
              <button class="d-btn-save flex-1" (click)="saveDesign()" [disabled]="saving()" style="justify-content:center;">
                <lucide-icon [img]="Save" [size]="15"></lucide-icon>
                {{ saving() ? 'Guardando...' : (eventId ? 'Guardar' : 'Aplicar') }}
              </button>
            </div>
          </div>
        }
      </div>

      <!-- ── Center: Canvas ── -->
      <div class="d-center">
        <div class="d-toolbar">
          @if (!configTab()) {
            <button class="d-btn-sm" (click)="addTextEl()">
              <lucide-icon [img]="Type" [size]="15"></lucide-icon> Texto
            </button>
            <button class="d-btn-sm d-btn-sm-cta" (click)="addButtonEl()">
              <lucide-icon [img]="MousePointerClick" [size]="15"></lucide-icon> Botón
            </button>
            <button class="d-btn-sm" (click)="leftTab.set('media')">
              <lucide-icon [img]="ImageIcon" [size]="15"></lucide-icon> Imagen
            </button>
            <button class="d-btn-sm" [class.d-btn-sm-on]="musicEmbed().trim()" (click)="showMusicModal.set(true)">
              <lucide-icon [img]="Music" [size]="15"></lucide-icon> Música
            </button>
            <button class="d-btn-sm" (click)="centerAll()" [disabled]="design().elements.length === 0">
              <lucide-icon [img]="AlignCenter" [size]="15"></lucide-icon> Centrar todo
            </button>
            <div class="d-toolbar-sep"></div>
            <span class="d-hint">Clic para seleccionar · Doble clic para editar · Arrastra para mover</span>
          } @else if (leftTab() === 'form') {
            <span class="d-hint">Vista previa del formulario y la confirmación de la landing</span>
          } @else {
            <span class="d-hint">Vista previa del correo de confirmación</span>
          }
          <div class="d-toolbar-spacer"></div>
          <button class="d-btn-save" (click)="saveDesign()" [disabled]="saving()">
            <lucide-icon [img]="Save" [size]="15"></lucide-icon>
            {{ saving() ? 'Guardando...' : (eventId ? 'Guardar diseño' : 'Aplicar diseño') }}
          </button>
        </div>

        <div class="d-stage">
          @if (aiGenerating()) {
            <div class="ai-gen-overlay">
              <div class="ai-gen-spinner"></div>
              <span>La IA está diseñando tu invitación...</span>
            </div>
          }

          <!-- Live preview of registration form / confirmation screen -->
          @if (leftTab() === 'form') {
            <div class="form-preview">
              <div class="fp-toggle">
                <button class="fp-toggle-btn" [class.active]="formPreview() === 'form'" (click)="formPreview.set('form')">Formulario</button>
                <button class="fp-toggle-btn" [class.active]="formPreview() === 'success'" (click)="formPreview.set('success')">Confirmación</button>
              </div>

              <div class="fp-card" [style.background]="theme().formBg">
                @if (formPreview() === 'form') {
                  <div class="fp-title" [style.color]="theme().textColor">{{ theme().formTitle || 'Reservar lugar gratuito' }}</div>
                  <div class="fp-field">
                    <span class="fp-label" [style.color]="theme().textColor">Nombre completo *</span>
                    <div class="fp-input">Tu nombre</div>
                  </div>
                  <div class="fp-field">
                    <span class="fp-label" [style.color]="theme().textColor">Email *</span>
                    <div class="fp-input">tu&#64;email.com</div>
                  </div>
                  <div class="fp-field">
                    <span class="fp-label" [style.color]="theme().textColor">Teléfono</span>
                    <div class="fp-input">+51 999 999 999</div>
                  </div>
                  <div class="fp-btn" [style.background]="theme().buttonBg" [style.color]="theme().buttonText">{{ theme().formButton || 'Confirmar asistencia' }}</div>
                } @else {
                  <div class="fp-check">
                    <lucide-icon [img]="CheckCircle" [size]="56" [strokeWidth]="1.5"></lucide-icon>
                  </div>
                  <div class="fp-title fp-center" [style.color]="theme().textColor">{{ theme().successTitle || '¡Registro confirmado!' }}</div>
                  <div class="fp-sub">{{ theme().successMessage || 'Nos vemos pronto. ¡Gracias por registrarte!' }}</div>
                  <div class="fp-ticket">
                    <span class="fp-ticket-label">Tu código de ticket</span>
                    <span class="fp-ticket-code" [style.color]="theme().accent">BAR-7K2Q9</span>
                    <span class="fp-ticket-hint">Presenta este código en el evento</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Live preview of confirmation email -->
          @if (leftTab() === 'email') {
            <div class="email-preview">
              <div class="ep-card" [style.background]="emailDesign().cardColor"
                [style.box-shadow]="'0 24px 60px rgba(0,0,0,0.5)'">
                <div class="ep-pad">
                  <div class="ep-header">
                    @if (emailDesign().headerImageUrl) {
                      <img [src]="emailDesign().headerImageUrl" alt="" class="ep-header-img" />
                    } @else {
                      <span class="ep-logo">MAYA</span>
                    }
                  </div>
                  @if (emailDesign().bannerImageUrl) {
                    <img [src]="emailDesign().bannerImageUrl" alt="" class="ep-banner" />
                  }
                  <h2 class="ep-title" [style.color]="emailDesign().textColor">{{ previewTitle() }}</h2>
                  <p class="ep-intro">{{ previewIntro() }}</p>
                  <div class="ep-box">
                    <div class="ep-row-label">Evento y Fecha</div>
                    <div class="ep-row-strong" [style.color]="emailDesign().textColor">Nombre del evento</div>
                    <div class="ep-row-sub">Sábado, 21 de junio · 21:00</div>
                    @if (emailDesign().showTicket) {
                      <div class="ep-row-label" style="margin-top:14px;">{{ emailDesign().ticketLabel }}</div>
                      <div class="ep-ticket" [style.background]="emailDesign().accent">AB12CD34</div>
                    }
                  </div>
                  <p class="ep-note">{{ previewFooterNote() }}</p>
                </div>
                <div class="ep-foot">{{ emailDesign().footerText }}</div>
              </div>
            </div>
          }

          <div class="canvas" #canvasRef (click)="onCanvasClick($event)">

            <!-- Background -->
            @if (bg().type === 'image' && bg().url) {
              <img class="canvas-bg" [src]="bg().url"
                [style.object-fit]="bg().backgroundSize || 'cover'"
                [style.object-position]="'center center'" />
            } @else if (bg().type === 'video' && bg().url) {
              <video class="canvas-bg" [src]="bg().url" autoplay muted loop playsinline
                [style.object-fit]="bg().backgroundSize || 'cover'"></video>
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

            <!-- Grid (shown while dragging) -->
            @if (isDragging()) {
              <div class="canvas-grid"></div>
            }

            <!-- Elements -->
            @for (el of design().elements; track el.id) {
              <div class="canvas-el"
                [class.selected]="selectedId() === el.id"
                [class.is-editing]="editingId() === el.id"
                [style.left.%]="el.left"
                [style.top.%]="el.top"
                [style.width.%]="el.width"
                [style.z-index]="selectedId() === el.id ? 20 : 3"
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

                @if (el.type === 'button') {
                  @if (editingId() === el.id) {
                    <input class="el-btn-input"
                      [style]="getBtnStyles(el)"
                      [value]="el.content"
                      (input)="updateEl(el.id, { content: $any($event.target).value })"
                      (blur)="editingId.set(null)"
                      (keydown.escape)="$event.preventDefault(); editingId.set(null)"
                      (keydown.enter)="$event.preventDefault(); editingId.set(null)" />
                  } @else {
                    <div class="el-btn" [style]="getBtnStyles(el)">{{ el.content }}</div>
                  }
                }

                <!-- Resize handles (only on selected, non-editing) -->
                @if (selectedId() === el.id && editingId() !== el.id) {
                  <div class="rh rh-w" (mousedown)="onResizeStart($event, 'w', el)"></div>
                  <div class="rh rh-e" (mousedown)="onResizeStart($event, 'e', el)"></div>
                  @if (el.type === 'image') {
                    <div class="rh rh-s" (mousedown)="onResizeStart($event, 's', el)"></div>
                  }
                }
              </div>
            }

            <!-- Snap guides -->
            @if (snapGuideX() !== null) {
              <div class="snap-guide snap-guide-v" [style.left.%]="snapGuideX()"></div>
            }
            @if (snapGuideY() !== null) {
              <div class="snap-guide snap-guide-h" [style.top.%]="snapGuideY()"></div>
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
      @if (!configTab() && selectedEl()) {
        <div class="d-right">
          <div class="d-right-header">
            <span>{{ selectedEl()!.type === 'text' ? 'Texto' : selectedEl()!.type === 'button' ? 'Botón CTA' : 'Imagen' }}</span>
            <button class="d-close-btn" (click)="selectedId.set(null)">
              <lucide-icon [img]="X" [size]="16"></lucide-icon>
            </button>
          </div>

          <!-- Button properties -->
          @if (selectedEl()!.type === 'button') {
            <div class="d-props">
              <div class="d-prop">
                <label>Texto del botón</label>
                <input class="d-input" type="text"
                  [value]="selectedEl()!.content"
                  (input)="updateEl(selectedEl()!.id, { content: $any($event.target).value })" />
              </div>

              <div class="d-prop">
                <label>Tipografía</label>
                <select class="d-input d-font-select"
                  [value]="selectedEl()!.style.fontFamily"
                  (change)="updateStyle(selectedEl()!.id, 'fontFamily', $any($event.target).value)">
                  @for (f of fonts; track f.value) {
                    <option [value]="f.value" [style.font-family]="f.value">{{ f.label }}</option>
                  }
                </select>
              </div>

              <div class="d-prop-row">
                <div class="d-prop">
                  <label>Tamaño (px)</label>
                  <input class="d-input" type="number" min="10" max="60"
                    [value]="parsePx(selectedEl()!.style.fontSize)"
                    (input)="updateStyle(selectedEl()!.id, 'fontSize', $any($event.target).value + 'px')" />
                </div>
                <div class="d-prop">
                  <label>Peso</label>
                  <select class="d-input"
                    [value]="selectedEl()!.style.fontWeight"
                    (change)="updateStyle(selectedEl()!.id, 'fontWeight', $any($event.target).value)">
                    <option value="400">400 Normal</option>
                    <option value="600">600 Semi</option>
                    <option value="700">700 Bold</option>
                    <option value="800">800 Extra</option>
                  </select>
                </div>
              </div>

              <div class="d-prop">
                <label>Color del texto</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    [value]="selectedEl()!.style.color"
                    (input)="updateStyle(selectedEl()!.id, 'color', $any($event.target).value)" />
                  <span class="color-val">{{ selectedEl()!.style.color }}</span>
                </div>
              </div>

              <div class="d-prop">
                <label>Fondo del botón</label>
                <label class="d-toggle-row">
                  <input type="checkbox"
                    [checked]="selectedEl()!.style.background === 'transparent'"
                    (change)="setBtnTransparent(selectedEl()!.id, $any($event.target).checked)" />
                  <span>Sin fondo (transparente)</span>
                </label>
                @if (selectedEl()!.style.background !== 'transparent') {
                  <div class="color-row mt-4">
                    <input type="color" class="color-swatch"
                      [value]="bgHex(selectedEl()!.style.background)"
                      (input)="updateBtnBgColor(selectedEl()!.id, $any($event.target).value)" />
                    <span class="color-val">{{ bgHex(selectedEl()!.style.background) }}</span>
                  </div>
                }
              </div>

              <div class="d-prop">
                <label>Radio borde (px, 9999 = pill)</label>
                <input class="d-input" type="number" min="0" max="9999"
                  [value]="parsePx(selectedEl()!.style.borderRadius)"
                  (input)="updateStyle(selectedEl()!.id, 'borderRadius', $any($event.target).value + 'px')" />
              </div>

              <div class="d-prop">
                <label>Borde</label>
                <div class="d-prop-row">
                  <div class="d-prop">
                    <label>Grosor (px)</label>
                    <input class="d-input" type="number" min="0" max="20"
                      [value]="parsePx(selectedEl()!.style.borderWidth || '0px')"
                      (input)="updateStyle(selectedEl()!.id, 'borderWidth', $any($event.target).value + 'px')" />
                  </div>
                  <div class="d-prop">
                    <label>Estilo</label>
                    <select class="d-input"
                      [value]="selectedEl()!.style.borderStyle || 'solid'"
                      (change)="updateStyle(selectedEl()!.id, 'borderStyle', $any($event.target).value)">
                      <option value="solid">Sólido</option>
                      <option value="dashed">Guiones</option>
                      <option value="dotted">Puntos</option>
                    </select>
                  </div>
                </div>
                <div class="color-row mt-4">
                  <input type="color" class="color-swatch"
                    [value]="selectedEl()!.style.borderColor || '#ffffff'"
                    (input)="updateStyle(selectedEl()!.id, 'borderColor', $any($event.target).value)" />
                  <span class="color-val">{{ selectedEl()!.style.borderColor || '#ffffff' }}</span>
                </div>
              </div>

              <div class="d-prop">
                <label>Padding vertical (px)</label>
                <input class="d-input" type="number" min="4" max="40"
                  [value]="parsePx(selectedEl()!.style.padding)"
                  (input)="updateStyle(selectedEl()!.id, 'padding', $any($event.target).value + 'px 20px')" />
              </div>

              <div class="d-prop btn-hint-box">
                <lucide-icon [img]="MousePointerClick" [size]="14"></lucide-icon>
                <span>Al tocar este botón en la landing, el visitante verá el formulario de registro.</span>
              </div>
            </div>
          }

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
                <label>Tipografía</label>
                <select class="d-input d-font-select"
                  [value]="selectedEl()!.style.fontFamily"
                  (change)="updateStyle(selectedEl()!.id, 'fontFamily', $any($event.target).value)">
                  @for (f of fonts; track f.value) {
                    <option [value]="f.value" [style.font-family]="f.value">{{ f.label }}</option>
                  }
                </select>
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

              <div class="d-prop">
                <label>Interlineado</label>
                <input class="d-input" type="number" min="0.8" max="4" step="0.05"
                  [value]="selectedEl()!.style.lineHeight"
                  (input)="updateStyle(selectedEl()!.id, 'lineHeight', $any($event.target).value)" />
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

              <div class="d-prop-row">
                <div class="d-prop">
                  <label>Estilo</label>
                  <select class="d-input"
                    [value]="selectedEl()!.style.fontStyle || 'normal'"
                    (change)="updateStyle(selectedEl()!.id, 'fontStyle', $any($event.target).value)">
                    <option value="normal">Normal</option>
                    <option value="italic">Cursiva</option>
                  </select>
                </div>
                <div class="d-prop">
                  <label>Decoración</label>
                  <select class="d-input"
                    [value]="selectedEl()!.style.textDecoration || 'none'"
                    (change)="updateStyle(selectedEl()!.id, 'textDecoration', $any($event.target).value)">
                    <option value="none">Ninguna</option>
                    <option value="underline">Subrayado</option>
                    <option value="line-through">Tachado</option>
                  </select>
                </div>
              </div>

              <div class="d-prop-row">
                <div class="d-prop">
                  <label>Sep. palabras (px)</label>
                  <input class="d-input" type="number" min="0" max="40" step="1"
                    [value]="parsePx(selectedEl()!.style.wordSpacing || '0px')"
                    (input)="updateStyle(selectedEl()!.id, 'wordSpacing', $any($event.target).value + 'px')" />
                </div>
                <div class="d-prop">
                  <label>Sep. letras (em)</label>
                  <input class="d-input" type="number" min="-0.1" max="1" step="0.01"
                    [value]="parseEm(selectedEl()!.style.letterSpacing)"
                    (input)="updateStyle(selectedEl()!.id, 'letterSpacing', $any($event.target).value + 'em')" />
                </div>
              </div>

              <div class="d-prop">
                <label>Sombra de texto</label>
                <select class="d-input"
                  [value]="selectedEl()!.style.textShadow || 'none'"
                  (change)="updateStyle(selectedEl()!.id, 'textShadow', $any($event.target).value)">
                  <option value="none">Sin sombra</option>
                  <option value="1px 1px 2px rgba(0,0,0,0.8)">Suave oscura</option>
                  <option value="2px 2px 4px rgba(0,0,0,0.9)">Media oscura</option>
                  <option value="3px 3px 8px rgba(0,0,0,1)">Intensa oscura</option>
                  <option value="0 0 8px rgba(0,0,0,0.9)">Difusa oscura</option>
                  <option value="1px 1px 2px rgba(255,255,255,0.8)">Suave clara</option>
                  <option value="2px 2px 4px rgba(255,255,255,0.9)">Media clara</option>
                  <option value="0 0 12px rgba(255,255,255,0.9)">Brillo claro</option>
                  <option value="0 0 12px rgba(225,29,72,0.9)">Brillo rosa</option>
                  <option value="0 0 16px rgba(168,85,247,0.9)">Brillo púrpura</option>
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
      }

      <!-- ── Music modal ── -->
      @if (showMusicModal()) {
        <div class="music-overlay" (click)="showMusicModal.set(false)">
          <div class="music-modal" (click)="$event.stopPropagation()">
            <div class="music-modal-header">
              <span><lucide-icon [img]="Music" [size]="18"></lucide-icon> Música de la landing</span>
              <button class="d-close-btn" (click)="showMusicModal.set(false)">
                <lucide-icon [img]="X" [size]="18"></lucide-icon>
              </button>
            </div>
            <p class="d-hint-sm" style="text-align:left;margin:0;">
              Pega el código <strong>embed</strong> de una canción (Spotify, YouTube, SoundCloud…). En la landing aparecerá un botón de play para reproducirla.
            </p>
            <textarea class="d-input" rows="5"
              [value]="musicEmbed()"
              (input)="updateMusicEmbed($any($event.target).value)"
              placeholder='Ej: <iframe src="https://open.spotify.com/embed/track/..."></iframe>'></textarea>
            @if (musicEmbed().trim()) {
              <div class="music-preview" [innerHTML]="musicPreviewHtml()"></div>
            }
            <div class="music-modal-actions">
              @if (musicEmbed().trim()) {
                <button class="d-btn-ghost" (click)="updateMusicEmbed('')">
                  <lucide-icon [img]="Trash2" [size]="14"></lucide-icon> Quitar
                </button>
              }
              <button class="d-btn-primary" style="width:auto;padding:9px 22px;" (click)="showMusicModal.set(false)">Listo</button>
            </div>
          </div>
        </div>
      }

      @if (!configTab() && !selectedEl()) {
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
              <div class="d-prop">
                <label>Tamaño de imagen</label>
                <div class="d-seg-btns">
                  <button class="d-seg-btn" [class.active]="(design().background.backgroundSize || 'cover') === 'cover'"
                    (click)="updateBgSize('cover')">Cubrir</button>
                  <button class="d-seg-btn" [class.active]="design().background.backgroundSize === 'contain'"
                    (click)="updateBgSize('contain')">Contener</button>
                </div>
              </div>
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
              <div class="el-list-item" [class.active]="selectedId() === el.id" (click)="selectedId.set(el.id)">
                <span class="el-list-icon">{{ el.type === 'text' ? 'T' : el.type === 'button' ? '⬛' : '▣' }}</span>
                <span class="el-list-label">{{ el.type === 'button' ? (el.content || 'Botón') : el.type === 'text' ? (el.content.slice(0, 18) || 'Texto') : 'Imagen' }}</span>
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
      transition: width 0.2s ease;
    }
    .d-left.d-left-wide { width: 340px; }

    /* Colores en grid de 2 columnas para aprovechar el ancho extra */
    .form-colors {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 12px;
    }
    .form-colors .color-val { font-size: 11px; overflow: hidden; text-overflow: ellipsis; }

    .d-tabs {
      display: flex;
      border-bottom: 1px solid var(--color-border);
      background: #fafafa;
    }
    .d-tab {
      flex: 1;
      padding: 9px 2px;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-muted);
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      white-space: nowrap;
      transition: all 0.15s;
      margin-bottom: -1px;
    }
    .d-tab-label { font-size: 9.5px; letter-spacing: 0.01em; line-height: 1; }
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
      border: 2px solid #cbd5e1;
      transition: all 0.15s;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .bg-thumb:hover { border-color: var(--color-brand); }
    .bg-thumb.selected { border-color: var(--color-brand); outline: 2px solid rgba(var(--color-brand-rgb, 225,29,72), 0.3); }
    .bg-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
        linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
      background-size: 12px 12px;
      background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    }
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
      border: 1px solid #cbd5e1;
      position: relative;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
    }
    .media-thumb-sm img {
      width: 100%;
      height: 64px;
      object-fit: cover;
      display: block;
      /* Checkerboard para que imágenes blancas/transparentes se distingan */
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
        linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
      background-size: 12px 12px;
      background-position: 0 0, 0 6px, 6px -6px, -6px 0;
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
    .d-btn-sm-cta { background: var(--color-brand-light); color: var(--color-brand); border-color: rgba(225,29,72,0.3); }
    .d-btn-sm-cta:hover { background: var(--color-brand); color: #fff; }
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

    /* ── Form / confirmation live preview ── */
    .form-preview {
      position: absolute;
      inset: 0;
      z-index: 40;
      background: #121218;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 20px;
      overflow-y: auto;
    }
    .fp-toggle {
      display: flex;
      gap: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 9999px;
      padding: 4px;
      flex-shrink: 0;
    }
    .fp-toggle-btn {
      padding: 7px 18px;
      border: none;
      background: none;
      color: rgba(255,255,255,0.6);
      font-size: 13px;
      font-weight: 600;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .fp-toggle-btn.active { background: #fff; color: #111; }
    .fp-card {
      width: 280px;
      max-width: 100%;
      border-radius: 24px;
      padding: 26px 22px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex-shrink: 0;
    }
    .fp-title { font-size: 19px; font-weight: 800; font-family: 'Poppins', sans-serif; }
    .fp-title.fp-center { text-align: center; }
    .fp-badge { display: inline-flex; align-self: flex-start; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 9999px; }
    .fp-field { display: flex; flex-direction: column; gap: 6px; }
    .fp-label { font-size: 13px; font-weight: 600; }
    .fp-input {
      border: 1px solid var(--color-border);
      border-radius: 9999px;
      padding: 11px 16px;
      font-size: 13px;
      color: #9ca3af;
      background: #fff;
    }
    .fp-btn {
      margin-top: 6px;
      text-align: center;
      padding: 15px 20px;
      border-radius: 9999px;
      font-size: 15px;
      font-weight: 700;
      font-family: 'Poppins', sans-serif;
    }
    .fp-check { display: flex; justify-content: center; color: #22c55e; }
    .fp-sub { text-align: center; font-size: 14px; color: #6b7280; line-height: 1.5; }
    .fp-ticket {
      background: rgba(0,0,0,0.04);
      border: 2px dashed var(--color-border);
      border-radius: 16px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .fp-ticket-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
    .fp-ticket-code { font-family: monospace; font-size: 24px; font-weight: 800; letter-spacing: 0.12em; }
    .fp-ticket-hint { font-size: 11px; color: #9ca3af; }

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

    /* ── Grid & snap guides ── */
    .canvas-grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      background-image:
        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px);
      background-size: 32.4px 57.6px, 32.4px 57.6px, 108px 192px, 108px 192px;
    }

    .snap-guide {
      position: absolute;
      pointer-events: none;
      z-index: 30;
    }
    .snap-guide-v {
      top: 0;
      bottom: 0;
      width: 1px;
      background: #f43f5e;
      box-shadow: 0 0 6px rgba(244,63,94,0.7);
      transform: translateX(-0.5px);
    }
    .snap-guide-h {
      left: 0;
      right: 0;
      height: 1px;
      background: #f43f5e;
      box-shadow: 0 0 6px rgba(244,63,94,0.7);
      transform: translateY(-0.5px);
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

    .el-btn {
      width: 100%;
      box-sizing: border-box;
      pointer-events: none;
      display: block;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .el-btn-input {
      width: 100%;
      box-sizing: border-box;
      text-align: center;
      border: 1px solid rgba(99,179,237,0.8);
      outline: none;
      cursor: text;
    }

    /* ── Resize handles ── */
    .rh {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #fff;
      border: 2px solid #63b3ed;
      border-radius: 2px;
      z-index: 25;
    }
    .rh-w { left: -5px; top: 50%; transform: translateY(-50%); cursor: w-resize; }
    .rh-e { right: -5px; top: 50%; transform: translateY(-50%); cursor: e-resize; }
    .rh-s { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: s-resize; }

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

    .btn-hint-box {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: var(--color-brand-light);
      border: 1px solid rgba(225,29,72,0.2);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 12px;
      color: var(--color-brand);
      line-height: 1.5;
      margin-top: 4px;
    }
    .btn-hint-box lucide-icon { flex-shrink: 0; margin-top: 1px; }

    .d-seg-btns {
      display: flex;
      gap: 4px;
    }
    .d-seg-btn {
      flex: 1;
      padding: 6px 8px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-app);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .d-seg-btn.active { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }
    .d-seg-btn:hover:not(.active) { border-color: var(--color-brand); color: var(--color-brand); }

    .d-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--color-text-main);
      cursor: pointer;
    }
    .d-toggle-row input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: var(--color-brand); }

    .d-font-select { font-size: 13px; }

    .el-list-item.active { background: var(--color-brand-light); color: var(--color-brand); border-radius: 8px; }

    .mt-4 { margin-top: 4px; }

    .music-preview {
      margin-top: 8px;
      border-radius: 12px;
      overflow: hidden;
    }
    .music-preview iframe { width: 100%; border: none; border-radius: 12px; display: block; }

    /* ── Toolbar music active state ── */
    .d-btn-sm-on {
      background: var(--color-brand-light);
      color: var(--color-brand);
      border-color: rgba(225,29,72,0.3);
    }

    /* ── Music modal ── */
    .music-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.45);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .music-modal {
      width: calc(100% - 48px);
      max-width: 480px;
      background: #fff;
      border-radius: 20px;
      padding: 24px 28px 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 32px 64px rgba(0,0,0,0.3);
      max-height: 88vh;
      overflow-y: auto;
    }
    .music-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 16px;
      font-weight: 700;
      font-family: var(--font-heading, 'Poppins'), sans-serif;
      color: var(--color-text-main);
    }
    .music-modal-header span { display: flex; align-items: center; gap: 8px; }
    .music-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }

    /* ── Email confirmation live preview (center stage overlay) ── */
    .email-preview {
      position: absolute;
      inset: 0;
      z-index: 40;
      background: #121218;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 20px;
      overflow-y: auto;
    }
    .ep-card {
      width: 360px;
      max-width: 100%;
      margin: 0 auto;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      flex-shrink: 0;
    }
    .ep-pad { padding: 26px 22px; }
    .ep-header { text-align: center; margin-bottom: 20px; }
    .ep-header-img { max-height: 48px; width: auto; max-width: 100%; }
    .ep-logo { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 22px; color: #e11d48; letter-spacing: 0.04em; }
    .ep-banner { width: 100%; border-radius: 14px; display: block; margin-bottom: 18px; }
    .ep-title { font-size: 18px; font-weight: 800; text-align: center; margin: 0 0 10px; font-family: 'Poppins', sans-serif; }
    .ep-intro { font-size: 13px; line-height: 1.5; text-align: center; color: #4b5563; margin: 0 0 20px; }
    .ep-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; }
    .ep-row-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 3px; }
    .ep-row-strong { font-size: 15px; font-weight: 700; }
    .ep-row-sub { font-size: 13px; color: #4b5563; }
    .ep-ticket {
      display: inline-block; color: #fff; padding: 8px 16px; border-radius: 10px;
      font-family: monospace; font-size: 20px; font-weight: 800; letter-spacing: 3px; margin-top: 6px;
    }
    .ep-note { font-size: 12px; color: #4b5563; text-align: center; margin: 18px 0 0; }
    .ep-foot { background: #111827; color: #9ca3af; font-size: 11px; text-align: center; padding: 16px; }
  `],
})
export class InvitationDesignerComponent implements OnInit {
  @Input() mediaFiles: MediaFile[] = [];
  @Input() eventId: string | null = null;
  @Input() set initialDesign(v: DesignSpec | null) {
    if (v && v.elements) this.design.set({ ...v, theme: v.theme ?? { ...DEFAULT_THEME } });
  }

  @ViewChild('canvasRef') canvasRef!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private sanitizer = inject(DomSanitizer);

  readonly Sparkles = Sparkles; readonly Plus = Plus; readonly Trash2 = Trash2;
  readonly AlignCenter = AlignCenter; readonly AlignLeft = AlignLeft; readonly AlignRight = AlignRight;
  readonly ImageIcon = ImageIcon; readonly Type = Type; readonly Save = Save;
  readonly X = X; readonly BookmarkPlus = BookmarkPlus; readonly Film = Film;
  readonly Wand2 = Wand2; readonly ChevronDown = ChevronDown; readonly CopyPlus = CopyPlus;
  readonly Eye = Eye; readonly MousePointerClick = MousePointerClick;
  readonly Palette = Palette;
  readonly CheckCircle = CheckCircle;
  readonly Music = Music;
  readonly Mail = Mail;
  readonly Math = Math;

  design = signal<DesignSpec>({ ...DEFAULT_DESIGN, elements: [], background: { ...DEFAULT_DESIGN.background, overlay: { ...DEFAULT_DESIGN.background.overlay } }, theme: { ...DEFAULT_THEME } });
  selectedId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  leftTab = signal<'ai' | 'media' | 'templates' | 'form' | 'email'>('ai');
  // Tabs de configuración (sin edición de canvas, con previsualización en el centro)
  configTab = computed(() => this.leftTab() === 'form' || this.leftTab() === 'email');
  formPreview = signal<'form' | 'success'>('form');
  aiPrompt = signal('');
  aiBackgroundUrl = signal('');
  aiGenerating = signal(false);
  saving = signal(false);
  showMusicModal = signal(false);
  isDragging = signal(false);
  snapGuideX = signal<number | null>(null);
  snapGuideY = signal<number | null>(null);

  @Output() designChange = new EventEmitter<DesignSpec>();

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
  theme = computed(() => this.design().theme ?? DEFAULT_THEME);
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

  private resizeState: {
    handle: 'w' | 'e' | 's';
    elId: string;
    startMouseX: number;
    startMouseY: number;
    startLeft: number;
    startWidth: number;
    startHeight: number;
    canvasRect: DOMRect;
    changed: boolean;
  } | null = null;

  private bgColorMap = new Map<string, string>();

  readonly fonts = FONTS;

  ngOnInit() {
    this.loadFonts();
    this.loadTemplates();
  }

  private loadFonts() {
    const families = FONTS.map(f => f.value.replace(/ /g, '+')).join('&family=');
    const href = `https://fonts.googleapis.com/css2?family=${families}:wght@400;600;700;800&display=swap`;
    if (!document.querySelector(`link[data-gf="designer"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-gf', 'designer');
      document.head.appendChild(link);
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    if (this.dragState?.moved) this.emitChange();
    this.dragState = null;
    if (this.resizeState?.changed) this.emitChange();
    this.resizeState = null;
    this.isDragging.set(false);
    this.snapGuideX.set(null);
    this.snapGuideY.set(null);
  }

  private emitChange() {
    this.designChange.emit(this.design());
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
    this.isDragging.set(true);
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
    if (el.type !== 'text' && el.type !== 'button') return;
    this.editingId.set(el.id);
  }

  onMouseMove(e: MouseEvent) {
    if (this.resizeState) {
      const rs = this.resizeState;
      const dx = e.clientX - rs.startMouseX;
      const dy = e.clientY - rs.startMouseY;
      if (!rs.changed && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      rs.changed = true;
      const dxPct = (dx / rs.canvasRect.width) * 100;
      let updates: Partial<DesignElement> = {};
      if (rs.handle === 'e') {
        updates = { width: Math.max(5, Math.min(100 - rs.startLeft, rs.startWidth + dxPct)) };
      } else if (rs.handle === 'w') {
        const newLeft = Math.max(0, Math.min(rs.startLeft + rs.startWidth - 5, rs.startLeft + dxPct));
        updates = { left: newLeft, width: rs.startWidth - (newLeft - rs.startLeft) };
      } else if (rs.handle === 's') {
        updates = { imageHeight: Math.max(10, rs.startHeight + dy) };
      }
      this.design.update(d => ({
        ...d,
        elements: d.elements.map(el => el.id === rs.elId ? { ...el, ...updates } : el),
      }));
      return;
    }

    if (!this.dragState) return;
    const dx = e.clientX - this.dragState.startMouseX;
    const dy = e.clientY - this.dragState.startMouseY;
    if (!this.dragState.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    this.dragState.moved = true;
    const rect = this.dragState.canvasRect;
    const el = this.design().elements.find(el => el.id === this.dragState!.elId);
    if (!el) return;

    const rawLeft = Math.max(0, Math.min(100 - el.width, this.dragState.startElLeft + (dx / rect.width) * 100));
    const rawTop  = Math.max(0, Math.min(95, this.dragState.startElTop + (dy / rect.height) * 100));

    const { left: snappedLeft, guideX } = this.snapX(rawLeft, el.width);
    const { top: snappedTop, guideY }   = this.snapY(rawTop);

    this.snapGuideX.set(guideX);
    this.snapGuideY.set(guideY);

    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === this.dragState!.elId ? { ...e, left: snappedLeft, top: snappedTop } : e),
    }));
  }

  private readonly SNAP_THRESHOLD = 3;

  private snapX(rawLeft: number, elWidth: number): { left: number; guideX: number | null } {
    const candidates: Array<{ snapLeft: number; guide: number }> = [
      { snapLeft: 0,                    guide: 0     },
      { snapLeft: 100 - elWidth,        guide: 100   },
      { snapLeft: 50 - elWidth / 2,     guide: 50    },
      { snapLeft: 33.33 - elWidth / 2,  guide: 33.33 },
      { snapLeft: 66.67 - elWidth / 2,  guide: 66.67 },
    ];
    for (const c of candidates) {
      if (Math.abs(rawLeft - c.snapLeft) < this.SNAP_THRESHOLD) {
        return { left: c.snapLeft, guideX: c.guide };
      }
    }
    return { left: rawLeft, guideX: null };
  }

  private snapY(rawTop: number): { top: number; guideY: number | null } {
    const candidates: Array<{ snapTop: number; guide: number }> = [
      { snapTop: 0,     guide: 0     },
      { snapTop: 50,    guide: 50    },
      { snapTop: 33.33, guide: 33.33 },
      { snapTop: 66.67, guide: 66.67 },
    ];
    for (const c of candidates) {
      if (Math.abs(rawTop - c.snapTop) < this.SNAP_THRESHOLD) {
        return { top: c.snapTop, guideY: c.guide };
      }
    }
    return { top: rawTop, guideY: null };
  }

  onResizeStart(e: MouseEvent, handle: 'w' | 'e' | 's', el: DesignElement) {
    e.preventDefault();
    e.stopPropagation();
    const canvas = this.canvasRef.nativeElement;
    this.resizeState = {
      handle,
      elId: el.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: el.left,
      startWidth: el.width,
      startHeight: el.imageHeight || 80,
      canvasRect: canvas.getBoundingClientRect(),
      changed: false,
    };
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
    this.emitChange();
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
    this.emitChange();
  }

  addButtonEl() {
    const el: DesignElement = {
      id: genId(),
      type: 'button',
      left: 5,
      top: 80,
      width: 90,
      content: 'Registrarme',
      imageUrl: '',
      imageHeight: 0,
      style: {
        ...DEFAULT_STYLE,
        fontSize: '16px',
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
        background: '#e11d48',
        borderRadius: '9999px',
        padding: '14px 20px',
        letterSpacing: '0.02em',
        lineHeight: '1',
        textTransform: 'none',
      },
    };
    this.design.update(d => ({ ...d, elements: [...d.elements, el] }));
    this.selectedId.set(el.id);
    this.emitChange();
  }

  updateEl(id: string, updates: Partial<DesignElement>) {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
    this.emitChange();
  }

  updateStyle(id: string, key: keyof ElementStyle, value: string) {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(e => e.id === id ? { ...e, style: { ...e.style, [key]: value } } : e),
    }));
    this.emitChange();
  }

  centerEl(id: string) {
    const el = this.design().elements.find(e => e.id === id);
    if (!el) return;
    if (el.type === 'text') {
      this.design.update(d => ({
        ...d,
        elements: d.elements.map(e => e.id === id ? { ...e, left: 0, width: 100, style: { ...e.style, textAlign: 'center' } } : e),
      }));
    } else {
      const centeredLeft = Math.max(0, (100 - el.width) / 2);
      this.design.update(d => ({
        ...d,
        elements: d.elements.map(e => e.id === id ? { ...e, left: centeredLeft } : e),
      }));
    }
    this.emitChange();
  }

  centerAll() {
    this.design.update(d => ({
      ...d,
      elements: d.elements.map(el => {
        const w = Math.min(100, Math.max(1, el.width));
        return { ...el, width: w, left: Math.max(0, (100 - w) / 2) };
      }),
    }));
    this.emitChange();
    this.toast.success('Elementos centrados');
  }

  async deleteEl(id: string) {
    const ok = await this.confirm.confirm({ title: 'Eliminar elemento', message: '¿Eliminar este elemento?', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.design.update(d => ({ ...d, elements: d.elements.filter(e => e.id !== id) }));
    this.selectedId.set(null);
    this.emitChange();
  }

  // ── Background ────────────────────────────────────────────────────────────

  setBackground(file: MediaFile) {
    this.design.update(d => ({
      ...d,
      background: { ...d.background, type: 'image', url: file.url, overlay: d.background.overlay.opacity > 0 ? d.background.overlay : { color: '#000000', opacity: 0.35 } },
    }));
    this.aiBackgroundUrl.set(file.url);
    this.emitChange();
  }

  setVideoBackground(file: MediaFile) {
    this.design.update(d => ({
      ...d,
      background: { ...d.background, type: 'video', url: file.url, overlay: d.background.overlay.opacity > 0 ? d.background.overlay : { color: '#000000', opacity: 0.35 } },
    }));
    this.aiBackgroundUrl.set(file.url);
    this.emitChange();
  }

  clearBackground() {
    this.design.update(d => ({ ...d, background: { ...d.background, type: 'color', url: '' } }));
    this.aiBackgroundUrl.set('');
    this.emitChange();
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

  // ── Tema del formulario / página de éxito ─────────────────────────────────

  updateTheme(key: keyof LandingTheme, value: string) {
    this.design.update(d => ({ ...d, theme: { ...(d.theme ?? DEFAULT_THEME), [key]: value } }));
    this.emitChange();
  }

  // ── Música embebida ───────────────────────────────────────────────────────

  musicEmbed = computed(() => this.design().music?.embedCode ?? '');
  musicPreviewHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.design().music?.embedCode ?? ''));

  updateMusicEmbed(code: string) {
    this.design.update(d => ({ ...d, music: { embedCode: code } }));
    this.emitChange();
  }

  // ── Correo de confirmación ────────────────────────────────────────────────

  emailDesign = computed<EmailDesign>(() => ({ ...DEFAULT_EMAIL, ...(this.design().emailDesign ?? {}) }));

  private interpolatePreview(tpl: string): string {
    return tpl.replace(/\{name\}/g, 'María').replace(/\{eventTitle\}/g, 'Nombre del evento');
  }
  previewTitle = computed(() => this.interpolatePreview(this.emailDesign().title || DEFAULT_EMAIL.title));
  previewIntro = computed(() => this.interpolatePreview(this.emailDesign().intro || DEFAULT_EMAIL.intro));
  previewFooterNote = computed(() => this.interpolatePreview(this.emailDesign().footerNote || DEFAULT_EMAIL.footerNote));

  updateEmail<K extends keyof EmailDesign>(key: K, value: EmailDesign[K]) {
    this.design.update(d => ({ ...d, emailDesign: { ...DEFAULT_EMAIL, ...(d.emailDesign ?? {}), [key]: value } }));
    this.emitChange();
  }

  resetEmail() {
    this.design.update(d => ({ ...d, emailDesign: { ...DEFAULT_EMAIL } }));
    this.emitChange();
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
      fontStyle: s.fontStyle || 'normal',
      color: s.color || '#ffffff',
      textAlign: s.textAlign || 'center',
      letterSpacing: s.letterSpacing || '0',
      lineHeight: s.lineHeight || '1.2',
      textTransform: s.textTransform || 'none',
      textDecoration: s.textDecoration || 'none',
      wordSpacing: s.wordSpacing || '0px',
      textShadow: s.textShadow || 'none',
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

  getBtnStyles(el: DesignElement): Record<string, string> {
    const s = el.style;
    const bw = s.borderWidth || '0px';
    return {
      display: 'block',
      width: '100%',
      fontFamily: s.fontFamily || 'Poppins',
      fontSize: s.fontSize || '16px',
      fontWeight: s.fontWeight || '700',
      fontStyle: s.fontStyle || 'normal',
      color: s.color || '#ffffff',
      textAlign: 'center',
      letterSpacing: s.letterSpacing || '0',
      lineHeight: s.lineHeight || '1',
      textTransform: s.textTransform || 'none',
      textDecoration: s.textDecoration || 'none',
      padding: s.padding || '14px 20px',
      background: s.background || '#e11d48',
      borderRadius: s.borderRadius || '9999px',
      border: `${bw} ${s.borderStyle || 'solid'} ${bw !== '0px' ? (s.borderColor || 'transparent') : 'transparent'}`,
      boxSizing: 'border-box',
      cursor: 'default',
      outline: 'none',
    };
  }

  updateBtnBgColor(id: string, hex: string) {
    this.bgColorMap.set(id, hex);
    this.updateStyle(id, 'background', hex);
  }

  setBtnTransparent(id: string, transparent: boolean) {
    this.updateStyle(id, 'background', transparent ? 'transparent' : '#e11d48');
  }

  updateBgSize(size: 'cover' | 'contain') {
    this.design.update(d => ({ ...d, background: { ...d.background, backgroundSize: size } }));
    this.emitChange();
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
      // Forzar centrado horizontal: el flyer es centrado, la IA a veces deja left/width descuadrados.
      const centered: DesignSpec = {
        ...normalized,
        elements: normalized.elements.map(el => {
          const w = Math.min(100, Math.max(1, el.width));
          return { ...el, width: w, left: Math.max(0, (100 - w) / 2) };
        }),
      };
      this.design.set(centered);
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
        type: (e['type'] === 'image' ? 'image' : e['type'] === 'button' ? 'button' : 'text') as 'text' | 'image' | 'button',
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
          fontStyle: String(style['fontStyle'] ?? 'normal'),
          color: String(style['color'] ?? '#ffffff'),
          textAlign: String(style['textAlign'] ?? 'center'),
          letterSpacing: String(style['letterSpacing'] ?? '0'),
          lineHeight: String(style['lineHeight'] ?? '1.2'),
          textTransform: String(style['textTransform'] ?? 'none'),
          textDecoration: String(style['textDecoration'] ?? 'none'),
          wordSpacing: String(style['wordSpacing'] ?? '0px'),
          textShadow: String(style['textShadow'] ?? 'none'),
          padding: String(style['padding'] ?? '8px'),
          background: String(style['background'] ?? 'transparent'),
          borderRadius: String(style['borderRadius'] ?? '0'),
          borderColor: String(style['borderColor'] ?? 'transparent'),
          borderWidth: String(style['borderWidth'] ?? '0px'),
          borderStyle: String(style['borderStyle'] ?? 'solid'),
        },
      };
    });
    const t = (d['theme'] as Record<string, unknown>) ?? {};
    const m = (d['music'] as Record<string, unknown>) ?? {};
    const em = (d['emailDesign'] as Partial<EmailDesign>) ?? {};
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
        backgroundSize: (bg['backgroundSize'] === 'contain' ? 'contain' : 'cover') as 'cover' | 'contain',
      },
      elements,
      theme: {
        formBg: String(t['formBg'] ?? DEFAULT_THEME.formBg),
        textColor: String(t['textColor'] ?? DEFAULT_THEME.textColor),
        buttonBg: String(t['buttonBg'] ?? DEFAULT_THEME.buttonBg),
        buttonText: String(t['buttonText'] ?? DEFAULT_THEME.buttonText),
        accent: String(t['accent'] ?? DEFAULT_THEME.accent),
        formTitle: String(t['formTitle'] ?? ''),
        formButton: String(t['formButton'] ?? ''),
        successTitle: String(t['successTitle'] ?? ''),
        successMessage: String(t['successMessage'] ?? ''),
      },
      music: { embedCode: String(m['embedCode'] ?? '') },
      emailDesign: { ...DEFAULT_EMAIL, ...em },
    };
  }

  // ── Save design ───────────────────────────────────────────────────────────

  async saveDesign() {
    if (!this.eventId) {
      this.emitChange();
      this.toast.success('El diseño se guardará al crear el evento');
      return;
    }
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
