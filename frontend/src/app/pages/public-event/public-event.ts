import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  HostListener,
  ElementRef,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgStyle } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LucideAngularModule, Calendar, CalendarPlus, Clock, Tag, Users, CheckCircle, X, ChevronUp, Play, Pause, Music, MapPin, Download, Share2, Info } from 'lucide-angular';

import { environment } from '../../../environments/environment';
import { loadSpotifyIframeApi, spotifyUri, type SpotifyController } from '../../shared/landing-music';
import { currentHost, isCustomDomain } from '../../shared/custom-domain';
import { applyTabBrand } from '../../shared/page-brand';
import { ToastService } from '../../shared/toast';
import { buildIcs, ctaLabel, forgetTicket, googleCalendarUrl, loadTicket, mapsUrl, saveTicket } from './public-event-utils';
const API = environment.apiUrl;

type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'phone' | 'date';

interface EventFormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

interface DesignBackground {
  type: 'image' | 'video' | 'color';
  url: string;
  color: string;
  overlay: { color: string; opacity: number };
  backgroundSize?: 'cover' | 'contain';
}

interface DesignElement {
  id: string;
  type: 'text' | 'image' | 'button';
  left: number;
  top: number;
  width: number;
  content: string;
  imageUrl: string;
  imageHeight: number;
  style: {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    textAlign?: string;
    letterSpacing?: string;
    lineHeight?: string;
    textTransform?: string;
    textDecoration?: string;
    wordSpacing?: string;
    textShadow?: string;
    padding?: string;
    background?: string;
    borderRadius?: string;
    borderColor?: string;
    borderWidth?: string;
    borderStyle?: string;
  };
}

interface LandingTheme {
  formBg: string;
  textColor: string;
  buttonBg: string;
  buttonText: string;
  accent: string;
  formTitle?: string;
  formButton?: string;
  successTitle?: string;
  successMessage?: string;
}

interface InvitationDesign {
  version: string;
  background: DesignBackground;
  elements: DesignElement[];
  theme?: LandingTheme;
  music?: { embedCode: string; audioUrl?: string; audioName?: string };
}

const DEFAULT_THEME: LandingTheme = {
  formBg: '#ffffff',
  textColor: '#0f172a',
  buttonBg: '#e11d48',
  buttonText: '#ffffff',
  accent: '#e11d48',
};

interface PublicEvent {
  _id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  price: number;
  imageUrl?: string;
  status: string;
  slug?: string;
  location?: string;
  formFields?: EventFormField[];
  invitationDesign?: InvitationDesign;
}

/** Dónde es el evento (HU33). */
interface PublicVenue {
  name: string;
  address?: string;
}

/** Marca de la empresa organizadora (HU26). */
interface PublicBrand {
  name: string;
  logo?: string;
  favicon?: string;
}

interface RegistrationResult {
  _id: string;
  name: string;
  email: string;
  ticketCode: string;
  partySize: number;
}

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return opacity === 0 ? 'transparent' : `rgba(${r},${g},${b},${opacity})`;
}

