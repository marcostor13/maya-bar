import { Component, OnDestroy, effect, inject, input, model, signal, untracked } from '@angular/core';
import {
  LucideAngularModule, Image, Mic, Camera, FileText, StopCircle, Upload, Info, XCircle,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import { CampaignChannel, CampaignMediaType } from '../../shared/models/campaign.model';

/** Sección multimedia del editor de campañas: subida, cámara, grabación de audio y documentos. */
@Component({
  selector: 'app-campaign-media',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <!-- WAHA: expanded media section -->
    @if (channel() === 'waha') {
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

        @if (mediaUrl() && ['image','video'].includes(mediaType()) && mediaTab() === 'media') {
          <div class="media-preview">
            @if (mediaType() === 'image') {
              <img [src]="mediaUrl()" class="media-thumb" alt="preview" />
            } @else {
              <video [src]="mediaUrl()" class="media-thumb" controls></video>
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
          @if (mediaUrl() && mediaType() === 'audio') {
            <div style="margin-top:8px">
              <audio [src]="mediaUrl()" controls style="width:100%;border-radius:8px"></audio>
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
          @if (mediaUrl() && mediaType() === 'document') {
            <div class="doc-preview-box">
              <lucide-icon [img]="FileText" [size]="28" style="color:var(--color-brand)"></lucide-icon>
              <span style="font-size:13px;word-break:break-all">{{ mediaUrl().split('/').pop() }}</span>
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
    @if (channel() === 'email') {
      <div class="field">
        <label class="label">Imagen o video (opcional)</label>
        @if (mediaUrl() && (mediaType() === 'image' || mediaType() === 'video')) {
          <div class="media-preview">
            @if (mediaType() === 'image') {
              <img [src]="mediaUrl()" class="media-thumb" alt="preview" />
            } @else {
              <video [src]="mediaUrl()" class="media-thumb" controls></video>
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
  `,
  styles: [`
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }

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

    @media (max-width: 768px) {
      .media-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .media-tab { flex: 0 0 auto; white-space: nowrap; }
    }
  `],
})
export class CampaignMediaComponent implements OnDestroy {
  private api = inject(CampaignsApiService);
  private toast = inject(ToastService);

  readonly Image = Image; readonly Mic = Mic; readonly Camera = Camera;
  readonly FileText = FileText; readonly StopCircle = StopCircle;
  readonly Upload = Upload; readonly Info = Info; readonly XCircle = XCircle;

  channel = input.required<CampaignChannel>();
  mediaUrl = model('');
  mediaType = model<CampaignMediaType>('image');

  mediaTab = signal<'media' | 'audio' | 'document'>('media');
  uploadingMedia = signal(false);
  recording = signal(false);
  recordingSeconds = signal(0);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private currentStream: MediaStream | null = null;

  constructor() {
    // Al cambiar de canal se vuelve a la pestaña por defecto y se corta la grabación (igual que setChannel original).
    effect(() => {
      this.channel();
      untracked(() => { this.mediaTab.set('media'); this.stopAllRecording(); });
    });
  }

  ngOnDestroy() { this.stopAllRecording(); }

  clearMedia() { this.mediaUrl.set(''); this.mediaType.set('image'); }

  // --- Media upload ---
  onMediaFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.mediaType.set(file.type.startsWith('video/') ? 'video' : 'image');
    this.doUpload(file, { error: 'Error al subir archivo' });
  }

  onCameraFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.mediaType.set('image');
    this.doUpload(file, { error: 'Error al subir imagen' });
  }

  onAudioFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.doUpload(file, { type: 'audio', error: 'Error al subir audio' });
  }

  onDocFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.doUpload(file, { type: 'document', error: 'Error al subir archivo' });
  }

  private doUpload(file: Blob, opts: { type?: CampaignMediaType; error: string; success?: string; filename?: string }) {
    this.uploadingMedia.set(true);
    this.api.upload(file, opts.filename).subscribe({
      next: (r) => {
        this.mediaUrl.set(r.url);
        if (opts.type) this.mediaType.set(opts.type);
        this.uploadingMedia.set(false);
        if (opts.success) this.toast.success(opts.success);
      },
      error: () => { this.toast.error(opts.error); this.uploadingMedia.set(false); },
    });
  }

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
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    this.doUpload(blob, {
      type: 'audio',
      error: 'Error al subir audio grabado',
      success: 'Audio grabado y subido',
      filename: `audio-${Date.now()}.${ext}`,
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
}
