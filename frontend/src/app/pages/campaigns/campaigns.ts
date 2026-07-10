import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Plus, Send, Edit2, Trash2, Megaphone, Mail, MessageSquare,
  CheckCircle2, Clock, AlertCircle, Copy, X, Users, Zap, List, Search, Image, Video, XCircle,
  RotateCcw, Mic, Camera, FileText, StopCircle, DollarSign, RefreshCw, Upload, Info, Layout,
  Wand2, Eye
} from 'lucide-angular';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface ContactList {
  _id: string;
  name: string;
  type: 'static' | 'dynamic';
  memberCount: number;
  color: string;
}

interface CampaignEstimate {
  recipientCount: number;
  estimatedMinutes: number;
  dailyLimit: number;
  sentToday: number;
  remaining: number;
  cloudApiPricePerMsg?: number;
}

interface Campaign {
  _id: string;
  name: string;
  type: 'email' | 'whatsapp';
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting: 'all' | 'tags' | 'lists';
  recipientTags: string[];
  listIds: string[];
  recipientCount: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  templateName?: string;
  templateLanguage?: string;
  templateVars?: string[];
}

interface WaTemplate {
  _id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  body: string;
  headerText?: string;
  footer?: string;
}

const PRESET_TAGS = ['VIP', 'Vegetariano', 'Cumpleañero', 'Corporativo', 'Delivery', 'Fiel', 'Nuevo', 'Alérgico'];

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Campañas</h1>
          <p class="page-subtitle">Email y WhatsApp para tus clientes</p>
        </div>
        <button class="btn btn-primary btn-lg" (click)="openDrawer()">
          <lucide-icon [img]="Plus" [size]="18"></lucide-icon>
          Nueva Campaña
        </button>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-value">{{ campaigns().length }}</div><div class="stat-label">Total campañas</div></div>
        <div class="stat-card"><div class="stat-value">{{ sentCount() }}</div><div class="stat-label">Enviadas</div></div>
        <div class="stat-card"><div class="stat-value">{{ draftCount() }}</div><div class="stat-label">Borradores</div></div>
        <div class="stat-card"><div class="stat-value">{{ totalRecipients() }}</div><div class="stat-label">Destinatarios totales</div></div>
      </div>

      <div class="filter-bar">
        <div class="status-tabs">
          <button class="status-tab" [class.active]="statusFilter() === 'all'" (click)="statusFilter.set('all')">
            Todas <span class="tab-count">{{ campaigns().length }}</span>
          </button>
          <button class="status-tab" [class.active]="statusFilter() === 'draft'" (click)="statusFilter.set('draft')">
            Borradores <span class="tab-count">{{ draftCount() }}</span>
          </button>
          <button class="status-tab" [class.active]="statusFilter() === 'sent'" (click)="statusFilter.set('sent')">
            Enviadas <span class="tab-count">{{ sentCount() }}</span>
          </button>
        </div>
        <div class="search-wrap">
          <lucide-icon [img]="Search" [size]="15" class="search-icon"></lucide-icon>
          <input class="input search-input" placeholder="Buscar campaña..."
            (input)="searchQuery.set($any($event.target).value)" [value]="searchQuery()" />
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        @if (loading()) {
          <div class="empty-state">
            <lucide-icon [img]="Megaphone" [size]="40" style="color:var(--color-text-muted);opacity:.4"></lucide-icon>
            <p style="color:var(--color-text-muted)">Cargando...</p>
          </div>
        } @else if (filteredCampaigns().length === 0) {
          <div class="empty-state">
            <lucide-icon [img]="Megaphone" [size]="48" style="color:var(--color-text-muted);opacity:.3"></lucide-icon>
            <p style="color:var(--color-text-muted);margin-top:12px">{{ campaigns().length === 0 ? 'No hay campañas aún.' : 'Sin resultados.' }}</p>
            @if (campaigns().length === 0) {
              <button class="btn btn-primary btn-sm" (click)="openDrawer()" style="margin-top:16px">Crear primera campaña</button>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Canal</th>
                  <th>Audiencia</th>
                  <th>Estado</th>
                  <th style="text-align:right">Destinatarios</th>
                  <th>Envío</th>
                  <th style="width:180px"></th>
                </tr>
              </thead>
              <tbody>
                @for (c of filteredCampaigns(); track c._id) {
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:8px">
                        <div>
                          <div class="campaign-name">{{ c.name }}</div>
                          @if (c.subject) {
                            <div class="campaign-subject">{{ c.subject }}</div>
                          }
                          @if (c.templateName) {
                            <div class="campaign-subject" style="font-family:monospace">{{ c.templateName }}</div>
                          }
                        </div>
                        @if (c.mediaUrl) {
                          <span class="media-indicator" [title]="mediaTitle(c)">
                            <lucide-icon [img]="mediaIcon(c)" [size]="12"></lucide-icon>
                          </span>
                        }
                      </div>
                    </td>
                    <td>
                      <span class="type-badge"
                        [class.type-email]="channelOf(c) === 'email'"
                        [class.type-wa]="channelOf(c) === 'waha'"
                        [class.type-cloud]="channelOf(c) === 'cloudapi'">
                        <lucide-icon [img]="channelOf(c) === 'email' ? Mail : MessageSquare" [size]="12"></lucide-icon>
                        {{ channelLabel(c) }}
                      </span>
                    </td>
                    <td class="audience-cell">
                      @if (c.targeting === 'lists' && c.listIds.length) {
                        <div class="audience-badges">
                          @for (lid of c.listIds.slice(0,2); track lid) {
                            <span class="badge-list" [style.background]="listColor(lid) + '22'" [style.color]="listColor(lid)">{{ listName(lid) }}</span>
                          }
                          @if (c.listIds.length > 2) {
                            <span class="badge-list" style="background:var(--color-bg-app);color:var(--color-text-muted)">+{{ c.listIds.length - 2 }}</span>
                          }
                        </div>
                      } @else if (c.targeting !== 'all' && c.recipientTags.length) {
                        <div class="audience-badges">
                          @for (tag of c.recipientTags.slice(0,3); track tag) {
                            <span class="badge-secondary" style="font-size:11px">{{ tag }}</span>
                          }
                          @if (c.recipientTags.length > 3) {
                            <span class="badge-secondary" style="font-size:11px">+{{ c.recipientTags.length - 3 }}</span>
                          }
                        </div>
                      } @else {
                        <span class="all-label">Todos los clientes</span>
                      }
                    </td>
                    <td>
                      <span class="status-badge status-{{ c.status }}">
                        <lucide-icon [img]="statusIcon(c.status)" [size]="12"></lucide-icon>
                        {{ statusLabel(c.status) }}
                      </span>
                      @if (c.errorMessage) {
                        <div class="error-msg" [title]="c.errorMessage">
                          <lucide-icon [img]="AlertCircle" [size]="11"></lucide-icon>
                          {{ c.errorMessage.length > 40 ? c.errorMessage.slice(0,40) + '…' : c.errorMessage }}
                        </div>
                      }
                    </td>
                    <td style="text-align:right;font-weight:700;font-size:15px;color:var(--color-text-main)">
                      {{ c.status === 'draft' ? '—' : (c.recipientCount || 0) }}
                    </td>
                    <td class="date-cell">{{ c.sentAt ? formatDate(c.sentAt) : '—' }}</td>
                    <td>
                      <div class="row-actions">
                        @if (c.status === 'sending') {
                          <span style="font-size:12px;color:var(--color-text-muted)">Enviando...</span>
                        } @else {
                          <button class="btn btn-icon btn-ghost btn-sm" (click)="openDrawer(c)" title="Editar">
                            <lucide-icon [img]="Edit2" [size]="14"></lucide-icon>
                          </button>
                          @if (c.status === 'draft') {
                            @if (channelOf(c) === 'waha') {
                              <button class="btn btn-icon btn-ghost btn-sm" (click)="copyWhatsApp(c)" title="Copiar mensaje">
                                <lucide-icon [img]="Copy" [size]="14"></lucide-icon>
                              </button>
                            }
                            <button class="btn btn-sm btn-primary" (click)="sendCampaign(c)">
                              <lucide-icon [img]="Send" [size]="13"></lucide-icon>
                              Enviar
                            </button>
                          } @else {
                            <button class="btn btn-sm btn-secondary" (click)="resendCampaign(c)">
                              <lucide-icon [img]="RotateCcw" [size]="13"></lucide-icon>
                              Reenviar
                            </button>
                          }
                          <button class="btn btn-icon btn-ghost btn-sm action-delete" (click)="deleteCampaign(c)" title="Eliminar">
                            <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="table-footer">{{ filteredCampaigns().length }} campaña(s)</div>
        }
      </div>
    </div>

    @if (drawerOpen()) {
      <div class="overlay" (click)="closeDrawer()"></div>
      <div class="drawer">
        <div class="drawer-header">
          <h2 class="drawer-title">{{ editingId() ? 'Editar campaña' : 'Nueva campaña' }}</h2>
          <button class="btn btn-icon btn-ghost" (click)="closeDrawer()">
            <lucide-icon [img]="X" [size]="20"></lucide-icon>
          </button>
        </div>
        <div class="drawer-body">
          @if (formError()) {
            <div class="form-error-box">{{ formError() }}</div>
          }

          <!-- Name -->
          <div class="field">
            <label class="label">Nombre de la campaña *</label>
            <input class="input" [(ngModel)]="form.name" placeholder="Ej: Promo Verano 2026" />
          </div>

          <!-- Channel tabs -->
          <div class="field">
            <label class="label">Canal *</label>
            <div class="channel-tabs">
              <button type="button" class="channel-tab" [class.active]="form.channel === 'email'" (click)="setChannel('email')">
                <lucide-icon [img]="Mail" [size]="14"></lucide-icon>
                Email
              </button>
              <button type="button" class="channel-tab" [class.active]="form.channel === 'waha'" (click)="setChannel('waha')">
                <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
                WhatsApp WAHA
              </button>
              <button type="button" class="channel-tab channel-tab-cloud" [class.active]="form.channel === 'cloudapi'" (click)="setChannel('cloudapi')">
                <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
                Cloud API
              </button>
            </div>
          </div>

          <!-- Email: subject + editor -->
          @if (form.channel === 'email') {
            <div class="field">
              <label class="label">Asunto del email</label>
              <input class="input" [(ngModel)]="form.subject" placeholder="Ej: ¡Oferta exclusiva para ti!" />
            </div>

            <div class="field">
              <div class="email-toolbar">
                <div class="email-mode-tabs">
                  <button type="button" class="email-tab" [class.active]="emailMode() === 'manual'" (click)="emailMode.set('manual')">
                    <lucide-icon [img]="Edit2" [size]="13"></lucide-icon>
                    Manual
                  </button>
                  <button type="button" class="email-tab" [class.active]="emailMode() === 'ai'" (click)="emailMode.set('ai')">
                    <lucide-icon [img]="Wand2" [size]="13"></lucide-icon>
                    Generar con IA
                  </button>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" (click)="openEmailPreview()">
                  <lucide-icon [img]="Eye" [size]="13"></lucide-icon>
                  Vista previa
                </button>
              </div>

              @if (emailMode() === 'ai') {
                <div class="ai-box">
                  <div style="display:flex;flex-direction:column;gap:4px">
                    <label class="label" style="font-size:12px">¿Sobre qué es esta campaña?</label>
                    <textarea class="textarea" [(ngModel)]="aiTopic" rows="3"
                      placeholder="Ej: Promo de verano — 20% descuento en cócteles durante enero, para clientes frecuentes..."></textarea>
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <select class="select" [(ngModel)]="aiTone" style="flex:1;min-width:160px">
                      <option value="amigable">Amigable y cercano</option>
                      <option value="profesional">Profesional</option>
                      <option value="exclusivo">Exclusivo / premium</option>
                      <option value="urgente">Urgente / llamada a acción</option>
                    </select>
                    <button type="button" class="btn btn-primary btn-sm" (click)="generateEmailWithAI()"
                      [disabled]="aiGenerating() || !aiTopic.trim()">
                      <lucide-icon [img]="Wand2" [size]="13" [class.spin]="aiGenerating()"></lucide-icon>
                      {{ aiGenerating() ? 'Generando…' : 'Generar email' }}
                    </button>
                  </div>
                </div>
              }

              <label class="label">Cuerpo del email *</label>
              <textarea class="textarea" [(ngModel)]="form.body" rows="8"
                placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
              <span style="font-size:11px;color:var(--color-text-muted);margin-top:2px">
                Usa &#123;nombre&#125; para personalizar. La vista previa usa "María" como ejemplo.
              </span>
            </div>
          }

          <!-- Cloud API: Template section -->
          @if (form.channel === 'cloudapi') {
            <div class="field">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <label class="label" style="margin:0">Plantilla aprobada</label>
                <button type="button" class="btn btn-ghost btn-sm" (click)="syncTemplates()" [disabled]="templatesLoading()">
                  <lucide-icon [img]="RefreshCw" [size]="12" [class.spin]="templatesLoading()"></lucide-icon>
                  Sincronizar
                </button>
              </div>
              @if (templatesLoading()) {
                <div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:13px">Cargando plantillas...</div>
              } @else if (templates().length === 0) {
                <div class="info-note">
                  <lucide-icon [img]="Info" [size]="13"></lucide-icon>
                  No hay plantillas. Ve a Configuración → Plantillas WhatsApp y sincroniza desde Meta.
                </div>
              } @else {
                <div class="templates-picker">
                  @for (t of templates(); track t._id) {
                    <div class="tpl-card" [class.selected]="form.templateName === t.name" (click)="selectTemplate(t)">
                      <div class="tpl-card-head">
                        <span class="tpl-card-name">{{ t.name }}</span>
                        <span class="tpl-card-status tpl-status-{{ t.status.toLowerCase() }}">{{ t.status }}</span>
                      </div>
                      <div class="tpl-card-body">{{ t.body.substring(0,100) }}{{ t.body.length > 100 ? '…' : '' }}</div>
                      <div class="tpl-card-meta">{{ t.language }} · {{ t.category }}</div>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Template vars -->
            @if (templateVarCount() > 0) {
              <div class="field">
                <label class="label">Variables de la plantilla</label>
                <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">
                  Usa <code style="background:var(--color-bg-app);padding:1px 5px;border-radius:4px">&#123;nombre&#125;</code> para personalizar con el nombre del cliente.
                </div>
                @for (i of varIndexes(); track i) {
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <span class="var-tag">{{ '{{' + (i+1) + '}}' }}</span>
                    <input class="input" [(ngModel)]="form.templateVars[i]" [placeholder]="'Valor para ' + '{{' + (i+1) + '}}'" />
                  </div>
                }
              </div>
            }

            <!-- Pricing preview -->
            @if (form.templateName && selectedTemplate()) {
              <div class="pricing-box">
                <lucide-icon [img]="DollarSign" [size]="16" style="color:#059669;flex-shrink:0"></lucide-icon>
                <div>
                  <div class="pricing-label">Costo estimado</div>
                  <div class="pricing-value">{{ cloudApiPriceEstimate() }}</div>
                </div>
              </div>
            }
          }

          <!-- Body: waha or cloud without template (email handled above) -->
          @if (form.channel !== 'email' && (form.channel !== 'cloudapi' || !form.templateName)) {
            <div class="field">
              <label class="label">{{ form.channel === 'cloudapi' ? 'Mensaje (libre, solo dentro de ventana 24h)' : 'Mensaje *' }}</label>
              <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px">
                Usa <code style="background:var(--color-bg-app);padding:1px 5px;border-radius:4px">&#123;nombre&#125;</code> para personalizar.
              </div>
              <textarea class="textarea" [(ngModel)]="form.body" rows="5"
                placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
            </div>
          }

          <!-- WAHA: expanded media section -->
          @if (form.channel === 'waha') {
            <div class="field">
              <label class="label">Multimedia (opcional)</label>
              <div class="media-tabs">
                <button type="button" class="media-tab" [class.active]="mediaTab() === 'media'" (click)="mediaTab.set('media')">
                  <lucide-icon [img]="Image" [size]="13"></lucide-icon>
                  Imagen / Video
                </button>
                <button type="button" class="media-tab" [class.active]="mediaTab() === 'audio'" (click)="mediaTab.set('audio')">
                  <lucide-icon [img]="Mic" [size]="13"></lucide-icon>
                  Audio
                </button>
                <button type="button" class="media-tab" [class.active]="mediaTab() === 'document'" (click)="mediaTab.set('document')">
                  <lucide-icon [img]="FileText" [size]="13"></lucide-icon>
                  Documento
                </button>
              </div>

              @if (form.mediaUrl && ['image','video'].includes(form.mediaType) && mediaTab() === 'media') {
                <div class="media-preview">
                  @if (form.mediaType === 'image') {
                    <img [src]="form.mediaUrl" class="media-thumb" alt="preview" />
                  } @else {
                    <video [src]="form.mediaUrl" class="media-thumb" controls></video>
                  }
                  <button class="btn btn-icon btn-ghost media-clear" type="button" (click)="clearMedia()">
                    <lucide-icon [img]="XCircle" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  </button>
                </div>
              } @else if (mediaTab() === 'media') {
                <div style="display:flex;flex-direction:column;gap:10px">
                  <label class="upload-zone" [class.uploading]="uploadingMedia()">
                    <input type="file" accept="image/*,video/*" (change)="onMediaFile($event)" style="display:none" />
                    <lucide-icon [img]="Image" [size]="24" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                    <span style="font-size:13px;color:var(--color-text-muted)">{{ uploadingMedia() ? 'Subiendo…' : 'Subir imagen o video' }}</span>
                    <span style="font-size:11px;color:var(--color-text-muted)">JPG, PNG, MP4 · hasta 200 MB</span>
                  </label>
                  <div style="display:flex;gap:8px;align-items:center">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="cameraInput.click()">
                      <lucide-icon [img]="Camera" [size]="14"></lucide-icon>
                      Capturar foto
                    </button>
                    <input #cameraInput type="file" accept="image/*" capture="environment" style="display:none" (change)="onCameraFile($event)" />
                  </div>
                </div>
              }

              @if (mediaTab() === 'audio') {
                @if (form.mediaUrl && form.mediaType === 'audio') {
                  <div style="margin-top:8px">
                    <audio [src]="form.mediaUrl" controls style="width:100%;border-radius:8px"></audio>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="clearMedia()" style="margin-top:6px">
                      <lucide-icon [img]="XCircle" [size]="13"></lucide-icon>
                      Quitar audio
                    </button>
                  </div>
                } @else if (recording()) {
                  <div class="recorder-active">
                    <div class="rec-dot"></div>
                    <span class="rec-time">{{ formatRecordingTime(recordingSeconds()) }}</span>
                    <button type="button" class="btn btn-danger btn-sm" (click)="stopRecording()">
                      <lucide-icon [img]="StopCircle" [size]="14"></lucide-icon>
                      Detener
                    </button>
                  </div>
                } @else {
                  <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
                    <button type="button" class="btn btn-secondary" (click)="startRecording()" [disabled]="uploadingMedia()">
                      <lucide-icon [img]="Mic" [size]="16"></lucide-icon>
                      Grabar audio
                    </button>
                    <label class="upload-zone compact" [class.uploading]="uploadingMedia()">
                      <input type="file" accept="audio/*" (change)="onAudioFile($event)" style="display:none" />
                      <lucide-icon [img]="Upload" [size]="18" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                      <span style="font-size:13px;color:var(--color-text-muted)">{{ uploadingMedia() ? 'Subiendo…' : 'O sube un archivo de audio' }}</span>
                    </label>
                  </div>
                }
                <div class="info-note" style="margin-top:10px">
                  <lucide-icon [img]="Info" [size]="12"></lucide-icon>
                  WAHA gratuito enviará el audio como enlace de texto. WAHA Plus lo envía como nota de voz nativa.
                </div>
              }

              @if (mediaTab() === 'document') {
                @if (form.mediaUrl && form.mediaType === 'document') {
                  <div class="doc-preview-box">
                    <lucide-icon [img]="FileText" [size]="28" style="color:var(--color-brand)"></lucide-icon>
                    <span style="font-size:13px;word-break:break-all">{{ form.mediaUrl.split('/').pop() }}</span>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="clearMedia()">
                      <lucide-icon [img]="XCircle" [size]="13"></lucide-icon>
                    </button>
                  </div>
                } @else {
                  <label class="upload-zone" [class.uploading]="uploadingMedia()" style="margin-top:8px">
                    <input type="file" (change)="onDocFile($event)" style="display:none" />
                    <lucide-icon [img]="FileText" [size]="28" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                    <span style="font-size:13px;color:var(--color-text-muted)">{{ uploadingMedia() ? 'Subiendo…' : 'Subir cualquier archivo' }}</span>
                    <span style="font-size:11px;color:var(--color-text-muted)">PDF, Word, Excel, ZIP y más · hasta 200 MB</span>
                  </label>
                }
                <div class="info-note" style="margin-top:10px">
                  <lucide-icon [img]="Info" [size]="12"></lucide-icon>
                  WAHA gratuito enviará el documento como enlace de texto. WAHA Plus lo envía como archivo adjunto nativo.
                </div>
              }
            </div>
          }

          <!-- Email: image/video only -->
          @if (form.channel === 'email') {
            <div class="field">
              <label class="label">Imagen o video (opcional)</label>
              @if (form.mediaUrl && (form.mediaType === 'image' || form.mediaType === 'video')) {
                <div class="media-preview">
                  @if (form.mediaType === 'image') {
                    <img [src]="form.mediaUrl" class="media-thumb" alt="preview" />
                  } @else {
                    <video [src]="form.mediaUrl" class="media-thumb" controls></video>
                  }
                  <button class="btn btn-icon btn-ghost media-clear" type="button" (click)="clearMedia()">
                    <lucide-icon [img]="XCircle" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  </button>
                </div>
              } @else {
                <label class="upload-zone" [class.uploading]="uploadingMedia()">
                  <input type="file" accept="image/*,video/*" (change)="onMediaFile($event)" style="display:none" />
                  <lucide-icon [img]="Image" [size]="24" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <span style="font-size:13px;color:var(--color-text-muted)">{{ uploadingMedia() ? 'Subiendo…' : 'Haz clic para subir imagen o video' }}</span>
                  <span style="font-size:11px;color:var(--color-text-muted)">Imágenes hasta 10 MB · Videos hasta 200 MB</span>
                </label>
              }
            </div>
          }

          <!-- Targeting -->
          <div class="field">
            <label class="label">Destinatarios</label>
            <div class="targeting-tabs">
              <button type="button" class="targeting-tab" [class.active]="form.targeting === 'all'" (click)="setTargeting('all')">Todos los clientes</button>
              <button type="button" class="targeting-tab" [class.active]="form.targeting === 'tags'" (click)="setTargeting('tags')">Por etiquetas</button>
              <button type="button" class="targeting-tab" [class.active]="form.targeting === 'lists'" (click)="setTargeting('lists')">Por listas</button>
            </div>

            @if (form.targeting === 'tags') {
              <div class="tag-chips" style="margin-top:12px">
                @for (tag of PRESET_TAGS; track tag) {
                  <button type="button" class="tag-chip" [class.selected]="isTagSelected(tag)" (click)="toggleTag(tag)">{{ tag }}</button>
                }
              </div>
            }

            @if (form.targeting === 'lists') {
              <div class="lists-selector">
                @if (availableLists().length === 0) {
                  <div style="font-size:13px;color:var(--color-text-muted);padding:12px;text-align:center">
                    No hay listas. <a routerLink="/lists" style="color:var(--color-brand)">Crear lista</a>
                  </div>
                } @else {
                  @for (l of availableLists(); track l._id) {
                    <label class="list-option" [class.selected]="isListSelected(l._id)">
                      <input type="checkbox" [checked]="isListSelected(l._id)" (change)="toggleList(l._id)" style="display:none" />
                      <div class="list-dot" [style.background]="l.color"></div>
                      <div style="flex:1">
                        <div style="font-weight:600;font-size:13px">{{ l.name }}</div>
                        <div style="font-size:11px;color:var(--color-text-muted)">{{ l.type === 'dynamic' ? 'Dinámica' : 'Estática' }} · {{ l.memberCount }} miembros</div>
                      </div>
                      @if (isListSelected(l._id)) {
                        <lucide-icon [img]="CheckCircle2" [size]="16" style="color:var(--color-brand)"></lucide-icon>
                      }
                    </label>
                  }
                }
              </div>
            }
          </div>

          @if (previewCount() !== null) {
            <div class="preview-count-box">
              <lucide-icon [img]="Users" [size]="16"></lucide-icon>
              <span>{{ previewLabel() }}</span>
            </div>
          }
        </div>
        <div class="drawer-footer">
          <button class="btn btn-ghost" (click)="closeDrawer()">Cancelar</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Guardando...' : 'Guardar borrador' }}
          </button>
        </div>
      </div>
    }

    <!-- Email preview modal -->
    @if (emailPreviewOpen()) {
      <div class="overlay" (click)="emailPreviewOpen.set(false)" style="z-index:200">
        <div class="email-preview-modal" (click)="$event.stopPropagation()">
          <div class="email-preview-header">
            <div style="min-width:0;flex:1">
              <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Asunto</div>
              <div style="font-size:15px;font-weight:700;color:var(--color-text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                {{ form.subject || '(sin asunto)' }}
              </div>
            </div>
            <button class="btn btn-icon btn-ghost" (click)="emailPreviewOpen.set(false)">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="email-preview-scroll">
            <div [innerHTML]="emailPreviewHtml()"></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 20px 24px; }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--color-text-main); font-family: var(--font-heading); }
    .stat-label { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; }

    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 64px 24px; }

    .type-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill);
    }
    .type-email { background: #EFF6FF; color: #2563EB; }
    .type-wa    { background: #F0FDF4; color: #16A34A; }
    .type-cloud { background: #F5F3FF; color: #7C3AED; }

    .status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill);
    }
    .status-draft   { background: var(--color-bg-app); color: var(--color-text-muted); }
    .status-sending { background: #FEF9C3; color: #854D0E; }
    .status-sent    { background: #F0FDF4; color: #16A34A; }
    .status-failed  { background: #FEF2F2; color: var(--color-error); }

    .overlay {
      position: fixed; inset: 0;
      background: rgba(15,23,42,.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .drawer {
      position: fixed; top: 0; right: 0; height: 100vh; width: 520px;
      background: var(--color-white); box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; z-index: 101;
      animation: slideIn var(--transition-spring);
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }
    .drawer-footer { padding: 20px 28px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .form-error-box { background: #FEF2F2; border: 1px solid #FECACA; color: var(--color-error); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 14px; }

    /* Channel tabs */
    .channel-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .channel-tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 12px; border: none; background: transparent;
      font-size: 13px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .channel-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .channel-tab.active { background: var(--color-brand); color: #fff; }
    .channel-tab-cloud.active { background: #7C3AED; }

    /* Media tabs */
    .media-tabs { display: flex; border-bottom: 1px solid var(--color-border); margin-bottom: 12px; }
    .media-tab {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 14px; border: none; background: transparent;
      font-size: 12px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: all var(--transition-fast);
    }
    .media-tab:hover { color: var(--color-text-main); }
    .media-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    /* Upload zone */
    .upload-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 24px 16px; border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg); background: var(--color-bg-app);
      cursor: pointer; transition: border-color var(--transition-fast);
    }
    .upload-zone:hover { border-color: var(--color-brand); }
    .upload-zone.uploading { opacity: .6; pointer-events: none; }
    .upload-zone.compact { padding: 16px; }

    /* Media preview */
    .media-preview { position: relative; border-radius: var(--radius-lg); overflow: hidden; background: var(--color-bg-app); border: 1px solid var(--color-border); }
    .media-thumb { width: 100%; max-height: 180px; object-fit: cover; display: block; }
    .media-clear { position: absolute; top: 8px; right: 8px; background: var(--color-white) !important; box-shadow: var(--shadow-sm); border-radius: 50%; }

    .doc-preview-box {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-lg);
      background: var(--color-bg-app); margin-top: 8px;
    }

    /* Audio recorder */
    .recorder-active {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: var(--radius-lg);
      background: #FEF2F2; border: 1px solid #FECACA; margin-top: 8px;
    }
    .rec-dot {
      width: 10px; height: 10px; border-radius: 50%; background: var(--color-error);
      animation: blink 1s ease-in-out infinite; flex-shrink: 0;
    }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
    .rec-time { font-size: 14px; font-weight: 700; font-family: monospace; color: var(--color-error); flex: 1; }

    /* Info note */
    .info-note {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 10px 12px; background: #F0F9FF; border: 1px solid #BAE6FD;
      border-radius: var(--radius-lg); font-size: 12px; color: #0369A1; line-height: 1.5;
    }

    /* Template picker */
    .templates-picker { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
    .tpl-card {
      padding: 12px 14px; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-lg); cursor: pointer; transition: all var(--transition-fast);
    }
    .tpl-card:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .tpl-card-name { font-size: 13px; font-weight: 700; color: var(--color-text-main); font-family: monospace; }
    .tpl-card-body { font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
    .tpl-card-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }
    .tpl-card-status {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
    }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; }

    /* Var tag */
    .var-tag {
      font-size: 12px; font-weight: 700; font-family: monospace;
      padding: 6px 10px; background: var(--color-bg-app); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); white-space: nowrap; color: var(--color-brand);
    }

    /* Pricing box */
    .pricing-box {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; background: #F0FDF4; border: 1px solid #BBF7D0;
      border-radius: var(--radius-lg);
    }
    .pricing-label { font-size: 11px; color: #15803D; font-weight: 600; }
    .pricing-value { font-size: 14px; font-weight: 700; color: #15803D; }

    /* Filter bar */
    .filter-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .status-tabs { display: flex; gap: 4px; }
    .status-tab {
      padding: 7px 14px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); font-size: 13px; font-weight: 600;
      color: var(--color-text-muted); cursor: pointer; transition: all var(--transition-fast);
      display: flex; align-items: center; gap: 6px;
    }
    .status-tab:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .status-tab.active { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }
    .status-tab.active .tab-count { background: rgba(255,255,255,.25); color: #fff; }
    .tab-count { font-size: 11px; background: var(--color-bg-app); border-radius: var(--radius-pill); padding: 1px 6px; }
    .search-wrap { position: relative; min-width: 220px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
    .search-input { padding-left: 36px; }

    /* Table */
    .table-wrap { background: var(--color-white); border: 1px solid var(--color-border); border-radius: 16px; overflow: hidden; }
    .table-wrap table { width: 100%; border-collapse: collapse; }
    .table-wrap th { padding: 13px 16px; text-align: left; font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em; background: var(--color-bg-app); border-bottom: 1px solid var(--color-border); }
    .table-wrap td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); font-size: 14px; vertical-align: middle; }
    .table-wrap tr:last-child td { border-bottom: none; }
    .table-wrap tr:hover td { background: var(--color-bg-app); }
    .table-footer { padding: 12px 20px; font-size: 13px; color: var(--color-text-muted); background: var(--color-bg-app); border: 1px solid var(--color-border); border-top: none; border-radius: 0 0 16px 16px; }

    .campaign-name { font-weight: 600; font-size: 14px; color: var(--color-text-main); }
    .campaign-subject { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
    .audience-cell { max-width: 220px; }
    .audience-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .all-label { font-size: 13px; color: var(--color-text-muted); }
    .date-cell { font-size: 13px; color: var(--color-text-muted); white-space: nowrap; }
    .row-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
    .action-delete { color: var(--color-text-muted) !important; }
    .action-delete:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }

    .media-indicator {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
      border: 1px solid var(--color-border); flex-shrink: 0;
    }
    .error-msg {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--color-error); margin-top: 4px;
      background: #FEF2F2; padding: 2px 8px; border-radius: var(--radius-pill);
      max-width: 200px; cursor: default;
    }
    .badge-list {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: var(--radius-pill);
    }

    /* Targeting */
    .targeting-tabs { display: flex; border-bottom: 1px solid var(--color-border); }
    .targeting-tab {
      padding: 8px 16px; border: none; background: transparent; color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -1px; transition: all var(--transition-fast);
    }
    .targeting-tab:hover { color: var(--color-text-main); }
    .targeting-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    .lists-selector { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .list-option {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-lg);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .list-option:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-option.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

    .tag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-chip {
      padding: 6px 14px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border);
      background: var(--color-white); color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast);
    }
    .tag-chip.selected { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }

    .preview-count-box {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE;
      border-radius: var(--radius-lg); font-size: 14px; color: #1D4ED8;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    /* Email editor */
    .email-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
    .email-mode-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .email-tab {
      display: flex; align-items: center; gap: 5px; padding: 6px 14px; border: none;
      background: transparent; font-size: 12px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .email-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .email-tab.active { background: var(--color-brand); color: #fff; }

    .ai-box {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px 16px; background: #F5F3FF; border: 1px solid #DDD6FE;
      border-radius: var(--radius-lg); margin-bottom: 12px;
    }

    /* Email preview modal */
    .email-preview-modal {
      background: var(--color-white); width: calc(100% - 48px); max-width: 700px;
      max-height: 90vh; border-radius: 24px; overflow: hidden;
      display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
    }
    .email-preview-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .email-preview-scroll { flex: 1; overflow-y: auto; background: #f9fafb; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-wrap: wrap; gap: 12px; }
      .page-header .btn { width: 100%; justify-content: center; }
      .stats-row { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .filter-bar { flex-direction: column; align-items: stretch; }
      .status-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
      .status-tab { flex: 0 0 auto; white-space: nowrap; min-height: 40px; }
      .search-wrap { min-width: 0; width: 100%; }
      .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .table-wrap table { min-width: 800px; }
      .drawer { width: 100%; }
      .drawer-header, .drawer-body, .drawer-footer { padding-left: 18px; padding-right: 18px; }
      .channel-tabs { flex-direction: column; border-radius: var(--radius-lg); }
      .channel-tab { width: 100%; padding: 10px 12px; }
      .media-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .media-tab { flex: 0 0 auto; white-space: nowrap; }
      .targeting-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .targeting-tab { flex: 0 0 auto; white-space: nowrap; }
      .email-toolbar { flex-wrap: wrap; }
      .email-preview-modal { width: calc(100% - 24px); max-height: 85vh; }
      .email-preview-header { padding: 16px 18px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .page-title { font-size: 22px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .stat-card { padding: 14px 16px; }
      .stat-value { font-size: 22px; }
      .templates-picker { max-height: 200px; }
      .ai-box select.select { min-width: 0; width: 100%; }
    }
  `],
})
export class CampaignsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private sanitizer = inject(DomSanitizer);

  readonly Plus = Plus; readonly Send = Send; readonly Edit2 = Edit2;
  readonly Trash2 = Trash2; readonly Megaphone = Megaphone; readonly Mail = Mail;
  readonly MessageSquare = MessageSquare; readonly CheckCircle2 = CheckCircle2;
  readonly Clock = Clock; readonly AlertCircle = AlertCircle; readonly Copy = Copy;
  readonly X = X; readonly Users = Users; readonly Zap = Zap; readonly List = List;
  readonly Search = Search; readonly Image = Image; readonly Video = Video; readonly XCircle = XCircle;
  readonly RotateCcw = RotateCcw; readonly Mic = Mic; readonly Camera = Camera;
  readonly FileText = FileText; readonly StopCircle = StopCircle; readonly DollarSign = DollarSign;
  readonly RefreshCw = RefreshCw; readonly Upload = Upload; readonly Info = Info; readonly Layout = Layout;
  readonly Wand2 = Wand2; readonly Eye = Eye;
  readonly PRESET_TAGS = PRESET_TAGS;

  readonly CLOUD_PRICES: Record<string, number> = { MARKETING: 0.0625, UTILITY: 0.0175, AUTHENTICATION: 0.0250 };

  campaigns = signal<Campaign[]>([]);
  availableLists = signal<ContactList[]>([]);
  templates = signal<WaTemplate[]>([]);
  loading = signal(true);
  drawerOpen = signal(false);
  saving = signal(false);
  uploadingMedia = signal(false);
  editingId = signal<string | null>(null);
  formError = signal('');
  previewCount = signal<number | null>(null);
  statusFilter = signal<'all' | 'draft' | 'sent'>('all');
  searchQuery = signal('');
  templatesLoading = signal(false);
  recording = signal(false);
  recordingSeconds = signal(0);
  selectedTemplate = signal<WaTemplate | null>(null);
  mediaTab = signal<'media' | 'audio' | 'document'>('media');
  emailMode = signal<'manual' | 'ai'>('manual');
  emailPreviewOpen = signal(false);
  emailPreviewHtml = signal<SafeHtml>('' as SafeHtml);
  aiGenerating = signal(false);
  aiTopic = '';
  aiTone = 'amigable';

  form = {
    name: '',
    channel: 'email' as 'email' | 'waha' | 'cloudapi',
    subject: '',
    body: '',
    targeting: 'tags' as 'all' | 'tags' | 'lists',
    recipientTags: [] as string[],
    listIds: [] as string[],
    mediaUrl: '',
    mediaType: 'image' as 'image' | 'video' | 'audio' | 'document',
    templateName: '',
    templateLanguage: 'es',
    templateVars: [] as string[],
  };

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentStream: MediaStream | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  sentCount       = computed(() => this.campaigns().filter(c => c.status === 'sent').length);
  draftCount      = computed(() => this.campaigns().filter(c => c.status === 'draft').length);
  totalRecipients = computed(() => this.campaigns().filter(c => c.status === 'sent').reduce((s, c) => s + (c.recipientCount || 0), 0));

  filteredCampaigns = computed(() => {
    let list = this.campaigns();
    const sf = this.statusFilter();
    const q = this.searchQuery().toLowerCase();
    if (sf !== 'all') list = list.filter(c => c.status === sf);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
    return list;
  });

  previewLabel = computed(() => {
    const n = this.previewCount();
    if (n === null) return '';
    if (n === 0) return 'Sin clientes en este segmento';
    return `${n} cliente${n !== 1 ? 's' : ''} recibirán esta campaña`;
  });

  templateVarCount = computed(() => {
    const t = this.selectedTemplate();
    if (!t) return 0;
    const matches = t.body.match(/\{\{\d+\}\}/g) ?? [];
    if (matches.length === 0) return 0;
    return Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10)));
  });

  varIndexes = computed(() => Array.from({ length: this.templateVarCount() }, (_, i) => i));

  cloudApiPriceEstimate = computed(() => {
    const t = this.selectedTemplate();
    const count = this.previewCount() ?? 0;
    if (!t) return '';
    const price = this.CLOUD_PRICES[t.category] ?? 0.0625;
    if (count === 0) return `$${price.toFixed(4)} USD por conversación (${t.category})`;
    return `~$${(count * price).toFixed(2)} USD para ${count} destinatarios · $${price.toFixed(4)}/conversación (${t.category})`;
  });

  generateEmailWithAI() {
    if (!this.aiTopic.trim()) return;
    this.aiGenerating.set(true);
    this.http.post<{ subject: string; body: string }>(`${API}/campaigns/generate-email`, {
      topic: this.aiTopic,
      tone: this.aiTone,
    }).subscribe({
      next: (data) => {
        this.form.subject = data.subject;
        this.form.body = data.body;
        this.aiGenerating.set(false);
        this.emailMode.set('manual');
        this.toast.success('Email generado — puedes editarlo antes de guardar');
      },
      error: (err: { error?: { message?: string } }) => {
        this.aiGenerating.set(false);
        this.toast.error(err.error?.message || 'Error al generar con IA');
      },
    });
  }

  openEmailPreview() {
    this.emailPreviewHtml.set(
      this.sanitizer.bypassSecurityTrustHtml(this.buildEmailPreviewHtml()),
    );
    this.emailPreviewOpen.set(true);
  }

  private buildEmailPreviewHtml(): string {
    const body = (this.form.body || '').replace(/\{nombre\}/gi, 'María');
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const mediaUrl = this.form.mediaUrl;
    const mediaType = this.form.mediaType;
    const mediaHtml = mediaUrl
      ? mediaType === 'video'
        ? `<div style="text-align:center;margin-bottom:24px;"><video src="${mediaUrl}" controls style="max-width:100%;border-radius:16px;"></video></div>`
        : `<div style="text-align:center;margin-bottom:24px;"><img src="${mediaUrl}" alt="" style="max-width:100%;border-radius:16px;" /></div>`
      : '';
    const bodyHtml = escaped
      ? `<div style="font-size:16px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escaped}</div>`
      : `<div style="font-size:15px;color:#9CA3AF;font-style:italic;">El mensaje aparecerá aquí...</div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;padding:0;background:#f9fafb;}</style>
      </head><body>
      <div style="font-family:'Inter',Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);">
          <div style="padding:40px;">${mediaHtml}${bodyHtml}</div>
          <div style="background:#111827;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 MAYA Platform</p>
          </div>
        </div>
      </div>
    </body></html>`;
  }

  ngOnInit() { this.load(); this.loadLists(); }

  ngOnDestroy() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.stopPolling();
    this.stopAllRecording();
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (!this.campaigns().some(c => c.status === 'sending')) { this.stopPolling(); return; }
      this.http.get<Campaign[]>(`${API}/campaigns`).subscribe({
        next: (data) => {
          this.campaigns.set(data);
          if (!data.some(c => c.status === 'sending')) {
            this.stopPolling();
            this.toast.success('Envío WAHA completado');
          }
        },
      });
    }, 5000);
  }

  private stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.emailPreviewOpen()) { this.emailPreviewOpen.set(false); return; }
    if (this.drawerOpen()) this.closeDrawer();
  }

  loadLists() {
    this.http.get<ContactList[]>(`${API}/lists`).subscribe({
      next: (data) => this.availableLists.set(data),
      error: () => {},
    });
  }

  loadTemplates() {
    if (this.templatesLoading()) return;
    this.templatesLoading.set(true);
    this.http.get<WaTemplate[]>(`${API}/settings/templates`).subscribe({
      next: (data) => { this.templates.set(data); this.templatesLoading.set(false); },
      error: () => this.templatesLoading.set(false),
    });
  }

  syncTemplates() {
    this.templatesLoading.set(true);
    this.http.post<WaTemplate[]>(`${API}/settings/templates/sync`, {}).subscribe({
      next: (data) => { this.templates.set(data); this.templatesLoading.set(false); this.toast.success(`${data.length} plantilla(s) sincronizadas`); },
      error: (err: { error?: { message?: string } }) => { this.templatesLoading.set(false); this.toast.error(err.error?.message || 'Error al sincronizar'); },
    });
  }

  listName(id: string): string { return this.availableLists().find(l => l._id === id)?.name ?? id; }
  listColor(id: string): string { return this.availableLists().find(l => l._id === id)?.color ?? '#6366F1'; }

  channelOf(c: Campaign): 'email' | 'waha' | 'cloudapi' {
    if (c.type === 'email') return 'email';
    return c.waProvider === 'cloudapi' ? 'cloudapi' : 'waha';
  }
  channelLabel(c: Campaign): string {
    const ch = this.channelOf(c);
    if (ch === 'email') return 'Email';
    if (ch === 'cloudapi') return 'WA Cloud';
    return 'WA WAHA';
  }
  mediaIcon(c: Campaign) {
    if (c.mediaType === 'video') return this.Video;
    if (c.mediaType === 'audio') return this.Mic;
    if (c.mediaType === 'document') return this.FileText;
    return this.Image;
  }
  mediaTitle(c: Campaign): string {
    const map: Record<string, string> = { video: 'Video', audio: 'Audio', document: 'Documento', image: 'Imagen' };
    return 'Incluye ' + (map[c.mediaType ?? 'image'] ?? 'media');
  }

  load() {
    this.loading.set(true);
    this.http.get<Campaign[]>(`${API}/campaigns`).subscribe({
      next: (data) => {
        this.campaigns.set(data);
        this.loading.set(false);
        if (data.some(c => c.status === 'sending')) this.startPolling();
      },
      error: () => { this.toast.error('Error al cargar campañas'); this.loading.set(false); },
    });
  }

  openDrawer(c?: Campaign) {
    if (c) {
      const channel = c.type === 'email' ? 'email' : (c.waProvider === 'cloudapi' ? 'cloudapi' : 'waha');
      this.editingId.set(c._id);
      this.form = {
        name: c.name,
        channel,
        subject: c.subject ?? '',
        body: c.body,
        targeting: c.targeting ?? 'tags',
        recipientTags: [...(c.recipientTags ?? [])],
        listIds: [...(c.listIds ?? [])],
        mediaUrl: c.mediaUrl ?? '',
        mediaType: c.mediaType ?? 'image',
        templateName: c.templateName ?? '',
        templateLanguage: c.templateLanguage ?? 'es',
        templateVars: [...(c.templateVars ?? [])],
      };
      if (c.templateName) {
        const found = this.templates().find(t => t.name === c.templateName) ?? null;
        this.selectedTemplate.set(found);
      } else {
        this.selectedTemplate.set(null);
      }
    } else {
      this.editingId.set(null);
      this.form = { name: '', channel: 'email', subject: '', body: '', targeting: 'tags', recipientTags: [], listIds: [], mediaUrl: '', mediaType: 'image', templateName: '', templateLanguage: 'es', templateVars: [] };
      this.selectedTemplate.set(null);
    }
    this.formError.set('');
    this.previewCount.set(null);
    this.mediaTab.set('media');
    this.emailMode.set('manual');
    this.aiTopic = '';
    this.aiTone = 'amigable';
    this.drawerOpen.set(true);
    this.schedulePreview();
    if (this.form.channel === 'cloudapi') this.loadTemplates();
  }

  closeDrawer() {
    this.drawerOpen.set(false);
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.stopAllRecording();
  }

  setChannel(ch: 'email' | 'waha' | 'cloudapi') {
    this.form.channel = ch;
    this.form.mediaUrl = '';
    this.form.mediaType = 'image';
    this.form.templateName = '';
    this.form.templateVars = [];
    this.selectedTemplate.set(null);
    this.mediaTab.set('media');
    this.stopAllRecording();
    if (ch === 'cloudapi') this.loadTemplates();
  }

  selectTemplate(t: WaTemplate) {
    this.form.templateName = t.name;
    this.form.templateLanguage = t.language;
    this.selectedTemplate.set(t);
    const count = Math.max(...(t.body.match(/\{\{\d+\}\}/g) ?? ['{{0}}']).map(m => parseInt(m.replace(/\D/g, ''), 10)));
    const realCount = isFinite(count) ? count : 0;
    this.form.templateVars = Array.from({ length: realCount }, (_, i) => this.form.templateVars[i] ?? '');
  }

  toggleTag(tag: string) {
    const idx = this.form.recipientTags.indexOf(tag);
    if (idx >= 0) this.form.recipientTags.splice(idx, 1);
    else this.form.recipientTags.push(tag);
    this.schedulePreview();
  }
  isTagSelected(tag: string) { return this.form.recipientTags.includes(tag); }

  setTargeting(t: 'all' | 'tags' | 'lists') { this.form.targeting = t; this.schedulePreview(); }

  toggleList(id: string) {
    const idx = this.form.listIds.indexOf(id);
    if (idx >= 0) this.form.listIds.splice(idx, 1);
    else this.form.listIds.push(id);
    this.schedulePreview();
  }
  isListSelected(id: string) { return this.form.listIds.includes(id); }

  private schedulePreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.fetchPreview(), 400);
  }

  private fetchPreview() {
    if (this.form.targeting === 'all') {
      this.http.get<{ count: number }>(`${API}/campaigns/preview`).subscribe({ next: (r) => this.previewCount.set(r.count), error: () => {} });
    } else if (this.form.targeting === 'tags') {
      const tags = this.form.recipientTags.join(',');
      this.http.get<{ count: number }>(`${API}/campaigns/preview${tags ? '?tags=' + tags : ''}`).subscribe({ next: (r) => this.previewCount.set(r.count), error: () => {} });
    } else {
      const total = this.availableLists()
        .filter(l => this.form.listIds.includes(l._id))
        .reduce((s, l) => s + (l.memberCount ?? 0), 0);
      this.previewCount.set(total);
    }
  }

  save() {
    if (!this.form.name.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    const isCloud = this.form.channel === 'cloudapi';
    const hasTemplate = isCloud && !!this.form.templateName;
    if (!hasTemplate && !this.form.body.trim()) { this.formError.set('El mensaje es obligatorio'); return; }
    this.formError.set('');
    this.saving.set(true);

    const isWa = this.form.channel !== 'email';
    const body = hasTemplate ? `[Plantilla: ${this.form.templateName}]` : this.form.body;

    const payload: Record<string, unknown> = {
      name: this.form.name.trim(),
      type: isWa ? 'whatsapp' : 'email',
      waProvider: isWa ? this.form.channel : undefined,
      subject: !isWa ? (this.form.subject.trim() || undefined) : undefined,
      body,
      targeting: this.form.targeting,
      recipientTags: this.form.targeting === 'tags' ? this.form.recipientTags : [],
      listIds: this.form.targeting === 'lists' ? this.form.listIds : [],
    };
    if (this.form.mediaUrl) {
      payload['mediaUrl'] = this.form.mediaUrl;
      payload['mediaType'] = this.form.mediaType;
    }
    if (hasTemplate) {
      payload['templateName'] = this.form.templateName;
      payload['templateLanguage'] = this.form.templateLanguage;
      payload['templateVars'] = this.form.templateVars;
    }

    const req$ = this.editingId()
      ? this.http.patch<Campaign>(`${API}/campaigns/${this.editingId()}`, payload)
      : this.http.post<Campaign>(`${API}/campaigns`, payload);

    req$.subscribe({
      next: () => {
        this.toast.success(this.editingId() ? 'Campaña actualizada' : 'Campaña creada');
        this.saving.set(false);
        this.closeDrawer();
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        const msg = err.error?.message || 'Error al guardar';
        this.formError.set(msg);
        this.toast.error(msg);
        this.saving.set(false);
      },
    });
  }

  async sendCampaign(c: Campaign) {
    const estimate = await this.fetchEstimate(c._id);
    const timeMsg = this.buildEstimateMsg(c, estimate);
    const ok = await this.confirm.confirm({
      title: 'Enviar campaña',
      message: `¿Enviar "${c.name}" a los clientes del segmento?${timeMsg}`,
      confirmText: 'Enviar ahora',
      danger: false,
    });
    if (!ok) return;
    this.http.post<Campaign>(`${API}/campaigns/${c._id}/send`, {}).subscribe({
      next: (updated) => {
        this.campaigns.update(list => list.map(x => x._id === updated._id ? updated : x));
        if (updated.status === 'sending') {
          this.toast.success('Enviando por WAHA en background. Se actualizará automáticamente.');
          this.startPolling();
        } else {
          this.toast.success('Campaña enviada correctamente');
        }
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al enviar'),
    });
  }

  async resendCampaign(c: Campaign) {
    const estimate = await this.fetchEstimate(c._id);
    const timeMsg = this.buildEstimateMsg(c, estimate);
    const ok = await this.confirm.confirm({
      title: 'Reenviar campaña',
      message: `¿Reenviar "${c.name}" al mismo segmento?${timeMsg}`,
      confirmText: 'Reenviar',
      danger: false,
    });
    if (!ok) return;
    this.http.post<Campaign>(`${API}/campaigns/${c._id}/resend`, {}).subscribe({
      next: (updated) => {
        this.campaigns.update(list => list.map(x => x._id === updated._id ? updated : x));
        if (updated.status === 'sending') {
          this.toast.success('Reenviando por WAHA en background. Se actualizará automáticamente.');
          this.startPolling();
        } else {
          this.toast.success('Campaña reenviada');
        }
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al reenviar'),
    });
  }

  private fetchEstimate(id: string): Promise<CampaignEstimate | null> {
    return new Promise(resolve => {
      this.http.get<CampaignEstimate>(`${API}/campaigns/${id}/estimate`).subscribe({
        next: (e) => resolve(e),
        error: () => resolve(null),
      });
    });
  }

  private buildEstimateMsg(c: Campaign, e: CampaignEstimate | null): string {
    if (!e) return '';
    const ch = this.channelOf(c);
    const parts: string[] = [`\n\nDestinatarios: ${e.recipientCount}`];
    if (ch === 'cloudapi') {
      const price = e.cloudApiPricePerMsg ?? 0.0625;
      const total = (e.recipientCount * price).toFixed(2);
      parts.push(`Costo estimado: ~$${total} USD · $${price.toFixed(4)} por conversación.`);
      parts.push(`Tiempo: casi inmediato (Cloud API oficial).`);
    } else if (ch === 'waha') {
      if (e.remaining < e.recipientCount) {
        parts.push(`Límite diario: se enviarán ${e.remaining} de ${e.recipientCount} (${e.sentToday} ya enviados hoy, límite ${e.dailyLimit}).`);
      }
      if (e.remaining > 0) {
        parts.push(`Tiempo estimado: ~${e.estimatedMinutes} min (envío escalonado, 30–60 s entre mensajes).`);
      } else {
        parts.push(`Límite diario alcanzado (${e.dailyLimit} mensajes). Configúralo en Ajustes.`);
      }
    }
    return '\n' + parts.join('\n');
  }

  async deleteCampaign(c: Campaign) {
    const ok = await this.confirm.confirm({ title: 'Eliminar campaña', message: `¿Eliminar "${c.name}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.http.delete(`${API}/campaigns/${c._id}`).subscribe({
      next: () => { this.toast.success('Campaña eliminada'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  copyWhatsApp(c: Campaign) {
    navigator.clipboard.writeText(c.body).then(
      () => this.toast.success('Mensaje copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  // --- Media upload ---
  onMediaFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.form.mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    this.uploadingMedia.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=campaigns`, fd).subscribe({
      next: (r) => { this.form.mediaUrl = r.url; this.uploadingMedia.set(false); },
      error: () => { this.toast.error('Error al subir archivo'); this.uploadingMedia.set(false); },
    });
  }

  onCameraFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.form.mediaType = 'image';
    this.uploadingMedia.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=campaigns`, fd).subscribe({
      next: (r) => { this.form.mediaUrl = r.url; this.uploadingMedia.set(false); },
      error: () => { this.toast.error('Error al subir imagen'); this.uploadingMedia.set(false); },
    });
  }

  onAudioFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingMedia.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=campaigns`, fd).subscribe({
      next: (r) => { this.form.mediaUrl = r.url; this.form.mediaType = 'audio'; this.uploadingMedia.set(false); },
      error: () => { this.toast.error('Error al subir audio'); this.uploadingMedia.set(false); },
    });
  }

  onDocFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingMedia.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=campaigns`, fd).subscribe({
      next: (r) => { this.form.mediaUrl = r.url; this.form.mediaType = 'document'; this.uploadingMedia.set(false); },
      error: () => { this.toast.error('Error al subir archivo'); this.uploadingMedia.set(false); },
    });
  }

  clearMedia() { this.form.mediaUrl = ''; this.form.mediaType = 'image'; }

  // --- Audio recording ---
  async startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) { this.toast.error('Tu navegador no soporta grabación de audio'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.currentStream = stream;
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        if (this.currentStream) { this.currentStream.getTracks().forEach(t => t.stop()); this.currentStream = null; }
        this.uploadAudioBlob(blob);
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

  private uploadAudioBlob(blob: Blob) {
    this.uploadingMedia.set(true);
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const fd = new FormData();
    fd.append('file', blob, `audio-${Date.now()}.${ext}`);
    this.http.post<{ url: string }>(`${API}/upload?folder=campaigns`, fd).subscribe({
      next: (r) => { this.form.mediaUrl = r.url; this.form.mediaType = 'audio'; this.uploadingMedia.set(false); this.toast.success('Audio grabado y subido'); },
      error: () => { this.toast.error('Error al subir audio grabado'); this.uploadingMedia.set(false); },
    });
  }

  private stopAllRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    if (this.currentStream) { this.currentStream.getTracks().forEach(t => t.stop()); this.currentStream = null; }
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    this.recording.set(false);
    this.recordingSeconds.set(0);
  }

  formatRecordingTime(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = { draft: 'Borrador', sending: 'Enviando...', sent: 'Enviada', failed: 'Error' };
    return map[s] ?? s;
  }

  statusIcon(s: string) {
    const map: Record<string, unknown> = { draft: this.Clock, sending: this.Clock, sent: this.CheckCircle2, failed: this.AlertCircle };
    return (map[s] ?? this.Clock) as typeof this.Clock;
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
