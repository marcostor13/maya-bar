import { Component, OnInit, OnDestroy, DestroyRef, effect, inject, signal, computed, ElementRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule, MessagesSquare, Send, Paperclip, Image as ImageIcon, Video, FileText,
  Mic, Square, Bot, Search, Check, CheckCheck, Clock, AlertCircle, X, Trash2, ArrowLeft,
  Download, MapPin, Instagram, RefreshCw, Smile, UserRound, Phone, PhoneForwarded,
  UserPlus, ContactRound, Target, MoreVertical, Tag, CheckCheck as ReadIcon,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AppChromeService } from '../../shared/app-chrome';
import { ConversationsRealtimeService } from '../../shared/conversations-realtime';
import { PushService } from '../../shared/push.service';
import { silentRequest } from '../../shared/loader';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

/** Etapas del embudo, para nombrar las oportunidades del contacto en el chat. */
const LEAD_STAGE_LABELS: Record<string, string> = {
  new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado',
  proposal: 'Propuesta', negotiation: 'Negociación', won: 'Ganado', lost: 'Perdido',
};

/** Etapas en las que tiene sentido dar de alta algo desde un chat: las
 *  cerradas (ganado/perdido) no se eligen al crear. */
const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'] as const;

/** Sugerencias de partida cuando el tenant todavía no tiene etiquetas propias. */
const SUGGESTED_TAGS = ['Interesado', 'Cotización', 'Reserva', 'VIP', 'Frecuente', 'No interesado'];

type MsgType =
  | 'text' | 'image' | 'video' | 'audio' | 'voice'
  | 'document' | 'sticker' | 'location' | 'contact' | 'unsupported';
type MsgStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

interface Msg {
  _id: string;
  conversationId: string;
  direction: 'in' | 'out';
  author: 'customer' | 'agent' | 'human' | 'system';
  type: MsgType;
  text: string;
  mediaUrl?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  status: MsgStatus;
  error?: string;
  at: string;
}

interface Conv {
  _id: string;
  channel: 'whatsapp' | 'instagram';
  accountId: string;
  contact: string;
  contactName?: string;
  chatId?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: 'in' | 'out';
  unreadCount: number;
  autoReply: boolean;
  status: 'open' | 'closed';
  customerId?: string;
  escalated?: boolean;
  escalatedAt?: string;
  escalationReason?: string;
  escalationNotifiedTo?: string[];
  /** Etiquetas del contacto vinculado; las adjunta el backend al listar. */
  tags?: string[];
}

/** Cuenta conectada (WhatsApp o Instagram) por la que entran las conversaciones. */
interface InboxAccount {
  _id: string;
  channel: 'whatsapp' | 'instagram';
  label: string;
  detail: string;
  active: boolean;
  isDefault: boolean;
  /** Conversaciones de esta cuenta, para que el selector sea informativo. */
  total: number;
  unread: number;
}

type Filter = 'all' | 'unread' | 'auto' | 'manual';