@Component({
  selector: 'app-public-event',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, NgStyle],
  template: `
    <div class="pe-shell">

      @if (loading()) {
        <div class="pe-loading">
          <div class="spinner"></div>
          <p>Cargando evento...</p>
        </div>

      } @else if (loadError()) {
        <div class="pe-notfound">
          <lucide-icon [img]="Calendar" [size]="56" [strokeWidth]="1.5"></lucide-icon>
          <h2>No pudimos cargar el evento</h2>
          <p>Hubo un problema de conexión con el servidor. Inténtalo de nuevo en unos minutos.</p>
          <button class="pe-cta-btn" style="max-width:240px;margin-top:8px;" (click)="loadEvent()">Reintentar</button>
        </div>

      } @else if (notFound()) {
        <div class="pe-notfound">
          <lucide-icon [img]="Calendar" [size]="56" [strokeWidth]="1.5"></lucide-icon>
          <h2>Evento no encontrado</h2>
          <p>El evento que buscas no existe o ya no está disponible.</p>
        </div>

      } @else if (ev()) {

        @if (brand()?.logo) {
          <div class="pe-brand">
            <img [src]="brand()!.logo" [alt]="brand()!.name" />
          </div>
        }

        <!-- ══════════════════════════════════════════ -->
        <!-- Full-screen design canvas                  -->
        <!-- ══════════════════════════════════════════ -->
        @if (hasDesign()) {
          <div class="pe-canvas-outer">
            <div class="pe-canvas-inner"
              [style.transform]="'scale(' + scale() + ')'"
              [style.background]="canvasBg()">

              @if (ev()!.invitationDesign!.background.type === 'video' && ev()!.invitationDesign!.background.url) {
                <video class="canvas-bg-media" autoplay muted loop playsinline
                  [src]="ev()!.invitationDesign!.background.url"
                  [style.object-fit]="ev()!.invitationDesign!.background.backgroundSize || 'cover'"
                  [style.object-position]="'center center'"></video>
              } @else if (ev()!.invitationDesign!.background.type === 'image' && ev()!.invitationDesign!.background.url) {
                <img class="canvas-bg-media" [src]="ev()!.invitationDesign!.background.url" alt=""
                  [style.object-fit]="ev()!.invitationDesign!.background.backgroundSize || 'cover'"
                  [style.object-position]="'center center'" />
              }

              @if (ev()!.invitationDesign!.background.overlay.opacity > 0) {
                <div class="canvas-overlay"
                  [style.background]="overlayBg()"></div>
              }

              @for (el of ev()!.invitationDesign!.elements; track el.id) {
                @if (el.type === 'button') {
                  <div class="canvas-el" [style.left.%]="el.left" [style.top.%]="el.top" [style.width.%]="el.width">
                    <button class="canvas-cta-btn" [ngStyle]="getElStyle(el)" (click)="openForm()">
                      {{ el.content }}
                    </button>
                  </div>
                } @else if (el.type === 'image' && el.imageUrl) {
                  <div class="canvas-el" [style.left.%]="el.left" [style.top.%]="el.top" [style.width.%]="el.width">
                    <img [src]="el.imageUrl" [style.height.px]="el.imageHeight || 80"
                      style="width:100%;object-fit:contain;display:block;" alt="" />
                  </div>
                } @else if (el.type === 'text') {
                  <div class="canvas-el" [style.left.%]="el.left" [style.top.%]="el.top" [style.width.%]="el.width">
                    <div [ngStyle]="getElStyle(el)">{{ el.content }}</div>
                  </div>
                }
              }
            </div>
          </div>

        } @else {
          <!-- Fallback hero when no design -->
          @if (ev()!.imageUrl) {
            <div class="pe-hero" [style.background-image]="'url(' + ev()!.imageUrl + ')'"></div>
          } @else {
            <div class="pe-hero-gradient"></div>
          }

          <div class="pe-fallback-info">
            <h1 class="pe-title">{{ ev()!.title }}</h1>
            <div class="pe-meta">
              <div class="pe-meta-item">
                <lucide-icon [img]="Calendar" [size]="16" [strokeWidth]="2"></lucide-icon>
                <span>{{ formatDate(ev()!.date) }}</span>
              </div>
              @if (ev()!.startTime) {
                <div class="pe-meta-item">
                  <lucide-icon [img]="Clock" [size]="16" [strokeWidth]="2"></lucide-icon>
                  <span>{{ ev()!.startTime }}{{ ev()!.endTime ? ' – ' + ev()!.endTime : '' }}</span>
                </div>
              }
              <div class="pe-meta-item">
                <lucide-icon [img]="Tag" [size]="16" [strokeWidth]="2"></lucide-icon>
                <span>{{ ev()!.price === 0 ? 'Entrada gratuita' : 'S/ ' + ev()!.price }}</span>
              </div>
            </div>
            @if (venueText()) {
              <a class="pe-venue" [href]="mapsLink()" target="_blank" rel="noopener">
                <lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2"></lucide-icon>
                <span><strong>{{ venueText() }}</strong><small>Cómo llegar</small></span>
              </a>
            }
            @if (paragraphs().length) {
              <div class="pe-description">
                @for (p of paragraphs(); track $index) { <p>{{ p }}</p> }
              </div>
            }
          </div>
        }

        <!-- Con diseño, los detalles van en una hoja aparte (HU33) -->
        @if (hasDesign() && hasDetails()) {
          <button type="button" class="pe-details-btn" [class.with-music]="hasMusic()" (click)="openDetails()"
            aria-haspopup="dialog">
            <lucide-icon [img]="Info" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            Detalles
          </button>
        }

        <!-- ══════════════════════════════════════════ -->
        <!-- Embedded music player                      -->
        <!-- ══════════════════════════════════════════ -->
        @if (musicMode() !== 'none') {
          <button class="pe-music-btn" type="button" [class.playing]="musicPlaying()" (click)="toggleMusic()"
            [attr.aria-pressed]="musicPlaying()"
            [attr.aria-label]="musicPlaying() ? 'Pausar música' : 'Reproducir música'">
            <lucide-icon [img]="musicPlaying() ? Pause : Play" [size]="18" [strokeWidth]="2.5"></lucide-icon>
          </button>
          @if (musicMode() === 'audio') {
            <!-- Audio propio: el botón es todo el reproductor (HU22). -->
            <audio #musicAudio [src]="musicAudioUrl()" loop preload="none"
              (play)="musicPlaying.set(true)" (pause)="musicPlaying.set(false)"></audio>
          } @else if (musicMode() === 'spotify') {
            <!-- Se crea al cargar, plegado: así el clic solo tiene que ordenar play(). -->
            <div class="pe-music-player pe-music-compact" [class.pe-music-collapsed]="!spotifyOpen()">
              <div #spotifyHost></div>
            </div>
          } @else if (musicPlaying()) {
            <div class="pe-music-player pe-music-compact" [innerHTML]="safeMusicHtml()"></div>
          }
        }

        <!-- ══════════════════════════════════════════ -->
        <!-- Fixed CTA button                           -->
        <!-- ══════════════════════════════════════════ -->
        @if (!registered()) {
          @if (spotsLeft() === 0 && ev()!.capacity > 0) {
            <div class="pe-cta-bar pe-cta-full">
              <lucide-icon [img]="Users" [size]="18"></lucide-icon>
              <span>Evento lleno — sin cupos disponibles</span>
            </div>
          } @else if (!showForm() && !hasButtonEl()) {
            <div class="pe-cta-bar">
              <button class="pe-cta-btn" (click)="openForm()">
                {{ ctaLabel(ev()!.price) }}
              </button>
            </div>
          }
        }

        <!-- ══════════════════════════════════════════ -->
        <!-- Slide-up registration drawer              -->
        <!-- ══════════════════════════════════════════ -->
        @if (!registered()) {
          <div class="pe-drawer-backdrop" [class.open]="showForm()" (click)="showForm.set(false)"></div>
          <div class="pe-drawer" [class.open]="showForm()" #formDrawer
            role="dialog" aria-modal="true" aria-labelledby="pe-form-title" [attr.aria-hidden]="!showForm()"
            [attr.inert]="showForm() ? null : ''" (keydown)="trapFocus($event, formDrawer)"
            [style.--form-bg]="theme().formBg"
            [style.--form-text]="theme().textColor"
            [style.--form-btn-bg]="theme().buttonBg"
            [style.--form-btn-text]="theme().buttonText"
            [style.--form-accent]="theme().accent">
            <div class="pe-drawer-handle">
              <button class="pe-drawer-close" (click)="showForm.set(false)" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="20"></lucide-icon>
              </button>
            </div>

            <div class="pe-drawer-content">
              <h2 class="pe-form-title" id="pe-form-title">
                {{ theme().formTitle || ctaLabel(ev()!.price) }}
              </h2>
              @if (ev()!.price > 0) {
                <p class="pe-pay-note">La entrada cuesta S/ {{ ev()!.price }} y se paga en el local.</p>
              }

              <form [formGroup]="form" (ngSubmit)="submitRegistration()" class="pe-form">

                <div class="field">
                  <label class="field-label" for="pe-name">Nombre completo *</label>
                  <input id="pe-name" class="input" formControlName="name" placeholder="Tu nombre"
                    autocomplete="name" autocapitalize="words" enterkeyhint="next" />
                  @if (form.get('name')?.invalid && form.get('name')?.touched) {
                    <span class="field-hint-error">El nombre es requerido</span>
                  }
                </div>

                <div class="field">
                  <label class="field-label" for="pe-email">Email *</label>
                  <input id="pe-email" class="input" type="email" formControlName="email" placeholder="tu@email.com"
                    autocomplete="email" inputmode="email" autocapitalize="off" enterkeyhint="next" />
                  @if (form.get('email')?.invalid && form.get('email')?.touched) {
                    <span class="field-hint-error">Email válido requerido</span>
                  }
                </div>

                <div class="field">
                  <label class="field-label" for="pe-phone">Teléfono</label>
                  <input id="pe-phone" class="input" type="tel" formControlName="phone" placeholder="+51 999 999 999"
                    autocomplete="tel" inputmode="tel" enterkeyhint="send" />
                </div>

                @for (field of customFields(); track field.id) {
                  <div class="field">
                    <label class="field-label">{{ field.label }}{{ field.required ? ' *' : '' }}</label>

                    @if (field.type === 'textarea') {
                      <textarea class="input" rows="3"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)"
                        placeholder="Escribe tu respuesta..."></textarea>
                    } @else if (field.type === 'select') {
                      <select class="input"
                        [value]="getCustomValue(field.id)"
                        (change)="setCustomValue(field.id, $any($event.target).value)">
                        <option value="">Seleccionar...</option>
                        @for (opt of field.options; track opt) {
                          <option [value]="opt">{{ opt }}</option>
                        }
                      </select>
                    } @else if (field.type === 'checkbox') {
                      <label class="checkbox-field">
                        <input type="checkbox"
                          [checked]="getCustomValue(field.id) === 'Sí'"
                          (change)="setCustomValue(field.id, $any($event.target).checked ? 'Sí' : 'No')" />
                        <span>Sí</span>
                      </label>
                    } @else if (field.type === 'number') {
                      <input class="input" type="number"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)" />
                    } @else if (field.type === 'email') {
                      <input class="input" type="email"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)"
                        placeholder="correo@ejemplo.com" />
                    } @else if (field.type === 'phone') {
                      <input class="input" type="tel"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)"
                        placeholder="+51 999 999 999" />
                    } @else if (field.type === 'date') {
                      <input class="input" type="date"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)" />
                    } @else {
                      <input class="input" type="text"
                        [value]="getCustomValue(field.id)"
                        (input)="setCustomValue(field.id, $any($event.target).value)"
                        placeholder="Escribe tu respuesta" />
                    }
                  </div>
                }

                @if (formError()) {
                  <div class="form-error">{{ formError() }}</div>
                }

                <button type="submit" class="btn btn-primary btn-lg w-full" [disabled]="submitting()"
                  [style.background]="theme().buttonBg" [style.color]="theme().buttonText">
                  {{ submitting() ? 'Procesando...' : (theme().formButton || (ev()!.price === 0 ? 'Confirmar asistencia' : 'Reservar entrada')) }}
                </button>
              </form>
            </div>
          </div>
        }

        @if (hasDesign() && hasDetails()) {
          <div class="pe-drawer-backdrop" [class.open]="showDetails()" (click)="showDetails.set(false)"></div>
          <div class="pe-drawer pe-details" [class.open]="showDetails()" #detailsDrawer
            role="dialog" aria-modal="true" aria-labelledby="pe-details-title" [attr.aria-hidden]="!showDetails()"
            [attr.inert]="showDetails() ? null : ''" (keydown)="trapFocus($event, detailsDrawer)">
            <div class="pe-drawer-handle">
              <button class="pe-drawer-close" (click)="showDetails.set(false)" aria-label="Cerrar detalles">
                <lucide-icon [img]="X" [size]="20"></lucide-icon>
              </button>
            </div>
            <div class="pe-drawer-content">
              <h2 class="pe-form-title" id="pe-details-title">{{ ev()!.title }}</h2>
              <div class="pe-meta">
                <div class="pe-meta-item">
                  <lucide-icon [img]="Calendar" [size]="16" [strokeWidth]="2"></lucide-icon>
                  <span>{{ formatDate(ev()!.date) }}</span>
                </div>
                @if (ev()!.startTime) {
                  <div class="pe-meta-item">
                    <lucide-icon [img]="Clock" [size]="16" [strokeWidth]="2"></lucide-icon>
                    <span>{{ ev()!.startTime }}{{ ev()!.endTime ? ' – ' + ev()!.endTime : '' }}</span>
                  </div>
                }
              </div>
              @if (venueText()) {
                <a class="pe-venue" [href]="mapsLink()" target="_blank" rel="noopener">
                  <lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2"></lucide-icon>
                  <span><strong>{{ venueText() }}</strong><small>Cómo llegar</small></span>
                </a>
              }
              @if (paragraphs().length) {
                <div class="pe-description">
                  @for (p of paragraphs(); track $index) { <p>{{ p }}</p> }
                </div>
              }
              @if (!registered() && !(spotsLeft() === 0 && ev()!.capacity > 0)) {
                <button type="button" class="btn btn-primary btn-lg w-full" (click)="showDetails.set(false); openForm()">
                  {{ ctaLabel(ev()!.price) }}
                </button>
              }
            </div>
          </div>
        }

        <!-- ══════════════════════════════════════════ -->
        <!-- Full-screen success overlay               -->
        <!-- ══════════════════════════════════════════ -->
        @if (registered()) {
          <div class="pe-success-overlay animate-fade-in">
            <div class="pe-success-card"
              [style.--form-bg]="theme().formBg"
              [style.--form-text]="theme().textColor"
              [style.--form-accent]="theme().accent">
              <lucide-icon [img]="CheckCircle" [size]="64" [strokeWidth]="1.5"></lucide-icon>
              <h2>{{ returning() ? 'Ya estás registrado' : (theme().successTitle || '¡Registro confirmado!') }}</h2>
              @if (theme().successMessage) {
                <p>{{ theme().successMessage }}</p>
              } @else {
                <p>Nos vemos el <strong>{{ formatDate(ev()!.date) }}</strong>{{ ev()!.startTime ? ' a las ' + ev()!.startTime : '' }}.</p>
              }
              <div class="ticket-box">
                <span class="ticket-label">Tu código de ticket</span>
                @if (ticketQrDataUrl()) {
                  <img [src]="ticketQrDataUrl()" alt="Código QR de la invitación" class="ticket-qr" />
                }
                <code class="ticket-code">{{ registration()!.ticketCode }}</code>
                <span class="ticket-hint">Presenta este código QR en el evento</span>
              </div>
              <p class="ticket-email">Confirmación enviada a <strong>{{ registration()!.email }}</strong></p>

              <div class="pe-success-actions">
                <button type="button" class="btn btn-secondary" (click)="addToCalendar()">
                  <lucide-icon [img]="CalendarPlus" [size]="16"></lucide-icon> Añadir al calendario
                </button>
                <button type="button" class="btn btn-secondary" (click)="saveTicketImage()" [disabled]="!ticketQrDataUrl()">
                  <lucide-icon [img]="Download" [size]="16"></lucide-icon> Guardar entrada
                </button>
                @if (venueText()) {
                  <a class="btn btn-secondary" [href]="mapsLink()" target="_blank" rel="noopener">
                    <lucide-icon [img]="MapPin" [size]="16"></lucide-icon> Cómo llegar
                  </a>
                }
                <button type="button" class="btn btn-primary" (click)="inviteFriend()">
                  <lucide-icon [img]="Share2" [size]="16"></lucide-icon> Invitar a un amigo
                </button>
              </div>
              <a class="pe-gcal" [href]="googleCalUrl()" target="_blank" rel="noopener">Añadir a Google Calendar</a>
              <button type="button" class="pe-link" (click)="registerAnother()">¿No eres tú? Registrar a otra persona</button>
            </div>
          </div>
        }

      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .pe-shell {
      min-height: 100vh;
      min-height: 100dvh;
      background: #000;
      position: relative;
      overflow-x: hidden;
    }

    /* ── Loading / Not found ── */
    .pe-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:120px 24px; color:var(--color-text-muted); min-height:100vh; min-height:100dvh; }
    .spinner { width:40px; height:40px; border-radius:50%; border:3px solid var(--color-border); border-top-color:var(--color-brand); animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    .pe-notfound { text-align:center; padding:120px 24px; display:flex; flex-direction:column; align-items:center; gap:16px; color:var(--color-text-muted); min-height:100vh; min-height:100dvh; }
    .pe-notfound h2 { margin:0; color:var(--color-text-main); }
    .pe-notfound p { margin:0; }

    /* ── Full-screen canvas ── */
    .pe-canvas-outer {
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      padding-top: 177.78%; /* 9:16 — % is relative to own width, capped by max-width */
      position: relative;
      overflow: hidden;
      background: #000;
    }

    .pe-canvas-inner {
      position: absolute;
      top: 0; left: 0;
      width: 324px;
      height: 576px;
      transform-origin: top left;
      overflow: hidden;
    }

    .canvas-bg-media {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-position: center center;
    }

    .canvas-overlay {
      position: absolute;
      inset: 0;
    }

    .canvas-el {
      position: absolute;
      pointer-events: none;
      box-sizing: border-box;
    }

    .canvas-cta-btn {
      appearance: none;
      -webkit-appearance: none;
      pointer-events: all;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      outline: none;
      margin: 0;
      transition: filter 0.15s, transform 0.15s;
    }
    .canvas-cta-btn:hover { filter: brightness(1.1); transform: translateY(-1px) scaleX(1.01); }
    .canvas-cta-btn:active { transform: translateY(0); filter: brightness(0.95); }

    /* ── Fallback hero ── */
    .pe-hero { height: 280px; background-size:cover; background-position:center; }
    .pe-hero-gradient { height:180px; background:linear-gradient(135deg,var(--color-brand) 0%,#7c3aed 100%); }

    .pe-fallback-info {
      max-width: 600px;
      margin: -24px auto 0;
      padding: 28px 24px calc(120px + env(safe-area-inset-bottom));
      position: relative;
      background: var(--color-white);
      border-radius: 24px 24px 0 0;
      min-height: 60vh;
      min-height: 60dvh;
      box-sizing: border-box;
    }

    .pe-venue { display:flex; align-items:center; gap:12px; margin-top:20px; padding:14px 16px; border:1px solid var(--color-border); border-radius:var(--radius-sm); color:var(--color-text-main); text-decoration:none; min-height:44px; box-sizing:border-box; }
    .pe-venue lucide-icon { color:var(--color-brand); flex-shrink:0; }
    .pe-venue span { display:flex; flex-direction:column; gap:2px; font-size:14px; }
    .pe-venue small { color:var(--color-brand); font-weight:600; font-size:13px; }
    .pe-description { margin-top:20px; color:var(--color-text-main); font-size:15px; line-height:1.6; }
    .pe-description p { margin:0 0 12px; }

    .pe-details-btn {
      position: fixed; z-index: 65;
      top: calc(16px + env(safe-area-inset-top)); right: 16px;
      height: 44px; padding: 0 16px; border: none; border-radius: 9999px;
      display: flex; align-items: center; gap: 6px;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(8px); color: #fff;
      font: 700 14px var(--font-base); cursor: pointer; box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    }
    .pe-details-btn.with-music { right: 70px; }
    .pe-pay-note { margin:-8px 0 16px; font-size:14px; color:var(--color-text-muted); }

    .pe-title { font-size:26px; font-weight:800; margin:0 0 20px; font-family:var(--font-heading); line-height:1.25; color:var(--color-text-main); }
    .pe-meta { display:flex; flex-wrap:wrap; gap:12px; }
    .pe-meta-item { display:flex; align-items:center; gap:6px; font-size:14px; font-weight:500; color:var(--color-text-muted); background:var(--color-bg-app); padding:6px 12px; border-radius:var(--radius-pill); }

    /* ── CTA bar ── */
    .pe-cta-bar {
      position: fixed;
      bottom: 0;
      left: 0; right: 0;
      padding: 16px 24px calc(16px + env(safe-area-inset-bottom));
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
      z-index: 50;
      display: flex;
      justify-content: center;
    }

    .pe-cta-bar.pe-cta-full {
      background: rgba(0,0,0,0.75);
      color: #fff;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 15px;
      justify-content: center;
      padding: 20px 24px calc(20px + env(safe-area-inset-bottom));
    }

    .pe-cta-btn {
      width: 100%;
      max-width: 480px;
      padding: 18px 32px;
      background: var(--color-brand);
      color: #fff;
      border: none;
      border-radius: var(--radius-pill);
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(225,29,72,0.45);
      transition: all 0.2s;
      font-family: var(--font-heading);
      letter-spacing: -0.2px;
    }
    .pe-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(225,29,72,0.55); }
    .pe-cta-btn:active { transform: translateY(0); }

    /* ── Slide-up drawer ── */
    .pe-drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0);
      z-index: 60;
      pointer-events: none;
      transition: background 0.3s;
    }
    .pe-drawer-backdrop.open {
      background: rgba(0,0,0,0.55);
      pointer-events: all;
    }

    .pe-drawer {
      position: fixed;
      bottom: 0;
      left: 0; right: 0;
      background: var(--form-bg, var(--color-bg-card, #fff));
      border-radius: 24px 24px 0 0;
      z-index: 70;
      transform: translateY(100%);
      transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
      max-height: 92vh;
      max-height: 92dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
    }
    .pe-drawer.open {
      transform: translateY(0);
    }

    .pe-drawer-handle {
      display: flex;
      justify-content: flex-end;
      padding: 16px 16px 0;
      position: sticky;
      top: 0;
      background: var(--form-bg, var(--color-bg-card, #fff));
      z-index: 1;
    }
    .pe-drawer-close {
      width: 36px; height: 36px;
      background: var(--color-bg-app);
      border: none;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--color-text-muted);
      transition: all 0.2s;
    }
    .pe-drawer-close:hover { background: var(--color-border); color: var(--color-text-main); }

    .pe-drawer-content {
      padding: 8px 24px calc(32px + env(safe-area-inset-bottom));
    }

    .pe-form-title { margin:0 0 16px; font-size:20px; font-weight:800; font-family:var(--font-heading); color:var(--form-text, var(--color-text-main)); }

    .pe-form { display:flex; flex-direction:column; gap:16px; }

    .field { display:flex; flex-direction:column; gap:6px; }
    .field-label { font-size:13px; font-weight:600; color:var(--form-text, var(--color-text-main)); }
    .field-hint-error { font-size:12px; color:var(--color-error); }
    .form-error { color:var(--color-error); font-size:14px; text-align:center; padding:8px 12px; background:#FEF2F2; border-radius:10px; }
    .w-full { width:100%; }

    .checkbox-field { display:flex; align-items:center; gap:10px; cursor:pointer; padding:12px 16px; border:1px solid var(--color-border); border-radius:var(--radius-pill); font-size:14px; font-weight:500; transition:all 0.2s; color:var(--color-text-main); }
    .checkbox-field:hover { border-color:var(--color-brand); background:var(--color-brand-light); }
    .checkbox-field input[type="checkbox"] { width:18px; height:18px; cursor:pointer; accent-color:var(--color-brand); }

    /* ── Success overlay ── */
    .pe-success-overlay {
      position: fixed;
      inset: 0;
      overflow-y: auto;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(8px);
      z-index: 80;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
      box-sizing: border-box;
    }

    .pe-success-card {
      margin: auto;
      background: var(--form-bg, var(--color-bg-card, #fff));
      border-radius: var(--radius-lg, 24px);
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      box-shadow: 0 32px 64px rgba(0,0,0,0.3);
    }

    .pe-success-card lucide-icon { color: #22c55e; }
    .pe-success-card h2 { margin:0; font-size:24px; font-family:var(--font-heading); color:var(--form-text, var(--color-text-main)); }
    .pe-success-card p { margin:0; color:var(--color-text-muted); font-size:15px; line-height:1.5; }

    .ticket-box { background:var(--color-bg-app); border:2px dashed var(--color-border); border-radius:var(--radius-lg); padding:20px 28px; display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; box-sizing:border-box; }
    .ticket-qr { width:160px; height:160px; margin:4px 0; }
    .ticket-label { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--color-text-muted); }
    .ticket-code { font-family:monospace; font-size:28px; font-weight:800; color:var(--form-accent, var(--color-brand)); letter-spacing:.15em; }
    .ticket-hint { font-size:12px; color:var(--color-text-muted); }
    .ticket-email { font-size:13px; color:var(--color-text-muted); }
    .pe-success-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%; }
    .pe-success-actions .btn { justify-content:center; min-height:44px; font-size:14px; padding:10px 12px; }
    .pe-gcal { font-size:13px; color:var(--color-text-muted); }
    .pe-link { border:none; background:none; color:var(--color-text-muted); text-decoration:underline; font-size:13px; cursor:pointer; min-height:44px; }

    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    .animate-fade-in { animation: fadeIn 0.3s ease; }

    /* ── Embedded music ── */
    /* Logo de la empresa (HU26): arriba a la izquierda, el botón de música va a la derecha. */
    .pe-brand {
      position: fixed;
      top: calc(16px + env(safe-area-inset-top));
      left: 16px;
      z-index: 30;
      height: 44px;
      max-width: calc(100% - 96px);
      padding: 6px 14px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      background: rgba(255,255,255,0.92);
      border-radius: 9999px;
      box-shadow: 0 4px 16px rgba(15,23,42,0.18);
    }
    .pe-brand img { height: 100%; max-width: 160px; object-fit: contain; display: block; }

    .pe-music-btn {
      position: fixed;
      top: calc(16px + env(safe-area-inset-top));
      right: 16px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(8px);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 65;
      box-shadow: 0 6px 24px rgba(0,0,0,0.4);
      transition: transform 0.2s, background 0.2s;
    }
    .pe-music-btn:hover { transform: scale(1.06); }
    .pe-music-btn:active { transform: scale(0.96); }
    .pe-music-btn.playing {
      background: var(--color-brand, #e11d48);
      box-shadow: 0 0 0 0 rgba(225,29,72,0.5);
      animation: musicPulse 1.8s ease-out infinite;
    }
    @keyframes musicPulse {
      0% { box-shadow: 0 0 0 0 rgba(225,29,72,0.5); }
      70% { box-shadow: 0 0 0 16px rgba(225,29,72,0); }
      100% { box-shadow: 0 0 0 0 rgba(225,29,72,0); }
    }

    .pe-music-player {
      position: fixed;
      top: calc(76px + env(safe-area-inset-top));
      right: 16px;
      width: min(340px, calc(100vw - 32px));
      z-index: 64;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.45);
      animation: fadeIn 0.25s ease;
    }
    .pe-music-player iframe { width: 100%; border: none; display: block; }
    .pe-music-compact { top: calc(68px + env(safe-area-inset-top)); width: min(300px, calc(100vw - 32px)); border-radius: 12px; }
    .pe-music-compact iframe { height: 80px; max-height: 80px; }
    /* Plegado pero montado: el reproductor existe y puede sonar, sin ocupar pantalla. */
    .pe-music-collapsed { height: 0; opacity: 0; pointer-events: none; box-shadow: none; animation: none; }

    @media (max-width: 768px) {
      .pe-title { font-size: 22px; }
      .pe-hero { height: 220px; }
      .pe-fallback-info { padding: 20px 20px 100px; }
      .pe-drawer-content { padding: 8px 20px calc(28px + env(safe-area-inset-bottom)); }
      .pe-success-card { padding: 32px 24px; }
      .pe-cta-btn { padding: 16px 24px; font-size: 16px; }
      .pe-cta-bar { padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); }
    }

    @media (max-width: 480px) {
      .pe-title { font-size: 20px; }
      .pe-meta { gap: 8px; }
      .pe-meta-item { font-size: 12px; padding: 5px 10px; }
      .pe-drawer-close { width: 44px; height: 44px; }
      .checkbox-field { padding: 13px 16px; min-height: 44px; box-sizing: border-box; }
      .ticket-box { padding: 16px 20px; }
      .ticket-qr { width: 140px; height: 140px; }
      .ticket-code { font-size: 22px; }
      .pe-music-btn { top: calc(12px + env(safe-area-inset-top)); right: 12px; width: 40px; height: 40px; }
      .pe-brand { top: calc(12px + env(safe-area-inset-top)); left: 12px; height: 40px; }
      .pe-music-player { top: calc(60px + env(safe-area-inset-top)); right: 12px; }
      .pe-success-card { padding: 28px 20px; }
      .pe-success-actions { grid-template-columns: 1fr; }
      .pe-details-btn { top: calc(12px + env(safe-area-inset-top)); right: 12px; height: 40px; }
      .pe-details-btn.with-music { right: 60px; }
    }
  `],
})
export class PublicEventComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(ToastService);

  readonly Calendar = Calendar;
  readonly Clock = Clock;
  readonly Tag = Tag;
  readonly Users = Users;
  readonly CheckCircle = CheckCircle;
  readonly X = X;
  readonly ChevronUp = ChevronUp;
  readonly Play = Play;
  readonly Pause = Pause;
  readonly Music = Music;
  readonly MapPin = MapPin;
  readonly Download = Download;
  readonly Share2 = Share2;
  readonly Info = Info;
  readonly CalendarPlus = CalendarPlus;
  readonly ctaLabel = ctaLabel;

  readonly Infinity = Infinity;

  loading = signal(true);
  notFound = signal(false);
  loadError = signal(false);
  ev = signal<PublicEvent | null>(null);
  brand = signal<PublicBrand | null>(null);
  venue = signal<PublicVenue | null>(null);
  showDetails = signal(false);
  /** Volvió con una entrada guardada en este dispositivo. */
  returning = signal(false);
  /** Deja la pestaña (favicon y título) como estaba al salir. */
  private restoreTab: (() => void) | null = null;
  registrationsCount = signal(0);
  registered = signal(false);
  registration = signal<RegistrationResult | null>(null);
  submitting = signal(false);
  formError = signal('');
  showForm = signal(false);
  musicPlaying = signal(false);
  scale = signal(Math.min(window.innerWidth, 480) / 324);
  ticketQrDataUrl = signal('');

  private refCode: string | null = null;
  private customFieldValues: Record<string, string> = {};

  hasDesign = computed(() => !!this.ev()?.invitationDesign?.elements?.length);
  hasButtonEl = computed(() => !!this.ev()?.invitationDesign?.elements?.some(e => e.type === 'button'));
  customFields = computed(() => this.ev()?.formFields ?? []);

  private audioRef = viewChild<ElementRef<HTMLAudioElement>>('musicAudio');
  private spotifyHost = viewChild<ElementRef<HTMLElement>>('spotifyHost');
  private spotify: SpotifyController | null = null;
  /** Spotify recomienda esperar `ready` antes de ordenar play(). */
  private spotifyReady = false;
  /** El visitante pulsó play antes de que el reproductor de Spotify estuviera listo. */
  private spotifyPending = false;
  private spotifyStarted = false;
  spotifyOpen = signal(false);
  /** La API de Spotify no cargó: se usa el iframe como antes. */
  spotifyFailed = signal(false);

  musicAudioUrl = computed(() => this.ev()?.invitationDesign?.music?.audioUrl?.trim() ?? '');
  private musicSpotifyUri = computed(() => spotifyUri(this.ev()?.invitationDesign?.music?.embedCode ?? ''));
  /** Qué reproduce el botón (HU22): el audio subido manda sobre el embed. */
  musicMode = computed<'audio' | 'spotify' | 'embed' | 'none'>(() => {
    if (this.musicAudioUrl()) return 'audio';
    const embed = this.ev()?.invitationDesign?.music?.embedCode?.trim();
    if (!embed) return 'none';
    return this.musicSpotifyUri() && !this.spotifyFailed() ? 'spotify' : 'embed';
  });
  hasMusic = computed(() => this.musicMode() !== 'none');
  safeMusicHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      this.withAutoplay(this.ev()?.invitationDesign?.music?.embedCode ?? ''),
    ),
  );

  canvasBg = computed(() => {
    const bg = this.ev()?.invitationDesign?.background;
    if (!bg) return '#000';
    return bg.type === 'color' ? bg.color : '#000';
  });

  theme = computed<LandingTheme>(() => ({ ...DEFAULT_THEME, ...(this.ev()?.invitationDesign?.theme ?? {}) }));

  overlayBg = computed(() => {
    const ov = this.ev()?.invitationDesign?.background?.overlay;
    if (!ov) return 'transparent';
    return hexToRgba(ov.color, ov.opacity);
  });

  spotsLeft = computed(() => {
    const e = this.ev();
    if (!e || e.capacity === 0) return Infinity;
    return Math.max(0, e.capacity - this.registrationsCount());
  });

  paragraphs = computed(() =>
    (this.ev()?.description ?? '').split('\n').filter(p => p.trim()),
  );

  venueText = computed(() => {
    const v = this.venue();
    if (!v) return '';
    return v.address && v.address !== v.name ? `${v.name} · ${v.address}` : v.name;
  });
  mapsLink = computed(() => {
    const v = this.venue();
    return v ? mapsUrl(v.address ? `${v.name}, ${v.address}` : v.name) : '';
  });
  hasDetails = computed(() => !!this.venueText() || this.paragraphs().length > 0);
  googleCalUrl = computed(() => {
    const e = this.ev();
    return e ? googleCalendarUrl(this.calendarEvent(e)) : '';
  });

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    partySize: [1],
  });

  ngOnInit() {
    this.loadFonts();
    this.refCode = this.route.snapshot.queryParamMap.get('ref');
    this.loadEvent();
  }

  loadEvent() {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug && isCustomDomain()) {
      this.loadByHost();
      return;
    }
    this.fetchEvent(slug ?? '');
  }

  /** Dominio propio (HU25): el evento es el que tiene asignado este host. */
  private loadByHost() {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(false);
    this.http
      .get<{ slug: string }>(`${API}/public/landing-domains/resolve`, {
        params: { host: currentHost() },
      })
      .subscribe({
        next: (res) => this.fetchEvent(res.slug),
        error: (err) => {
          if (err?.status === 404) this.notFound.set(true);
          else this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  private fetchEvent(slug: string) {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(false);
    this.http
      .get<{ event: PublicEvent; registrationsCount: number; brand?: PublicBrand | null; venue?: PublicVenue | null }>(`${API}/public/events/${slug}`)
      .subscribe({
        next: (res) => {
          this.ev.set(res.event);
          this.brand.set(res.brand ?? null);
          this.venue.set(res.venue ?? null);
          this.restoreSavedTicket(res.event._id);
          this.restoreTab?.();
          this.restoreTab = applyTabBrand(document, {
            title: res.event.title,
            favicon: res.brand?.favicon,
            logo: res.brand?.logo,
          });
          this.registrationsCount.set(res.registrationsCount);
          this.loading.set(false);
          // Tras pintar la landing existe el contenedor del reproductor.
          if (this.musicMode() === 'spotify') setTimeout(() => this.initSpotify());
        },
        error: (err) => {
          // 404 = el evento no existe o no está publicado. Otro código (0/5xx) = servidor caído / sin conexión.
          if (err?.status === 404) this.notFound.set(true);
          else this.loadError.set(true);
          this.loading.set(false);
        },
      });
  }

  @HostListener('window:resize')
  updateScale() {
    this.scale.set(Math.min(window.innerWidth, 480) / 324);
  }

  private loadFonts() {
    if (document.querySelector('link[data-gf="designer"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@400;600;700&family=Montserrat:wght@400;600;700;800&family=Oswald:wght@400;600;700&family=Raleway:wght@400;600;700&family=Lato:wght@400;700&family=Bebas+Neue&family=Playfair+Display:wght@400;700&family=Dancing+Script:wght@400;700&family=Roboto+Condensed:wght@400;700&display=swap';
    link.setAttribute('data-gf', 'designer');
    document.head.appendChild(link);
  }

  getElStyle(el: DesignElement): Record<string, string> {
    const s = el.style;
    const bw = s.borderWidth || '0px';
    const isBtn = el.type === 'button';
    return {
      fontFamily: s.fontFamily || 'Poppins',
      fontSize: s.fontSize || (isBtn ? '16px' : '24px'),
      fontWeight: s.fontWeight || '700',
      fontStyle: s.fontStyle || 'normal',
      color: s.color || '#ffffff',
      textAlign: s.textAlign || 'center',
      letterSpacing: s.letterSpacing || '0',
      lineHeight: s.lineHeight || (isBtn ? '1' : '1.2'),
      textTransform: s.textTransform || 'none',
      textDecoration: s.textDecoration || 'none',
      wordSpacing: s.wordSpacing || '0px',
      textShadow: s.textShadow || 'none',
      padding: s.padding || (isBtn ? '14px 20px' : '8px'),
      background: s.background || (isBtn ? '#e11d48' : 'transparent'),
      borderRadius: s.borderRadius || (isBtn ? '9999px' : '0'),
      border: `${bw} ${s.borderStyle || 'solid'} ${bw !== '0px' ? (s.borderColor || 'transparent') : 'transparent'}`,
      boxSizing: 'border-box',
      width: '100%',
      display: 'block',
      ...(isBtn
        ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', outline: 'none' }
        : { whiteSpace: 'pre-wrap', wordWrap: 'break-word' }
      ),
    };
  }

  getCustomValue(id: string): string { return this.customFieldValues[id] ?? ''; }
  setCustomValue(id: string, value: string) { this.customFieldValues[id] = value; }

  async toggleMusic() {
    const mode = this.musicMode();
    if (mode === 'audio') {
      const audio = this.audioRef()?.nativeElement;
      if (!audio) return;
      if (!audio.paused) {
        audio.pause();
        this.musicPlaying.set(false);
        return;
      }
      try {
        await audio.play();
        this.musicPlaying.set(true);
      } catch {
        // El navegador rechazó la reproducción (o el archivo no carga).
        this.musicPlaying.set(false);
      }
      return;
    }
    if (mode === 'spotify') {
      this.spotifyOpen.set(true);
      if (this.spotify && this.spotifyReady) {
        this.spotify.togglePlay();
        return;
      }
      // Aún cargando: el segundo clic cancela la orden de reproducir.
      this.spotifyPending = !this.spotifyPending;
      this.musicPlaying.set(this.spotifyPending);
      this.initSpotify();
      return;
    }
    // Otros embeds: montar el iframe reproduce (autoplay), desmontarlo lo detiene.
    this.musicPlaying.update(v => !v);
  }

  /** Prepara el reproductor de Spotify (plegado) para que el clic solo tenga que dar play. */
  private initSpotify() {
    const uri = this.musicSpotifyUri();
    const host = this.spotifyHost()?.nativeElement;
    if (this.spotifyStarted || !uri || !host) return;
    this.spotifyStarted = true;
    loadSpotifyIframeApi()
      .then((api) =>
        api.createController(host, { uri, width: '100%', height: 80 }, (controller) => {
          this.spotify = controller;
          controller.addListener('playback_update', (e) => this.musicPlaying.set(!e.data.isPaused));
          controller.addListener('ready', () => {
            this.spotifyReady = true;
            if (this.spotifyPending) {
              this.spotifyPending = false;
              controller.play();
            }
          });
        }),
      )
      .catch(() => {
        // Sin la API se vuelve al iframe de siempre: si ya pulsó play, se monta.
        this.spotifyFailed.set(true);
        this.musicPlaying.set(this.spotifyPending);
        this.spotifyPending = false;
      });
  }

  ngOnDestroy() {
    this.restoreTab?.();
    this.spotify?.destroy();
    this.audioRef()?.nativeElement.pause();
  }

  /** Inyecta autoplay en el src del embed para que el play del usuario inicie la reproducción. */
  private withAutoplay(code: string): string {
    return code.replace(/src=("|')([^"']+)\1/i, (_m, q, url) => {
      let u = url;
      const add = (param: string) => { u += (u.includes('?') ? '&' : '?') + param; };
      if (/youtube\.com|youtu\.be/i.test(u)) add('autoplay=1');
      else if (/soundcloud\.com/i.test(u)) add('auto_play=true');
      else if (/spotify\.com/i.test(u)) add('autoplay=1');
      return `src=${q}${u}${q}`;
    });
  }

  private async generateTicketQr(ticketCode: string): Promise<void> {
    try {
      const QRCode = await import('qrcode');
      this.ticketQrDataUrl.set(await QRCode.default.toDataURL(ticketCode, { width: 200, margin: 1 }));
    } catch {
      this.ticketQrDataUrl.set('');
    }
  }

  submitRegistration() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const missingRequired = (this.ev()?.formFields ?? []).filter(
      f => f.required && !this.customFieldValues[f.id]?.trim()
    );
    if (missingRequired.length) {
      this.formError.set(`Por favor completa: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    this.submitting.set(true);
    this.formError.set('');
    const eventId = this.ev()?._id ?? '';
    const body = {
      ...this.form.value,
      customFields: { ...this.customFieldValues },
      ...(this.refCode ? { ref: this.refCode } : {}),
    };
    this.http
      .post<RegistrationResult>(`${API}/public/events/${eventId}/register`, body)
      .subscribe({
        next: (res) => {
          this.registration.set(res);
          this.registered.set(true);
          this.returning.set(false);
          this.showForm.set(false);
          this.submitting.set(false);
          saveTicket(eventId, { ticketCode: res.ticketCode, name: res.name, email: res.email });
          void this.generateTicketQr(res.ticketCode);
        },
        error: (err) => {
          this.formError.set(err.error?.message || 'Error al registrarse');
          this.submitting.set(false);
        },
      });
  }

  // ── HU33: formulario, detalles y entrada ─────────────────────────────────

  /** Abre el formulario y pone el foco en el nombre (sin abrir el teclado al cargar). */
  openForm() {
    this.showForm.set(true);
    setTimeout(() => (document.getElementById('pe-name') as HTMLInputElement | null)?.focus(), 350);
  }

  openDetails() { this.showDetails.set(true); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.showForm()) this.showForm.set(false);
    else if (this.showDetails()) this.showDetails.set(false);
  }

  /** Mantiene el foco dentro de la hoja abierta. */
  trapFocus(e: KeyboardEvent, container: HTMLElement) {
    if (e.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  private restoreSavedTicket(eventId: string) {
    const t = loadTicket(eventId);
    if (!t) return;
    this.registration.set({ _id: '', name: t.name, email: t.email, ticketCode: t.ticketCode, partySize: 1 });
    this.registered.set(true);
    this.returning.set(true);
    void this.generateTicketQr(t.ticketCode);
  }

  registerAnother() {
    const id = this.ev()?._id;
    if (id) forgetTicket(id);
    this.registered.set(false);
    this.returning.set(false);
    this.registration.set(null);
    this.ticketQrDataUrl.set('');
    this.customFieldValues = {};
    this.form.reset({ name: '', email: '', phone: '', partySize: 1 });
    this.openForm();
  }

  private pageUrl(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  private calendarEvent(e: PublicEvent) {
    const v = this.venue();
    return {
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      description: e.description,
      location: v ? (v.address ? `${v.name}, ${v.address}` : v.name) : undefined,
      url: this.pageUrl(),
    };
  }

  addToCalendar() {
    const e = this.ev();
    if (!e) return;
    const ics = buildIcs(this.calendarEvent(e), `${e._id}@maya`);
    this.download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${e.slug || 'evento'}.ics`);
  }

  /** Imagen de la entrada (QR, nombre y evento) para guardarla en la galería. */
  async saveTicketImage() {
    const e = this.ev();
    const reg = this.registration();
    if (!e || !reg) return;
    try {
      const QRCode = await import('qrcode');
      const qr = await QRCode.default.toDataURL(reg.ticketCode, { width: 420, margin: 1 });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = qr;
      });
      const c = document.createElement('canvas');
      c.width = 600; c.height = 860;
      const g = c.getContext('2d');
      if (!g) throw new Error('canvas');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#111827'; g.textAlign = 'center';
      g.font = 'bold 34px Poppins, sans-serif'; g.fillText(e.title.slice(0, 32), 300, 70);
      g.font = '22px Inter, sans-serif'; g.fillStyle = '#6B7280';
      g.fillText(`${this.formatDate(e.date)}${e.startTime ? ' · ' + e.startTime : ''}`, 300, 110);
      g.drawImage(img, 90, 150, 420, 420);
      g.fillStyle = '#111827'; g.font = 'bold 28px Inter, sans-serif'; g.fillText(reg.name.slice(0, 36), 300, 630);
      g.font = 'bold 40px monospace'; g.fillStyle = '#E11D48'; g.fillText(reg.ticketCode, 300, 700);
      g.font = '20px Inter, sans-serif'; g.fillStyle = '#6B7280';
      g.fillText('Presenta este QR en la entrada', 300, 760);
      if (this.venueText()) g.fillText(this.venueText().slice(0, 48), 300, 800);
      c.toBlob(b => b && this.download(b, `entrada-${reg.ticketCode}.png`), 'image/png');
    } catch {
      this.toast.error('No se pudo generar la imagen de la entrada');
    }
  }

  /** Invita con el mismo `?ref=` con el que llegó el invitado (el impulsador sigue sumando). */
  async inviteFriend() {
    const e = this.ev();
    if (!e) return;
    const url = this.refCode ? `${this.pageUrl()}?ref=${encodeURIComponent(this.refCode)}` : this.pageUrl();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: e.title, text: `Te invito a ${e.title}`, url });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Link copiado: compártelo con tus amigos');
    } catch {
      this.toast.error('No se pudo copiar el link');
    }
  }

  private download(blob: Blob, filename: string) {
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  formatDate(dateStr: string): string {
    // Parsear la parte YYYY-MM-DD como fecha local para evitar el desfase UTC (-1 día en Perú).
    const parts = (dateStr ?? '').slice(0, 10).split('-');
    const d = parts.length === 3
      ? new Date(+parts[0], +parts[1] - 1, +parts[2])
      : new Date(dateStr);
    return d.toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}