const EMOJIS = [
  '😀', '😂', '🥰', '😍', '😊', '👍', '🙏', '👏', '🔥', '🎉',
  '❤️', '💜', '✅', '❌', '⏰', '📍', '📞', '🍻', '🍽️', '🥳',
];

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="inbox" [class.thread-open]="selectedId()">

      <!-- ══ Lista de chats ══ -->
      <aside class="chat-list">
        <div class="list-head">
          <div class="list-title">
            <h1>Conversaciones</h1>
            <button class="btn-icon btn-ghost" (click)="reload()" title="Actualizar" aria-label="Actualizar">
              <lucide-icon [img]="RefreshCw" [size]="18" [strokeWidth]="2.2"></lucide-icon>
            </button>
          </div>
          <div class="search-wrap">
            <lucide-icon class="search-icon" [img]="Search" [size]="17" [strokeWidth]="2.2"></lucide-icon>
            <input
              class="input search-input"
              type="search"
              placeholder="Buscar por nombre o número"
              [ngModel]="search()"
              (ngModelChange)="onSearch($event)"
              aria-label="Buscar conversaciones"
            />
          </div>
          @if (accounts().length > 0) {
            @if (hasBothChannels()) {
              <div class="channel-tabs" role="group" aria-label="Canal">
                @for (c of channelTabs(); track c.key) {
                  <button
                    class="channel-tab"
                    [class.active]="channel() === c.key"
                    (click)="setChannel(c.key)"
                    [title]="c.total + ' conversación(es)'"
                  >
                    {{ c.label }}
                    @if (c.unread > 0) {
                      <span class="tab-badge">{{ c.unread }}</span>
                    }
                  </button>
                }
              </div>
            }

            <select
              class="select account-select"
              [ngModel]="accountId()"
              (ngModelChange)="setAccount($event)"
              aria-label="Cuenta"
            >
              <option value="">
                Todas las cuentas{{ channelLabel() }} ({{ totalForChannel() }})
              </option>
              @for (g of accountGroups(); track g.channel) {
                <optgroup [label]="g.label">
                  @for (a of g.accounts; track a._id) {
                    <option [value]="a._id">
                      {{ a.label }}{{ a.detail ? ' · ' + a.detail : '' }}
                      ({{ a.total }}{{ a.unread ? ', ' + a.unread + ' sin leer' : '' }}){{ a.active ? '' : ' — inactiva' }}
                    </option>
                  }
                </optgroup>
              }
            </select>
          }
          <div class="filters">
            @for (f of filters; track f.key) {
              <button
                class="chip"
                [class.active]="filter() === f.key"
                (click)="setFilter(f.key)"
              >{{ f.label }}</button>
            }
          </div>
        </div>

        <div class="list-scroll">
          @if (loadingList()) {
            <div class="list-empty">Cargando conversaciones…</div>
          } @else if (visibleConversations().length === 0) {
            <div class="list-empty">
              <lucide-icon [img]="MessagesSquare" [size]="32" [strokeWidth]="1.6"></lucide-icon>
              <p>No hay conversaciones todavía.</p>
              <span>Cuando alguien escriba a tu WhatsApp aparecerá aquí.</span>
            </div>
          } @else {
            @for (c of visibleConversations(); track c._id) {
              <button
                class="chat-item"
                [class.active]="selectedId() === c._id"
                (click)="openConversation(c)"
              >
                <div class="avatar" [attr.data-channel]="c.channel">
                  {{ initials(c) }}
                  <span class="channel-dot">
                    @if (c.channel === 'instagram') {
                      <lucide-icon [img]="Instagram" [size]="10" [strokeWidth]="2.6"></lucide-icon>
                    } @else {
                      <lucide-icon [img]="Phone" [size]="10" [strokeWidth]="2.6"></lucide-icon>
                    }
                  </span>
                </div>
                <div class="chat-item-body">
                  <div class="chat-item-top">
                    <span class="chat-name">{{ displayName(c) }}</span>
                    <span class="chat-time">{{ shortTime(c.lastMessageAt) }}</span>
                  </div>
                  @if (accounts().length > 1 && accountName(c)) {
                    <span class="chat-account">{{ accountName(c) }}</span>
                  }
                  <div class="chat-item-bottom">
                    <span class="chat-preview">
                      @if (c.lastMessageDirection === 'out') { <span class="you">Tú:</span> }
                      {{ c.lastMessagePreview || 'Sin mensajes' }}
                    </span>
                    @if (c.unreadCount > 0) {
                      <span class="unread">{{ c.unreadCount > 99 ? '99+' : c.unreadCount }}</span>
                    }
                  </div>
                  <div class="chat-item-tags">
                    @if (c.autoReply) {
                      <span class="tag tag-ai">
                        <lucide-icon [img]="Bot" [size]="11" [strokeWidth]="2.4"></lucide-icon> Agente IA
                      </span>
                    } @else {
                      <span class="tag tag-manual">
                        <lucide-icon [img]="UserRound" [size]="11" [strokeWidth]="2.4"></lucide-icon> Manual
                      </span>
                    }
                    @if (c.escalated) {
                      <span class="tag tag-handoff">
                        <lucide-icon [img]="PhoneForwarded" [size]="11" [strokeWidth]="2.4"></lucide-icon> Derivado
                      </span>
                    }
                    @if (c.status === 'closed') { <span class="tag tag-closed">Cerrado</span> }
                    @for (t of (c.tags ?? []).slice(0, 2); track t) {
                      <span class="tag tag-crm">{{ t }}</span>
                    }
                    @if ((c.tags?.length ?? 0) > 2) {
                      <span class="tag tag-crm">+{{ c.tags!.length - 2 }}</span>
                    }
                  </div>
                </div>
              </button>
            }
          }
        </div>
      </aside>

      <!-- ══ Hilo ══ -->
      <section class="thread">
        @if (!selected()) {
          <div class="thread-empty">
            <lucide-icon [img]="MessagesSquare" [size]="44" [strokeWidth]="1.4"></lucide-icon>
            <h2>Tu bandeja de entrada</h2>
            <p>Elige una conversación para leerla y responder. Por defecto contesta tu agente IA; puedes tomar el control cuando quieras.</p>
          </div>
        } @else {
          <header class="thread-head">
            <button class="btn-icon btn-ghost back-btn" (click)="closeThread()" aria-label="Volver">
              <lucide-icon [img]="ArrowLeft" [size]="20" [strokeWidth]="2.2"></lucide-icon>
            </button>
            <div class="avatar" [attr.data-channel]="selected()!.channel">{{ initials(selected()!) }}</div>
            <div class="thread-who">
              <span class="thread-name">{{ displayName(selected()!) }}</span>
              <span class="thread-sub">
                {{ selected()!.channel === 'instagram' ? 'Instagram DM' : '+' + selected()!.contact }}
                @if (accountName(selected()!)) { <span class="thread-account">· vía {{ accountName(selected()!) }}</span> }
                @if (typing()) { <em class="typing">· el agente está escribiendo…</em> }
              </span>
            </div>

            <div class="thread-actions">
              <label class="ai-switch" [class.on]="selected()!.autoReply" [title]="selected()!.autoReply ? 'El agente IA responde automáticamente' : 'Respondes tú manualmente'">
                <input
                  type="checkbox"
                  [checked]="selected()!.autoReply"
                  (change)="toggleAutoReply($event)"
                  aria-label="Respuesta automática del agente"
                />
                <span class="ai-track"><span class="ai-knob"></span></span>
                <span class="ai-label">
                  <lucide-icon [img]="selected()!.autoReply ? Bot : UserRound" [size]="14" [strokeWidth]="2.4"></lucide-icon>
                  {{ selected()!.autoReply ? 'Agente IA' : 'Manual' }}
                </span>
              </label>
              <button class="btn btn-sm btn-secondary" (click)="openClassify()" title="Clasificar y enviar a seguimiento">
                <lucide-icon [img]="Tag" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                <span>Clasificar</span>
              </button>
              @if (selected()!.customerId) {
                <button class="saved-chip" (click)="openContactModal()" title="Ver y editar el contacto guardado">
                  <lucide-icon [img]="ContactRound" [size]="13" [strokeWidth]="2.5"></lucide-icon>
                  Contacto guardado
                </button>
              } @else {
                <button class="btn btn-sm btn-secondary" (click)="openContactModal()">
                  <lucide-icon [img]="UserPlus" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                  Guardar contacto
                </button>
              }
              <button class="btn-icon btn-ghost" (click)="toggleStatus()" [title]="selected()!.status === 'closed' ? 'Reabrir chat' : 'Cerrar chat'" aria-label="Cambiar estado">
                <lucide-icon [img]="selected()!.status === 'closed' ? RefreshCw : Check" [size]="18" [strokeWidth]="2.2"></lucide-icon>
              </button>
              <button class="btn-icon btn-ghost danger" (click)="deleteConversation()" title="Eliminar conversación" aria-label="Eliminar">
                <lucide-icon [img]="Trash2" [size]="18" [strokeWidth]="2.2"></lucide-icon>
              </button>
            </div>

            <!-- En el móvil no caben cinco controles: van a una hoja de acciones. -->
            <button class="btn-icon btn-ghost thread-more" (click)="threadMenu.set(true)" aria-label="Acciones del chat">
              <lucide-icon [img]="MoreVertical" [size]="20" [strokeWidth]="2.2"></lucide-icon>
            </button>
          </header>

          @if (threadMenu()) {
            <div class="overlay sheet-overlay" (click)="threadMenu.set(false)">
              <div class="bottom-sheet" (click)="$event.stopPropagation()">
                <div class="sheet-grip" aria-hidden="true"></div>
                <span class="sheet-title">{{ displayName(selected()!) }}</span>

                <label class="sheet-row" [class.on]="selected()!.autoReply">
                  <span class="sheet-row-icon">
                    <lucide-icon [img]="selected()!.autoReply ? Bot : UserRound" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                  </span>
                  <span class="sheet-row-text">
                    {{ selected()!.autoReply ? 'Responde el agente IA' : 'Respondes tú' }}
                    <small>{{ selected()!.autoReply ? 'Tócalo para tomar el control' : 'Tócalo para devolvérselo al agente' }}</small>
                  </span>
                  <input
                    type="checkbox"
                    [checked]="selected()!.autoReply"
                    (change)="toggleAutoReply($event)"
                    aria-label="Respuesta automática del agente"
                  />
                  <span class="ai-track"><span class="ai-knob"></span></span>
                </label>

                <button class="sheet-row" (click)="threadMenu.set(false); openClassify()">
                  <span class="sheet-row-icon">
                    <lucide-icon [img]="Tag" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                  </span>
                  <span class="sheet-row-text">
                    Clasificar
                    <small>Etiquetas y envío a seguimiento</small>
                  </span>
                </button>

                <button class="sheet-row" (click)="threadMenu.set(false); openContactModal()">
                  <span class="sheet-row-icon">
                    <lucide-icon [img]="selected()!.customerId ? ContactRound : UserPlus" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                  </span>
                  <span class="sheet-row-text">{{ selected()!.customerId ? 'Ver contacto guardado' : 'Guardar contacto' }}</span>
                </button>

                <button class="sheet-row" (click)="threadMenu.set(false); toggleStatus()">
                  <span class="sheet-row-icon">
                    <lucide-icon [img]="selected()!.status === 'closed' ? RefreshCw : Check" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                  </span>
                  <span class="sheet-row-text">{{ selected()!.status === 'closed' ? 'Reabrir conversación' : 'Cerrar conversación' }}</span>
                </button>

                <button class="sheet-row danger" (click)="threadMenu.set(false); deleteConversation()">
                  <span class="sheet-row-icon">
                    <lucide-icon [img]="Trash2" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                  </span>
                  <span class="sheet-row-text">Eliminar conversación</span>
                </button>
              </div>
            </div>
          }

          @if (selected()!.escalated) {
            <div class="handoff-banner">
              <lucide-icon [img]="PhoneForwarded" [size]="14" [strokeWidth]="2.4"></lucide-icon>
              <span>
                El agente IA derivó este chat a una persona{{ selected()!.escalationReason ? ': ' + selected()!.escalationReason : '' }}.
                @if (selected()!.escalationNotifiedTo?.length) {
                  Se avisó por WhatsApp a {{ notifiedList(selected()!) }}.
                } @else {
                  No se pudo avisar por WhatsApp a nadie.
                }
                Continúa tú la conversación; al reactivar el agente se cierra la derivación.
              </span>
            </div>
          } @else if (!selected()!.autoReply) {
            <div class="manual-banner">
              <lucide-icon [img]="UserRound" [size]="14" [strokeWidth]="2.4"></lucide-icon>
              Estás respondiendo manualmente. El agente IA no contestará este chat hasta que lo reactives.
            </div>
          }

          <div class="messages" #scroller (scroll)="onScroll()">
            @if (loadingOlder()) { <div class="older-hint">Cargando mensajes anteriores…</div> }
            @if (loadingMessages()) {
              <div class="older-hint">Cargando conversación…</div>
            }
            @for (group of groupedMessages(); track group.day) {
              <div class="day-sep"><span>{{ group.day }}</span></div>
              @for (m of group.items; track m._id) {
                @if (m.author === 'system') {
                  <div class="system-note">
                    <lucide-icon [img]="PhoneForwarded" [size]="13" [strokeWidth]="2.4"></lucide-icon>
                    <span>{{ m.text }}</span>
                  </div>
                } @else {
                <div class="row" [class.out]="m.direction === 'out'">
                  <div class="bubble" [attr.data-author]="m.author" [class.failed]="m.status === 'failed'">
                    @if (m.author === 'agent') {
                      <span class="by-agent"><lucide-icon [img]="Bot" [size]="11" [strokeWidth]="2.4"></lucide-icon> Agente IA</span>
                    }

                    @switch (m.type) {
                      @case ('image') {
                        <img class="media-img" [src]="m.mediaUrl" alt="Imagen recibida" loading="lazy" (click)="lightbox.set(m.mediaUrl ?? null)" />
                      }
                      @case ('sticker') {
                        <img class="media-sticker" [src]="m.mediaUrl" alt="Sticker" loading="lazy" />
                      }
                      @case ('video') {
                        <video class="media-video" [src]="m.mediaUrl" controls preload="metadata"></video>
                      }
                      @case ('voice') {
                        <div class="media-audio voice">
                          <lucide-icon [img]="Mic" [size]="16" [strokeWidth]="2.4"></lucide-icon>
                          <audio [src]="m.mediaUrl" controls preload="metadata"></audio>
                        </div>
                      }
                      @case ('audio') {
                        <div class="media-audio">
                          <audio [src]="m.mediaUrl" controls preload="metadata"></audio>
                        </div>
                      }
                      @case ('document') {
                        <a class="media-doc" [href]="m.mediaUrl" target="_blank" rel="noopener">
                          <span class="doc-icon"><lucide-icon [img]="FileText" [size]="18" [strokeWidth]="2.2"></lucide-icon></span>
                          <span class="doc-meta">
                            <strong>{{ m.filename || 'Documento' }}</strong>
                            <small>{{ formatSize(m.size) }}</small>
                          </span>
                          <lucide-icon [img]="Download" [size]="16" [strokeWidth]="2.2"></lucide-icon>
                        </a>
                      }
                      @case ('location') {
                        <a class="media-loc" [href]="mapsUrl(m)" target="_blank" rel="noopener">
                          <lucide-icon [img]="MapPin" [size]="16" [strokeWidth]="2.4"></lucide-icon>
                          <span>{{ m.locationName || 'Ubicación compartida' }}</span>
                        </a>
                      }
                      @case ('unsupported') {
                        <em class="unsupported">Mensaje no soportado por el canal</em>
                      }
                    }

                    @if (m.text && m.type !== 'location') {
                      <p class="bubble-text">{{ m.text }}</p>
                    }

                    <span class="meta">
                      {{ shortTime(m.at) }}
                      @if (m.direction === 'out') {
                        @switch (m.status) {
                          @case ('pending') { <lucide-icon [img]="Clock" [size]="12" [strokeWidth]="2.4"></lucide-icon> }
                          @case ('sent')    { <lucide-icon [img]="Check" [size]="13" [strokeWidth]="2.6"></lucide-icon> }
                          @case ('delivered') { <lucide-icon [img]="CheckCheck" [size]="13" [strokeWidth]="2.6"></lucide-icon> }
                          @case ('read')    { <lucide-icon class="read" [img]="ReadIcon" [size]="13" [strokeWidth]="2.6"></lucide-icon> }
                          @case ('failed')  { <lucide-icon class="err" [img]="AlertCircle" [size]="13" [strokeWidth]="2.4"></lucide-icon> }
                        }
                      }
                    </span>
                    @if (m.status === 'failed' && m.error) {
                      <span class="err-text">No se pudo enviar</span>
                    }
                  </div>
                </div>
                }
              }
            }
          </div>

          <!-- ══ Composer ══ -->
          <footer class="composer">
            @if (attachment(); as att) {
              <div class="attach-preview">
                @if (att.type === 'image') {
                  <img [src]="att.url" alt="Adjunto" />
                } @else {
                  <span class="attach-icon"><lucide-icon [img]="attachIcon(att.type)" [size]="18" [strokeWidth]="2.2"></lucide-icon></span>
                }
                <span class="attach-name">{{ att.filename }}</span>
                <button class="btn-icon btn-ghost" (click)="clearAttachment()" aria-label="Quitar adjunto">
                  <lucide-icon [img]="X" [size]="16" [strokeWidth]="2.4"></lucide-icon>
                </button>
              </div>
            }

            @if (recording()) {
              <div class="recording-bar">
                <span class="rec-dot"></span>
                Grabando nota de voz · {{ formatSeconds(recordingSeconds()) }}
                <button class="btn btn-sm btn-secondary" (click)="cancelRecording()">Cancelar</button>
                <button class="btn btn-sm btn-primary" (click)="stopRecording()">
                  <lucide-icon [img]="Square" [size]="14" [strokeWidth]="2.4"></lucide-icon> Enviar
                </button>
              </div>
            }

            @if (emojiOpen()) {
              <div class="emoji-pop">
                @for (e of emojis; track e) {
                  <button type="button" class="emoji" (click)="addEmoji(e)">{{ e }}</button>
                }
              </div>
            }

            <div class="composer-row">
              <div class="attach-wrap">
                <button class="btn-icon btn-ghost" (click)="attachOpen.set(!attachOpen())" title="Adjuntar" aria-label="Adjuntar archivo">
                  <lucide-icon [img]="Paperclip" [size]="20" [strokeWidth]="2.2"></lucide-icon>
                </button>
                @if (attachOpen()) {
                  <div class="attach-menu">
                    <button (click)="pick('media')">
                      <lucide-icon [img]="ImageIcon" [size]="16" [strokeWidth]="2.2"></lucide-icon> Foto o video
                    </button>
                    <button (click)="pick('doc')">
                      <lucide-icon [img]="FileText" [size]="16" [strokeWidth]="2.2"></lucide-icon> Documento
                    </button>
                    <button (click)="pick('audio')">
                      <lucide-icon [img]="Video" [size]="16" [strokeWidth]="2.2"></lucide-icon> Audio
                    </button>
                  </div>
                }
              </div>

              <button class="btn-icon btn-ghost emoji-btn" (click)="emojiOpen.set(!emojiOpen())" title="Emojis" aria-label="Emojis">
                <lucide-icon [img]="Smile" [size]="20" [strokeWidth]="2.2"></lucide-icon>
              </button>

              <textarea
                class="textarea composer-input"
                rows="1"
                placeholder="Escribe un mensaje…"
                [ngModel]="draft()"
                (ngModelChange)="draft.set($event)"
                (keydown)="onKeydown($event)"
                aria-label="Mensaje"
              ></textarea>

              @if (draft().trim() || attachment()) {
                <button class="btn-icon send" (click)="send()" [disabled]="sending() || uploading()" aria-label="Enviar">
                  <lucide-icon [img]="Send" [size]="19" [strokeWidth]="2.4"></lucide-icon>
                </button>
              } @else {
                <button class="btn-icon send" (click)="startRecording()" [disabled]="recording()" title="Grabar nota de voz" aria-label="Grabar nota de voz">
                  <lucide-icon [img]="Mic" [size]="19" [strokeWidth]="2.4"></lucide-icon>
                </button>
              }
            </div>

            @if (uploading()) { <div class="upload-hint">Subiendo archivo…</div> }

            <input #mediaInput type="file" hidden accept="image/*,video/*" (change)="onFile($event)" />
            <input #docInput type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" (change)="onFile($event)" />
            <input #audioInput type="file" hidden accept="audio/*" (change)="onFile($event)" />
          </footer>
        }
      </section>
    </div>

    <!-- ══ Clasificar: etiquetas y envío al embudo ══ -->
    @if (classifyOpen()) {
      <div class="overlay sheet-overlay" (click)="closeClassify()" role="dialog" aria-modal="true">
        <div class="bottom-sheet classify-sheet" (click)="$event.stopPropagation()">
          <div class="sheet-grip" aria-hidden="true"></div>
          <span class="sheet-title">Clasificar a {{ displayName(selected()!) }}</span>

          <div class="cls-body">
            <span class="cls-label">Etiquetas</span>
            <div class="cls-tags">
              @for (t of tagOptions(); track t) {
                <button
                  class="cls-tag"
                  [class.on]="draftTags().includes(t)"
                  (click)="toggleTag(t)"
                >
                  @if (draftTags().includes(t)) {
                    <lucide-icon [img]="Check" [size]="13" [strokeWidth]="3"></lucide-icon>
                  }
                  {{ t }}
                </button>
              }
              @if (tagOptions().length === 0) {
                <span class="cls-empty">Escribe la primera etiqueta abajo.</span>
              }
            </div>
            <div class="cls-new">
              <input
                class="input"
                [(ngModel)]="newTag"
                placeholder="Nueva etiqueta"
                maxlength="40"
                (keydown.enter)="addTag()"
                aria-label="Nueva etiqueta"
              />
              <button class="btn btn-sm btn-secondary" [disabled]="!newTag.trim()" (click)="addTag()">
                Añadir
              </button>
            </div>

            <span class="cls-label">Seguimiento</span>
            @if (openLead(); as lead) {
              <div class="cls-lead">
                <div class="cls-lead-info">
                  <strong>{{ lead.title }}</strong>
                  <span class="cls-lead-stage">{{ stageLabel(lead.stage) }}</span>
                </div>
                <button class="btn btn-sm btn-ghost" (click)="goToLeads()">
                  <lucide-icon [img]="Target" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                  Ver
                </button>
              </div>
            } @else {
              <p class="cls-hint">Crea la oportunidad enlazada a este chat para no perderle el rastro.</p>
              <div class="cls-stage">
                <select class="select" [(ngModel)]="pipelineStage" aria-label="Etapa del embudo">
                  @for (st of stages; track st) {
                    <option [value]="st">{{ stageLabel(st) }}</option>
                  }
                </select>
                <button class="btn btn-primary" [disabled]="savingClassify()" (click)="sendToPipeline()">
                  <lucide-icon [img]="Target" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                  Enviar a seguimiento
                </button>
              </div>
            }
          </div>

          <div class="cls-actions">
            <button class="btn btn-secondary" (click)="closeClassify()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="savingClassify()" (click)="saveTags()">
              {{ savingClassify() ? 'Guardando…' : 'Guardar etiquetas' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (lightbox(); as url) {
      <div class="overlay" (click)="lightbox.set(null)">
        <img class="lightbox-img" [src]="url" alt="Imagen ampliada" (click)="$event.stopPropagation()" />
      </div>
    }

    <!-- ══ Guardar contacto en el CRM ══ -->
    @if (contactModal()) {
      <div class="overlay" (click)="closeContactModal()" role="dialog" aria-modal="true">
        <div class="contact-modal card" (click)="$event.stopPropagation()">
          <div class="cm-head">
            <div>
              <h2>{{ selected()?.customerId ? 'Contacto guardado' : 'Guardar contacto' }}</h2>
              <p class="cm-sub">Se guarda en Clientes y queda vinculado a esta conversación.</p>
            </div>
            <button class="btn-icon btn-ghost" (click)="closeContactModal()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          <div class="cm-body">
            <div class="cm-field">
              <label class="cm-label">Nombre *</label>
              <input class="input" [(ngModel)]="contactForm.name" placeholder="Nombre del cliente" />
            </div>
            <div class="cm-row">
              <div class="cm-field">
                <label class="cm-label">Teléfono</label>
                <input class="input" [(ngModel)]="contactForm.phone" placeholder="51999888777" />
              </div>
              <div class="cm-field">
                <label class="cm-label">Email</label>
                <input class="input" [(ngModel)]="contactForm.email" placeholder="cliente@correo.com" />
              </div>
            </div>
            <div class="cm-field">
              <label class="cm-label">Etiquetas</label>
              <input class="input" [(ngModel)]="contactForm.tags" placeholder="VIP, corporativo (separadas por comas)" />
            </div>
            <div class="cm-field">
              <label class="cm-label">Notas</label>
              <textarea class="textarea" [(ngModel)]="contactForm.notes" rows="2" placeholder="Lo que convenga recordar de este cliente…"></textarea>
            </div>

            @if (!selected()?.customerId) {
              <label class="cm-check">
                <input type="checkbox" [(ngModel)]="contactForm.createLead" />
                <span>
                  <strong>Crear oportunidad de seguimiento</strong>
                  <small>Aparece en el embudo para no perderle el rastro.</small>
                </span>
              </label>
              @if (contactForm.createLead) {
                <div class="cm-field">
                  <label class="cm-label">Título de la oportunidad</label>
                  <input class="input" [(ngModel)]="contactForm.leadTitle" placeholder="Seguimiento del cliente" />
                </div>
              }
            }

            @if (crmLeads().length > 0) {
              <div class="cm-leads">
                <span class="cm-label">Oportunidades de este cliente</span>
                @for (l of crmLeads(); track l._id) {
                  <div class="cm-lead">
                    <strong>{{ l.title }}</strong>
                    <span class="cm-lead-stage">{{ stageLabel(l.stage) }}</span>
                  </div>
                }
                <button class="btn btn-sm btn-ghost" (click)="goToLeads()">
                  <lucide-icon [img]="Target" [size]="14" [strokeWidth]="2.5"></lucide-icon> Ver en Seguimiento
                </button>
              </div>
            }
          </div>

          <div class="cm-actions">
            <button class="btn btn-secondary" (click)="closeContactModal()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="savingContact()" (click)="saveContact()">
              {{ savingContact() ? 'Guardando…' : (selected()?.customerId ? 'Actualizar contacto' : 'Guardar contacto') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .inbox {
      display: grid;
      grid-template-columns: 360px 1fr;
      height: 100%;
      background: var(--color-white);
    }

    /*
     * min-width: 0 en los dos items NO es decorativo: sin él un item de grid
     * usa min-width: auto y se niega a encoger por debajo del ancho mínimo de
     * su contenido. Con una cuenta de nombre largo o una URL sin espacios, el
     * panel se estiraba a ~690px dentro de una pantalla de 360 y la bandeja
     * salía con scroll horizontal, cortada por la derecha.
     */
    .chat-list, .thread { min-width: 0; }

    /* ── Lista ── */
    .chat-list {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid var(--color-border);
      background: var(--color-white);
    }

    .list-head {
      padding: 20px 20px 12px;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex-shrink: 0;
    }

    .list-title { display: flex; align-items: center; justify-content: space-between; }
    .list-title h1 {
      font-family: var(--font-heading);
      font-size: 20px;
      font-weight: 600;
      margin: 0;
      color: var(--color-text-main);
    }

    .search-wrap { position: relative; }
    .search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--color-text-muted); pointer-events: none;
    }
    .search-input { padding-left: 40px; width: 100%; }

    /* Un <select> reclama el ancho de su opción más larga ("Restaurante Bar
       Maya Miraflores · +51 999 111 222 (12 sin leer)"). Se le pone tope. */
    .account-select { width: 100%; min-width: 0; max-width: 100%; }

    .filters { display: flex; gap: 6px; flex-wrap: wrap; }

    .channel-tabs { display: flex; gap: 4px; padding: 3px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); border: 1px solid var(--color-border); min-width: 0; }
    .channel-tab { flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center;
      gap: 5px; padding: 6px 12px; border: none; background: none; cursor: pointer;
      border-radius: var(--radius-pill); font-size: 12.5px; font-weight: 600;
      color: var(--color-text-muted); transition: all .18s; white-space: nowrap; }
    .channel-tab:hover { color: var(--color-text-main); }
    .channel-tab.active { background: #fff; color: var(--color-brand);
      box-shadow: var(--shadow-sm); }
    .tab-badge { background: var(--color-brand); color: #fff; border-radius: var(--radius-pill);
      font-size: 10px; font-weight: 700; padding: 1px 6px; min-width: 16px; }
    .chip {
      border: 1px solid var(--color-border);
      background: var(--color-white);
      color: var(--color-text-muted);
      border-radius: var(--radius-pill);
      padding: 5px 13px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .chip:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .chip.active {
      background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white);
    }

    .list-scroll { flex: 1; overflow-y: auto; min-height: 0; }

    .list-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 60px 24px; text-align: center; color: var(--color-text-muted);
      font-size: 13px;
    }
    .list-empty p { margin: 0; font-weight: 600; color: var(--color-text-main); }
    .list-empty span { font-size: 12px; }

    .chat-item {
      display: flex; gap: 12px; width: 100%;
      padding: 14px 20px;
      border: none; border-bottom: 1px solid var(--color-bg-light);
      background: transparent; cursor: pointer; text-align: left;
      transition: background var(--transition-fast);
    }
    .chat-item:hover { background: var(--color-bg-light); }
    .chat-item.active { background: var(--color-brand-light); }

    .avatar {
      position: relative;
      width: 46px; height: 46px; min-width: 46px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 15px;
      background: linear-gradient(135deg, #6366F1, #8B5CF6);
      color: var(--color-white);
    }
    .avatar[data-channel="instagram"] { background: linear-gradient(135deg, #F58529, #DD2A7B); }

    .channel-dot {
      position: absolute; right: -2px; bottom: -2px;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--color-white); color: var(--color-text-main);
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-sm);
    }

    .chat-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .chat-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .chat-name {
      font-weight: 600; font-size: 14px; color: var(--color-text-main);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chat-time { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }

    .chat-account {
      display: block; font-size: 11px; font-weight: 600; color: var(--color-text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;
    }

    .chat-item-bottom { display: flex; align-items: center; gap: 8px; }
    .chat-preview {
      flex: 1; min-width: 0; font-size: 12.5px; color: var(--color-text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .chat-preview .you { color: var(--color-text-main); font-weight: 600; }

    .unread {
      background: var(--color-brand); color: var(--color-white);
      font-size: 11px; font-weight: 700;
      min-width: 20px; height: 20px; padding: 0 6px;
      border-radius: var(--radius-pill);
      display: flex; align-items: center; justify-content: center;
    }

    .chat-item-tags { display: flex; gap: 5px; margin-top: 2px; }
    .tag {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 10.5px; font-weight: 600;
      padding: 2px 8px; border-radius: var(--radius-pill);
    }
    .tag-ai { background: rgba(139, 92, 246, 0.12); color: var(--color-ai); }
    .tag-manual { background: rgba(16, 185, 129, 0.12); color: var(--color-success); }
    .tag-handoff { background: rgba(245, 158, 11, 0.14); color: #B45309; }
    .tag-crm { background: var(--color-brand-light); color: var(--color-brand); }
    .tag-closed { background: var(--color-bg-light); color: var(--color-text-muted); }

    /* ── Hilo ── */
    .thread {
      display: flex; flex-direction: column; min-height: 0; min-width: 0;
      background: var(--color-bg-light);
    }

    .thread-empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 10px;
      padding: 40px; text-align: center; color: var(--color-text-muted);
    }
    .thread-empty h2 {
      font-family: var(--font-heading); font-size: 19px; margin: 0; color: var(--color-text-main);
    }
    .thread-empty p { margin: 0; font-size: 13.5px; max-width: 420px; line-height: 1.6; }

    .thread-head {
      display: flex; align-items: center; gap: 12px; min-width: 0;
      padding: 14px 24px;
      background: var(--color-white);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .back-btn, .thread-more { display: none; }
    .thread-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .thread-name {
      font-weight: 600; font-size: 15px; color: var(--color-text-main);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .thread-sub {
      font-size: 12px; color: var(--color-text-muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ── Hoja de acciones del chat (móvil) ──
       Las piezas comunes (.sheet-grip, .sheet-row*, la animación) viven en
       styles.scss: las comparten también el menú "Más" y las notificaciones. */
    /* ── Hoja de clasificación ── */
    .classify-sheet { gap: 0; max-height: 88dvh; }
    .cls-body { overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 4px 12px 8px; }
    .cls-label {
      font-size: 11.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--color-text-muted); margin-top: 6px;
    }
    .cls-tags { display: flex; flex-wrap: wrap; gap: 7px; }
    .cls-tag {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 8px 14px; min-height: 38px;
      border: 1px solid var(--color-border); background: var(--color-white);
      border-radius: var(--radius-pill);
      font-family: var(--font-base); font-size: 13.5px; font-weight: 600;
      color: var(--color-text-muted); cursor: pointer;
      transition: all var(--transition-fast);
    }
    .cls-tag.on {
      background: var(--color-brand-light); border-color: transparent;
      color: var(--color-brand);
    }
    .cls-empty { font-size: 13px; color: var(--color-text-muted); }
    .cls-new { display: flex; gap: 8px; align-items: center; }
    .cls-new .input { flex: 1; min-width: 0; }
    .cls-new .btn { flex-shrink: 0; }
    .cls-hint { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.5; }
    .cls-stage { display: flex; gap: 8px; align-items: center; }
    .cls-stage .select { flex: 1; min-width: 0; }
    .cls-stage .btn { flex-shrink: 0; gap: 6px; }
    .cls-lead {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 12px 14px; border-radius: var(--radius-md);
      background: var(--color-bg-light);
    }
    .cls-lead-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .cls-lead-info strong {
      font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cls-lead-stage { font-size: 11.5px; font-weight: 600; color: var(--color-text-muted); }
    .cls-actions {
      display: flex; gap: 10px; padding: 12px 12px 0;
      border-top: 1px solid var(--color-border); margin-top: 8px;
    }
    .cls-actions .btn { flex: 1; }

    @media (max-width: 640px) {
      /* En el teléfono los botones de la hoja son objetivos táctiles. */
      .cls-actions .btn, .cls-stage .btn { min-height: 46px; }
      .cls-stage { flex-direction: column; align-items: stretch; }
      .cls-stage .btn { width: 100%; justify-content: center; }
    }

    .overlay.sheet-overlay { align-items: flex-end; }
    /* El interruptor reutiliza el pill del escritorio, pero su estado
       "encendido" cuelga de .sheet-row.on, no de .ai-switch.on. */
    .sheet-row.on .ai-track { background: var(--color-ai); }
    .sheet-row.on .ai-knob { transform: translateX(14px); }

    .typing { color: var(--color-ai); font-style: normal; }

    .thread-actions { display: flex; align-items: center; gap: 8px; }

    .ai-switch {
      display: inline-flex; align-items: center; gap: 8px;
      cursor: pointer; user-select: none;
      padding: 6px 14px 6px 8px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border);
      background: var(--color-white);
      transition: all var(--transition-fast);
    }
    .ai-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
    .ai-track {
      width: 34px; height: 20px; border-radius: var(--radius-pill);
      background: var(--color-success); position: relative;
      transition: background var(--transition-fast);
      flex-shrink: 0;
    }
    .ai-knob {
      position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--color-white);
      transition: transform var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }
    .ai-switch.on .ai-track { background: var(--color-ai); }
    .ai-switch.on .ai-knob { transform: translateX(14px); }
    .ai-label {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12.5px; font-weight: 600; color: var(--color-text-main);
      white-space: nowrap;
    }
    .ai-switch.on { border-color: rgba(139, 92, 246, 0.4); }
    .ai-switch.on .ai-label { color: var(--color-ai); }

    .btn-icon.danger:hover { color: var(--color-error); }

    .handoff-banner {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 9px 24px;
      background: rgba(245, 158, 11, 0.10);
      color: #92400E;
      font-size: 12.5px; font-weight: 500; line-height: 1.5;
      border-bottom: 1px solid rgba(245, 158, 11, 0.22);
    }
    .handoff-banner lucide-icon { flex-shrink: 0; margin-top: 2px; }

    .system-note {
      display: flex; align-items: center; gap: 6px;
      align-self: center; max-width: min(560px, 86%);
      margin: 4px auto;
      padding: 7px 14px;
      background: rgba(245, 158, 11, 0.12);
      color: #92400E;
      border-radius: var(--radius-pill);
      font-size: 11.5px; font-weight: 500; line-height: 1.45; text-align: center;
    }
    .system-note lucide-icon { flex-shrink: 0; }

    .manual-banner {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 24px;
      background: rgba(16, 185, 129, 0.08);
      color: #047857;
      font-size: 12.5px; font-weight: 500;
      border-bottom: 1px solid rgba(16, 185, 129, 0.18);
      flex-shrink: 0;
    }

    /* ── Mensajes ── */
    .messages {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 20px 24px 8px;
      display: flex; flex-direction: column; gap: 3px;
    }

    .older-hint {
      align-self: center; font-size: 12px; color: var(--color-text-muted);
      padding: 8px 0;
    }

    .day-sep { display: flex; justify-content: center; margin: 14px 0 8px; }
    .day-sep span {
      background: var(--color-white); color: var(--color-text-muted);
      font-size: 11px; font-weight: 600;
      padding: 4px 12px; border-radius: var(--radius-pill);
      box-shadow: var(--shadow-sm);
    }

    .row { display: flex; }
    .row.out { justify-content: flex-end; }

    .bubble {
      position: relative;
      max-width: min(560px, 74%);
      background: var(--color-white);
      border-radius: 18px 18px 18px 6px;
      padding: 9px 13px 6px;
      box-shadow: var(--shadow-sm);
      display: flex; flex-direction: column; gap: 5px;
      animation: bubbleIn 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .row.out .bubble {
      background: #DCF7E3;
      border-radius: 18px 18px 6px 18px;
    }
    .bubble[data-author="agent"] { background: #F1EBFF; }
    .bubble.failed { background: #FEE2E2; }

    @keyframes bubbleIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: none; }
    }

    .by-agent {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 10.5px; font-weight: 700; color: var(--color-ai);
      text-transform: uppercase; letter-spacing: 0.02em;
    }

    .bubble-text {
      margin: 0; font-size: 14px; line-height: 1.55;
      color: var(--color-text-main); white-space: pre-wrap;
      /* anywhere y no break-word: es lo que parte de verdad una URL larga
         sin espacios en todos los navegadores. */
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex; align-items: center; justify-content: flex-end; gap: 4px;
      font-size: 10.5px; color: var(--color-text-muted);
    }
    .meta .read { color: #2563EB; }
    .meta .err { color: var(--color-error); }
    .err-text { font-size: 11px; color: var(--color-error); font-weight: 600; }

    .media-img {
      max-width: 100%; width: 300px; border-radius: 14px;
      cursor: zoom-in; display: block;
    }
    .media-sticker { width: 130px; height: 130px; object-fit: contain; }
    .media-video { max-width: 100%; width: 320px; border-radius: 14px; display: block; }

    .media-audio { display: flex; align-items: center; gap: 8px; }
    .media-audio audio { height: 38px; max-width: 260px; }
    .media-audio.voice { color: var(--color-brand); }

    .media-doc {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 14px;
      background: rgba(15, 23, 42, 0.04);
      text-decoration: none; color: var(--color-text-main);
      transition: background var(--transition-fast);
      max-width: 300px;
    }
    .media-doc:hover { background: rgba(15, 23, 42, 0.08); }
    .doc-icon {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      background: var(--color-brand-light); color: var(--color-brand);
      display: flex; align-items: center; justify-content: center;
    }
    .doc-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .doc-meta strong {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .doc-meta small { font-size: 11px; color: var(--color-text-muted); }

    .media-loc {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-radius: 14px;
      background: rgba(15, 23, 42, 0.04);
      color: var(--color-text-main); text-decoration: none; font-size: 13px; font-weight: 500;
    }
    .unsupported { font-size: 13px; color: var(--color-text-muted); }

    /* ── Composer ── */
    .composer {
      position: relative;
      background: var(--color-white);
      border-top: 1px solid var(--color-border);
      padding: 12px 20px;
      flex-shrink: 0;
      display: flex; flex-direction: column; gap: 8px;
    }

    .composer-row { display: flex; align-items: flex-end; gap: 6px; }

    .composer-input {
      flex: 1;
      resize: none;
      max-height: 140px;
      min-height: 46px;
      padding-top: 12px; padding-bottom: 12px;
    }

    .btn-icon.send {
      width: 46px; height: 46px; min-width: 46px;
      border-radius: 50%;
      background: var(--color-brand); color: var(--color-white);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-brand);
      transition: transform var(--transition-fast), background var(--transition-fast);
    }
    .btn-icon.send:hover:not(:disabled) { background: var(--color-brand-hover); transform: translateY(-1px); }
    .btn-icon.send:disabled { opacity: 0.5; cursor: not-allowed; }

    .attach-wrap { position: relative; }
    .attach-menu {
      position: absolute; bottom: calc(100% + 8px); left: 0;
      background: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      padding: 6px; min-width: 190px; z-index: 20;
      display: flex; flex-direction: column; gap: 2px;
    }
    .attach-menu button {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border: none; background: transparent;
      border-radius: var(--radius-sm); cursor: pointer;
      font-size: 13.5px; font-weight: 500; color: var(--color-text-main);
      text-align: left; width: 100%;
    }
    .attach-menu button:hover { background: var(--color-bg-light); }

    .attach-preview {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; border-radius: var(--radius-md);
      background: var(--color-bg-light);
    }
    .attach-preview img { width: 40px; height: 40px; object-fit: cover; border-radius: 10px; }
    .attach-icon {
      width: 40px; height: 40px; border-radius: 10px;
      background: var(--color-brand-light); color: var(--color-brand);
      display: flex; align-items: center; justify-content: center;
    }
    .attach-name {
      flex: 1; min-width: 0; font-size: 13px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .recording-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: var(--radius-md);
      background: var(--color-brand-light); color: var(--color-brand);
      font-size: 13px; font-weight: 600;
    }
    .recording-bar .btn { margin-left: auto; }
    .recording-bar .btn + .btn { margin-left: 0; }
    .rec-dot {
      width: 9px; height: 9px; border-radius: 50%; background: var(--color-error);
      animation: pulse 1.1s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

    .emoji-pop {
      display: flex; flex-wrap: wrap; gap: 2px;
      padding: 8px; border-radius: var(--radius-md);
      background: var(--color-bg-light);
    }
    .emoji {
      border: none; background: transparent; cursor: pointer;
      font-size: 20px; line-height: 1; padding: 6px; border-radius: 8px;
    }
    .emoji:hover { background: var(--color-white); }

    .upload-hint { font-size: 12px; color: var(--color-text-muted); }

    /* ── Lightbox ── */
    .overlay {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    .saved-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border: 1px solid rgba(16,185,129,.35);
      background: rgba(16,185,129,.10); color: #047857;
      border-radius: var(--radius-pill); font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all var(--transition-fast);
    }
    .saved-chip:hover { background: rgba(16,185,129,.18); }

    .contact-modal {
      width: calc(100% - 48px); max-width: 480px;
      max-height: calc(100vh - 80px);
      display: flex; flex-direction: column; padding: 0;
    }
    .cm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 28px 8px; }
    .cm-head h2 { margin: 0 0 3px; font-family: var(--font-heading); font-size: 19px; }
    .cm-sub { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
    .cm-body { flex: 1; overflow-y: auto; padding: 12px 28px 16px; display: flex; flex-direction: column; gap: 13px; }
    .cm-field { display: flex; flex-direction: column; gap: 6px; }
    .cm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .cm-label { font-size: 12px; font-weight: 600; }
    .cm-check { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; background: var(--color-bg-light); border-radius: var(--radius-md); cursor: pointer; }
    .cm-check span { display: flex; flex-direction: column; }
    .cm-check small { font-size: 11.5px; color: var(--color-text-muted); }
    .cm-leads { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--color-bg-light); border-radius: var(--radius-md); }
    .cm-lead { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
    .cm-lead-stage { font-size: 11px; font-weight: 600; color: var(--color-text-muted); }
    .cm-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 28px 24px; border-top: 1px solid var(--color-border); }
    @media (max-width: 520px) { .cm-row { grid-template-columns: 1fr; } }

    .lightbox-img {
      max-width: calc(100vw - 64px); max-height: calc(100vh - 64px);
      border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
    }

    /* ── Móvil ──
       El corte es 968px, el mismo del shell: al abrir un chat la app entra en
       modo inmersivo (sin cabecera ni barra de pestañas) y el hilo ocupa la
       pantalla entera, como cualquier app de mensajería. */
    @media (max-width: 968px) {
      .inbox { grid-template-columns: 1fr; }
      .thread { display: none; }
      .inbox.thread-open .chat-list { display: none; }
      .inbox.thread-open .thread { display: flex; }
      .back-btn { display: flex; }
      .thread-head { padding: 12px 14px; gap: 10px; }
      /* Los controles del chat se mueven a la hoja de acciones. */
      .thread-actions { display: none; }
      .thread-more { display: flex; }
      .messages { padding: 14px 14px 6px; }
      .bubble { max-width: 84%; }
      .composer { padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); }
      /* La cabecera de la lista se compacta: en el teléfono la mitad de la
         pantalla no puede ser filtros. El título ya lo pinta la propia página. */
      .list-head { padding: 14px 16px 10px; gap: 10px; }
      .list-title h1 { font-size: 18px; }
      .filters {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        margin: 0 -16px;
        padding: 0 16px 2px;
      }
      .filters::-webkit-scrollbar { display: none; }
      .chip { flex: 0 0 auto; }
      .chat-item { padding: 14px 16px; }
      .media-img, .media-video { width: 240px; }
      /* En el hilo solo caben las acciones esenciales: el resto vive en el
         panel del contacto, al que se llega desde la cabecera. */
      .chat-item, .back-btn, .thread-more { min-height: 44px; }
      /* Los mensajes son lo único seleccionable del hilo. */
      .bubble { user-select: text; -webkit-user-select: text; }

      /* ── Tipografía del móvil ──
         Los tamaños del escritorio (12,5px de vista previa, 14px de mensaje)
         se leen bien en una columna de 360px a 60cm de distancia, no en un
         teléfono en la mano. Aquí se sube lo que de verdad se lee: el nombre
         de quien escribe, la vista previa y el texto del mensaje. */
      .chat-name { font-size: 16px; }
      .chat-preview { font-size: 14.5px; line-height: 1.35; }
      .chat-time, .chat-account { font-size: 12px; }
      .tag { font-size: 11.5px; padding: 3px 9px; }
      .unread { font-size: 12px; min-width: 22px; height: 22px; }
      .list-empty { font-size: 14.5px; }

      .thread-name { font-size: 16.5px; }
      .thread-sub { font-size: 13px; }
      .bubble-text { font-size: 16px; line-height: 1.5; }
      .meta { font-size: 11.5px; }
      .day-sep { font-size: 12.5px; }
      .doc-name { font-size: 14.5px; }
      .doc-meta small { font-size: 12px; }
      .agent-label { font-size: 11px; }
      .bubble { max-width: 88%; }

      /* El compositor: sin el botón de emojis el campo respira y el
         placeholder deja de partirse en dos líneas. */
      .emoji-btn { display: none; }
      .composer-row { gap: 6px; }
      .composer-input { min-height: 48px; }
    }
  `],
})
export class InboxComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);
  private realtime = inject(ConversationsRealtimeService);
  private chrome = inject(AppChromeService);
  private push = inject(PushService);
  private destroyRef = inject(DestroyRef);

  readonly MessagesSquare = MessagesSquare;
  readonly Send = Send;
  readonly Paperclip = Paperclip;
  readonly ImageIcon = ImageIcon;
  readonly Video = Video;
  readonly FileText = FileText;
  readonly Mic = Mic;
  readonly Square = Square;
  readonly Bot = Bot;
  readonly Search = Search;
  readonly Check = Check;
  readonly CheckCheck = CheckCheck;
  readonly ReadIcon = ReadIcon;
  readonly Clock = Clock;
  readonly AlertCircle = AlertCircle;
  readonly X = X;
  readonly Trash2 = Trash2;
  readonly ArrowLeft = ArrowLeft;
  readonly Download = Download;
  readonly MapPin = MapPin;
  readonly Instagram = Instagram;
  readonly RefreshCw = RefreshCw;
  readonly Smile = Smile;
  readonly UserRound = UserRound;
  readonly PhoneForwarded = PhoneForwarded;
  readonly UserPlus = UserPlus;
  readonly ContactRound = ContactRound;
  readonly Target = Target;
  readonly Phone = Phone;
  readonly MoreVertical = MoreVertical;
  readonly Tag = Tag;

  readonly emojis = EMOJIS;
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'unread', label: 'No leídos' },
    { key: 'auto', label: 'Agente IA' },
    { key: 'manual', label: 'Manual' },
  ];

  conversations = signal<Conv[]>([]);
  accounts = signal<InboxAccount[]>([]);
  accountId = signal('');
  /** '' = todos los canales. Filtra el selector y la propia consulta. */
  channel = signal<'' | 'whatsapp' | 'instagram'>('');

  hasBothChannels = computed(() => {
    const ch = new Set(this.accounts().map(a => a.channel));
    return ch.has('whatsapp') && ch.has('instagram');
  });

  /** Cuentas del canal elegido; con '' se devuelven todas. */
  private accountsInChannel = computed(() => {
    const ch = this.channel();
    return ch ? this.accounts().filter(a => a.channel === ch) : this.accounts();
  });

  /** Agrupadas por canal para los `optgroup` del selector. */
  accountGroups = computed(() => {
    const groups: { channel: string; label: string; accounts: InboxAccount[] }[] = [];
    for (const ch of ['whatsapp', 'instagram'] as const) {
      const list = this.accountsInChannel().filter(a => a.channel === ch);
      if (list.length) {
        groups.push({
          channel: ch,
          label: ch === 'whatsapp' ? 'WhatsApp' : 'Instagram',
          accounts: list,
        });
      }
    }
    return groups;
  });

  channelTabs = computed(() => {
    const sum = (list: InboxAccount[], k: 'total' | 'unread') =>
      list.reduce((n, a) => n + (a[k] ?? 0), 0);
    const all = this.accounts();
    const wa = all.filter(a => a.channel === 'whatsapp');
    const ig = all.filter(a => a.channel === 'instagram');
    return [
      { key: '' as const, label: 'Todo', total: sum(all, 'total'), unread: sum(all, 'unread') },
      { key: 'whatsapp' as const, label: 'WhatsApp', total: sum(wa, 'total'), unread: sum(wa, 'unread') },
      { key: 'instagram' as const, label: 'Instagram', total: sum(ig, 'total'), unread: sum(ig, 'unread') },
    ];
  });

  channelLabel = computed(() => {
    const ch = this.channel();
    if (ch === 'whatsapp') return ' de WhatsApp';
    if (ch === 'instagram') return ' de Instagram';
    return '';
  });

  totalForChannel = computed(() =>
    this.accountsInChannel().reduce((n, a) => n + (a.total ?? 0), 0),
  );
  messages = signal<Msg[]>([]);
  selectedId = signal<string | null>(null);
  search = signal('');
  filter = signal<Filter>('all');

  loadingList = signal(true);
  loadingMessages = signal(false);
  loadingOlder = signal(false);
  sending = signal(false);
  uploading = signal(false);
  typing = signal(false);

  draft = signal('');
  attachment = signal<{ url: string; key?: string; type: MsgType; mimeType: string; filename: string; size: number } | null>(null);
  /** Hoja de acciones del chat en móvil. */
  threadMenu = signal(false);
  attachOpen = signal(false);
  emojiOpen = signal(false);
  lightbox = signal<string | null>(null);

  recording = signal(false);
  recordingSeconds = signal(0);

  private scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private mediaInput = viewChild<ElementRef<HTMLInputElement>>('mediaInput');
  private docInput = viewChild<ElementRef<HTMLInputElement>>('docInput');
  private audioInput = viewChild<ElementRef<HTMLInputElement>>('audioInput');

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private allLoaded = false;

  selected = computed(() => this.conversations().find(c => c._id === this.selectedId()) ?? null);

  visibleConversations = computed(() => {
    const f = this.filter();
    return this.conversations().filter(c => {
      if (f === 'unread') return c.unreadCount > 0;
      if (f === 'auto') return c.autoReply;
      if (f === 'manual') return !c.autoReply;
      return true;
    });
  });

  /** Mensajes agrupados por día para los separadores del hilo. */
  groupedMessages = computed(() => {
    const groups: { day: string; items: Msg[] }[] = [];
    for (const m of this.messages()) {
      const day = this.dayLabel(m.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  });

  constructor() {
    // Con un chat abierto en el móvil, el hilo ocupa la pantalla entera: el
    // shell esconde su cabecera y su barra de pestañas mientras dure.
    effect(() => this.chrome.immersive.set(!!this.selectedId()));
    // Un push que llega con la app en segundo plano puede adelantarse al
    // websocket (o llegar con él dormido): al volver, se refresca la lista.
    effect(() => {
      if (this.push.lastPush() > 0) this.onPushReceived();
    });
  }

  ngOnInit() {
    this.loadAccounts();
    this.loadConversations();
    // El aviso de derivación enlaza a /inbox?c=<id>: abre ese chat al entrar.
    const deepLink = this.route.snapshot.queryParamMap.get('c');
    if (deepLink) this.openById(deepLink);
    // El enlace puede cambiar sin recargar el componente (al tocar una
    // notificación con la app ya abierta en la bandeja).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('c');
      if (id && id !== this.selectedId()) this.openById(id);
    });
    this.listenRealtime();
    // Red de seguridad por si el websocket se cae.
    this.pollTimer = setInterval(() => {
      if (!this.realtime.connected()) this.loadConversations(false);
    }, 15_000);
  }

  ngOnDestroy() {
    this.chrome.exitImmersive();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.stopAllRecording();
  }

  /** Recarga tras un push: la lista siempre, el hilo abierto si lo hay. */
  private onPushReceived() {
    this.loadConversations(false);
    if (this.selectedId()) this.loadMessages(false);
  }

  // ── Datos ──

  loadAccounts() {
    this.http.get<InboxAccount[]>(`${API}/conversations/accounts`).subscribe({
      next: list => {
        this.accounts.set(list);
        // Si la cuenta seleccionada desapareció, vuelve a "todas".
        if (this.accountId() && !list.some(a => a._id === this.accountId())) {
          this.accountId.set('');
          this.loadConversations(false);
        }
      },
      error: () => this.accounts.set([]),
    });
  }

  loadConversations(showLoader = true) {
    if (showLoader) this.loadingList.set(true);
    const params = new URLSearchParams();
    const q = this.search().trim();
    if (q) params.set('q', q);
    if (this.accountId()) params.set('accountId', this.accountId());
    // Con una cuenta concreta el canal sobra: el accountId ya lo determina.
    else if (this.channel()) params.set('channel', this.channel());
    const query = params.toString();
    const url = `${API}/conversations${query ? `?${query}` : ''}`;
    this.http.get<Conv[]>(url).subscribe({
      next: list => { this.conversations.set(list); this.loadingList.set(false); },
      error: () => {
        this.loadingList.set(false);
        this.toast.error('No se pudieron cargar las conversaciones');
      },
    });
  }

  reload() { this.loadAccounts(); this.loadConversations(); if (this.selectedId()) this.loadMessages(); }

  /** Abre un chat por id aunque todavía no esté en la lista cargada (deep link). */
  private openById(id: string) {
    this.selectedId.set(id);
    this.loadMessages();
    this.http.get<Conv>(`${API}/conversations/${id}`).subscribe({
      next: conv => {
        this.upsertConv(conv);
        if (conv.unreadCount > 0) this.markRead(conv._id);
      },
      error: () => {
        this.selectedId.set(null);
        this.toast.error('No se encontró la conversación');
      },
    });
  }

  onSearch(value: string) {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadConversations(false), 300);
  }

  setFilter(f: Filter) { this.filter.set(f); }

  /** Cambia el canal; si la cuenta elegida no pertenece a él, se vuelve a "todas". */
  setChannel(ch: '' | 'whatsapp' | 'instagram') {
    if (this.channel() === ch) return;
    this.channel.set(ch);
    const current = this.accounts().find(a => a._id === this.accountId());
    if (current && ch && current.channel !== ch) this.accountId.set('');
    this.closeThread();
    this.loadConversations();
  }

  /** Cambia la cuenta cuyas conversaciones se listan ('' = todas las conectadas). */
  setAccount(id: string) {
    if (this.accountId() === id) return;
    this.accountId.set(id);
    this.closeThread();
    this.loadConversations();
  }

  // ── Clasificación: etiquetas y envío al embudo ──
  classifyOpen = signal(false);
  savingClassify = signal(false);
  /** Etiquetas ya usadas en el tenant, para no reinventar variantes. */
  knownTags = signal<string[]>([]);
  /** Selección en curso; no se guarda hasta pulsar "Guardar". */
  draftTags = signal<string[]>([]);
  openLead = signal<{ _id: string; title: string; stage: string } | null>(null);
  newTag = '';
  pipelineStage: string = PIPELINE_STAGES[0];
  readonly stages = PIPELINE_STAGES;

  /** Lo conocido del tenant, más lo ya elegido, más las sugerencias de partida. */
  tagOptions = computed(() => {
    const known = this.knownTags();
    const base = known.length ? known : SUGGESTED_TAGS;
    return [...new Set([...this.draftTags(), ...base])];
  });

  openClassify() {
    const conv = this.selected();
    if (!conv) return;
    this.newTag = '';
    this.pipelineStage = PIPELINE_STAGES[0];
    this.draftTags.set([...(conv.tags ?? [])]);
    this.openLead.set(null);
    this.classifyOpen.set(true);

    this.http.get<string[]>(`${API}/conversations/tags`, { context: silentRequest() })
      .subscribe({ next: t => this.knownTags.set(t ?? []), error: () => undefined });

    // El chat puede tener ya una oportunidad abierta: entonces no se ofrece crear otra.
    if (conv.customerId) {
      this.http.get<{ leads: { _id: string; title: string; stage: string; status?: string }[] }>(
        `${API}/conversations/${conv._id}/contact`, { context: silentRequest() },
      ).subscribe({
        next: card => {
          const abierta = (card.leads ?? []).find(l => l.status !== 'won' && l.status !== 'lost');
          this.openLead.set(abierta ?? null);
        },
        error: () => undefined,
      });
    }
  }

  closeClassify() { this.classifyOpen.set(false); }

  toggleTag(tag: string) {
    this.draftTags.update(list =>
      list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag],
    );
  }

  addTag() {
    const tag = this.newTag.trim();
    if (!tag) return;
    if (!this.draftTags().includes(tag)) this.draftTags.update(l => [...l, tag]);
    this.newTag = '';
  }

  saveTags() {
    const conv = this.selected();
    if (!conv) return;
    this.savingClassify.set(true);
    this.http.patch<{ conversation: Conv }>(`${API}/conversations/${conv._id}/tags`, {
      tags: this.draftTags(),
    }).subscribe({
      next: res => {
        this.savingClassify.set(false);
        // El backend devuelve la conversación ya enlazada al contacto; las
        // etiquetas se reflejan al vuelo en la lista sin recargarla entera.
        this.upsertConv({ ...res.conversation, tags: this.draftTags() });
        this.classifyOpen.set(false);
        this.toast.success('Clasificación guardada');
      },
      error: err => {
        this.savingClassify.set(false);
        this.toast.error(err.error?.message || 'No se pudo guardar la clasificación');
      },
    });
  }

  sendToPipeline() {
    const conv = this.selected();
    if (!conv) return;
    this.savingClassify.set(true);
    this.http.post<{ conversation: Conv; lead: { _id: string; title: string; stage: string }; created: boolean }>(
      `${API}/conversations/${conv._id}/lead`, { stage: this.pipelineStage },
    ).subscribe({
      next: res => {
        this.savingClassify.set(false);
        this.openLead.set(res.lead);
        this.upsertConv({ ...res.conversation, tags: this.draftTags() });
        this.toast.success(
          res.created ? 'Enviado a Seguimiento' : 'Este cliente ya tenía una oportunidad abierta',
        );
      },
      error: err => {
        this.savingClassify.set(false);
        this.toast.error(err.error?.message || 'No se pudo enviar a seguimiento');
      },
    });
  }

  // ── Contacto del CRM ──
  contactModal = signal(false);
  savingContact = signal(false);
  crmLeads = signal<{ _id: string; title: string; stage: string }[]>([]);
  contactForm = {
    name: '', phone: '', email: '', tags: '', notes: '',
    createLead: false, leadTitle: '',
  };

  /** Etiqueta legible de la etapa del embudo (el backend guarda la clave). */
  stageLabel(key: string): string {
    return LEAD_STAGE_LABELS[key] ?? key;
  }

  openContactModal() {
    const conv = this.selected();
    if (!conv) return;
    this.crmLeads.set([]);
    this.contactForm = {
      name: conv.contactName ?? '',
      // En WhatsApp el identificador del chat ya es el número del cliente.
      phone: conv.channel === 'whatsapp' ? conv.contact : '',
      email: '', tags: '', notes: '',
      createLead: false, leadTitle: '',
    };
    this.contactModal.set(true);
    if (conv.customerId) this.loadCrmCard(conv._id);
  }

  closeContactModal() { this.contactModal.set(false); }

  /** Trae el contacto ya vinculado para poder revisarlo y completarlo. */
  private loadCrmCard(convId: string) {
    this.http
      .get<{ customer: { name: string; phone?: string; email?: string; tags?: string[]; notes?: string } | null; leads: { _id: string; title: string; stage: string }[] }>(
        `${API}/conversations/${convId}/contact`,
      )
      .subscribe({
        next: card => {
          this.crmLeads.set(card.leads ?? []);
          if (card.customer) {
            this.contactForm = {
              ...this.contactForm,
              name: card.customer.name,
              phone: card.customer.phone ?? this.contactForm.phone,
              email: card.customer.email ?? '',
              tags: (card.customer.tags ?? []).join(', '),
              notes: card.customer.notes ?? '',
            };
          }
        },
        error: () => {},
      });
  }

  saveContact() {
    const conv = this.selected();
    if (!conv) return;
    if (!this.contactForm.name.trim()) {
      this.toast.error('El nombre es obligatorio');
      return;
    }
    this.savingContact.set(true);
    const body = {
      name: this.contactForm.name.trim(),
      phone: this.contactForm.phone.trim() || undefined,
      email: this.contactForm.email.trim() || undefined,
      tags: this.contactForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      notes: this.contactForm.notes.trim() || undefined,
      createLead: this.contactForm.createLead,
      leadTitle: this.contactForm.leadTitle.trim() || undefined,
    };
    this.http
      .post<{ conversation: Conv; customer: { name: string }; lead?: { _id: string } }>(
        `${API}/conversations/${conv._id}/contact`,
        body,
      )
      .subscribe({
        next: res => {
          this.upsertConv(res.conversation);
          this.savingContact.set(false);
          this.contactModal.set(false);
          this.toast.success(
            res.lead
              ? 'Contacto guardado y oportunidad creada'
              : 'Contacto guardado en Clientes',
          );
        },
        error: err => {
          this.toast.error(err.error?.message || 'No se pudo guardar el contacto');
          this.savingContact.set(false);
        },
      });
  }

  goToLeads() {
    this.contactModal.set(false);
    void this.router.navigate(['/leads']);
  }

  /** Números del equipo a los que se les avisó la derivación. */
  notifiedList(c: Conv): string {
    return (c.escalationNotifiedTo ?? []).map(n => `+${n}`).join(', ');
  }

  /** Etiqueta de la cuenta por la que entra la conversación. */
  accountName(c: Conv): string {
    return this.accounts().find(a => a._id === c.accountId)?.label ?? '';
  }

  openConversation(c: Conv) {
    if (this.selectedId() === c._id) return;
    this.selectedId.set(c._id);
    this.messages.set([]);
    this.draft.set('');
    this.clearAttachment();
    this.allLoaded = false;
    this.loadMessages();
    if (c.unreadCount > 0) this.markRead(c._id);
  }

  closeThread() { this.selectedId.set(null); }

  private loadMessages(showLoader = true) {
    const id = this.selectedId();
    if (!id) return;
    if (showLoader) this.loadingMessages.set(true);
    this.http.get<Msg[]>(`${API}/conversations/${id}/messages?limit=50`, {
      ...(showLoader ? {} : { context: silentRequest() }),
    }).subscribe({
      next: list => {
        this.messages.set(list);
        this.loadingMessages.set(false);
        this.allLoaded = list.length < 50;
        this.scrollToBottom();
      },
      error: () => {
        this.loadingMessages.set(false);
        this.toast.error('No se pudieron cargar los mensajes');
      },
    });
  }

  onScroll() {
    const el = this.scroller()?.nativeElement;
    if (!el || el.scrollTop > 60 || this.loadingOlder() || this.allLoaded) return;
    const id = this.selectedId();
    const first = this.messages()[0];
    if (!id || !first) return;

    this.loadingOlder.set(true);
    const prevHeight = el.scrollHeight;
    this.http
      .get<Msg[]>(`${API}/conversations/${id}/messages?limit=50&before=${encodeURIComponent(first.at)}`)
      .subscribe({
        next: older => {
          if (older.length === 0) this.allLoaded = true;
          else this.messages.update(list => [...older, ...list]);
          this.loadingOlder.set(false);
          // Conserva la posición visual tras insertar arriba.
          setTimeout(() => { el.scrollTop = el.scrollHeight - prevHeight; });
        },
        error: () => this.loadingOlder.set(false),
      });
  }

  private markRead(id: string) {
    this.http.patch<Conv>(`${API}/conversations/${id}/read`, {}, {
      context: silentRequest(),
    }).subscribe({
      next: conv => {
        this.upsertConv(conv);
        // La insignia del menú vive fuera de esta pantalla.
        this.realtime.refreshUnread();
      },
      error: () => undefined,
    });
  }

  // ── Acciones sobre la conversación ──

  toggleAutoReply(event: Event) {
    const conv = this.selected();
    if (!conv) return;
    const enabled = (event.target as HTMLInputElement).checked;
    this.http.patch<Conv>(`${API}/conversations/${conv._id}/auto-reply`, { enabled }).subscribe({
      next: updated => {
        this.upsertConv(updated);
        this.toast.success(enabled ? 'El agente IA vuelve a responder este chat' : 'Tomaste el control del chat');
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo cambiar el modo de respuesta'),
    });
  }

  toggleStatus() {
    const conv = this.selected();
    if (!conv) return;
    const status = conv.status === 'closed' ? 'open' : 'closed';
    this.http.patch<Conv>(`${API}/conversations/${conv._id}/status`, { status }).subscribe({
      next: updated => {
        this.upsertConv(updated);
        this.toast.success(status === 'closed' ? 'Conversación cerrada' : 'Conversación reabierta');
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo actualizar el estado'),
    });
  }

  async deleteConversation() {
    const conv = this.selected();
    if (!conv) return;
    const ok = await this.confirmSvc.confirm({
      title: 'Eliminar conversación',
      message: `Se borrará todo el historial con ${this.displayName(conv)}. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/conversations/${conv._id}`).subscribe({
      next: () => {
        this.conversations.update(list => list.filter(c => c._id !== conv._id));
        this.selectedId.set(null);
        this.toast.success('Conversación eliminada');
      },
      error: err => this.toast.error(err.error?.message || 'No se pudo eliminar la conversación'),
    });
  }

  // ── Envío ──

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  addEmoji(e: string) {
    this.draft.update(d => d + e);
    this.emojiOpen.set(false);
  }

  send() {
    const conv = this.selected();
    const att = this.attachment();
    const text = this.draft().trim();
    if (!conv || this.sending() || this.uploading()) return;
    if (!text && !att) return;

    this.sending.set(true);
    const body = att
      ? { text, type: att.type, mediaUrl: att.url, mediaKey: att.key, mimeType: att.mimeType, filename: att.filename, size: att.size }
      : { text, type: 'text' as MsgType };

    this.http.post<Msg>(`${API}/conversations/${conv._id}/messages`, body).subscribe({
      next: msg => {
        this.upsertMessage(msg);
        this.draft.set('');
        this.clearAttachment();
        this.emojiOpen.set(false);
        this.sending.set(false);
        // Escribir manualmente pausa al agente en el backend: reflejarlo ya.
        if (conv.autoReply) this.upsertConv({ ...conv, autoReply: false });
        if (msg.status === 'failed') this.toast.error('El mensaje no pudo entregarse');
        this.scrollToBottom();
      },
      error: err => {
        this.sending.set(false);
        this.toast.error(err.error?.message || 'No se pudo enviar el mensaje');
      },
    });
  }

  // ── Adjuntos ──

  pick(kind: 'media' | 'doc' | 'audio') {
    this.attachOpen.set(false);
    const input = kind === 'media' ? this.mediaInput() : kind === 'doc' ? this.docInput() : this.audioInput();
    input?.nativeElement.click();
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadFile(file, file.name);
  }

  private uploadFile(file: Blob, filename: string) {
    this.uploading.set(true);
    const fd = new FormData();
    fd.append('file', file, filename);
    this.http.post<{ url: string; key: string; contentType: string; size: number }>(
      `${API}/upload?folder=whatsapp`, fd,
    ).subscribe({
      next: r => {
        this.attachment.set({
          url: r.url,
          key: r.key,
          type: this.typeFromMime(r.contentType),
          mimeType: r.contentType,
          filename,
          size: r.size,
        });
        this.uploading.set(false);
      },
      error: err => {
        this.uploading.set(false);
        this.toast.error(err.error?.message || 'No se pudo subir el archivo');
      },
    });
  }

  clearAttachment() { this.attachment.set(null); }

  attachIcon(type: MsgType) {
    if (type === 'video') return this.Video;
    if (type === 'audio' || type === 'voice') return this.Mic;
    return this.FileText;
  }

  private typeFromMime(mime: string): MsgType {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  // ── Nota de voz ──

  async startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.toast.error('Tu navegador no soporta grabación de audio');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.releaseStream();
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        this.uploadFile(blob, `nota-de-voz-${Date.now()}.${ext}`);
      };
      this.mediaRecorder.start();
      this.recording.set(true);
      this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => this.recordingSeconds.update(s => s + 1), 1000);
    } catch {
      this.toast.error('No se pudo acceder al micrófono');
    }
  }

  stopRecording() {
    this.mediaRecorder?.stop();
    this.recording.set(false);
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
  }

  cancelRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.ondataavailable = null;
      if (this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
    }
    this.releaseStream();
    this.recording.set(false);
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
  }

  private releaseStream() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  private stopAllRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.releaseStream();
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    this.recording.set(false);
  }

  // ── Tiempo real ──

  /**
   * La bandeja no abre su propio websocket: escucha el compartido, que ya está
   * conectado desde el shell y alimenta también la insignia del menú.
   */
  private listenRealtime() {
    this.realtime.connect();

    this.realtime.messageNew$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(raw => {
      const msg = raw as unknown as Msg;
      if (msg.conversationId === this.selectedId()) {
        this.upsertMessage(msg);
        this.scrollToBottom();
        if (msg.direction === 'in') this.markRead(msg.conversationId);
      }
    });

    this.realtime.messageUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(raw => {
      const msg = raw as unknown as Msg;
      if (msg.conversationId === this.selectedId()) this.upsertMessage(msg);
    });

    this.realtime.conversationUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(raw =>
      this.upsertConv(raw as unknown as Conv),
    );

    this.realtime.typing$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      if (p.conversationId === this.selectedId()) this.typing.set(p.typing);
    });
  }

  private upsertConv(conv: Conv) {
    // El socket es por tenant: llegan los eventos de todas las cuentas conectadas.
    // Si hay una cuenta seleccionada, ignora los de las demás.
    const account = this.accountId();
    if (account && conv.accountId !== account) return;
    this.conversations.update(list => {
      const next = list.some(c => c._id === conv._id)
        ? list.map(c => (c._id === conv._id ? { ...c, ...conv } : c))
        : [conv, ...list];
      return [...next].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
    });
  }

  private upsertMessage(msg: Msg) {
    this.messages.update(list =>
      list.some(m => m._id === msg._id)
        ? list.map(m => (m._id === msg._id ? msg : m))
        : [...list, msg],
    );
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ── Formato ──

  displayName(c: Conv) {
    return c.contactName?.trim() || (c.channel === 'instagram' ? 'Instagram DM' : `+${c.contact}`);
  }

  initials(c: Conv) {
    const name = c.contactName?.trim();
    if (name) {
      return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
    }
    return c.contact.slice(-2);
  }

  shortTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  dayLabel(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatSeconds(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  formatSize(bytes?: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  mapsUrl(m: Msg) {
    return `https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`;
  }
}
