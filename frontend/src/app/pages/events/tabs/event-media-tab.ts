import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, FileText, Film, Layers, Plus, Save, X } from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { EventsApiService } from '../../../core/api/events-api.service';
import { MediaFile } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-media-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="media-header">
        <div>
          <h3 class="section-h3">Archivos multimedia</h3>
          <p class="text-muted-sm">Sube imágenes, videos o documentos. Puedes mencionarlos en el prompt de IA para crear el contenido del evento.</p>
        </div>
        <button class="btn btn-secondary" (click)="mediaInput.click()" [disabled]="uploadingMedia()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon>
          Subir archivos
        </button>
      </div>

      <input #mediaInput type="file" multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf"
        (change)="onMediaFilesChange($event)" style="display:none" />

      @if (uploadingMedia()) {
        <div class="upload-progress-bar">
          <div class="upload-progress-inner"></div>
        </div>
        <p class="upload-progress-label">Subiendo archivos...</p>
      }

      @if (mediaFiles().length === 0) {
        <div class="media-empty-zone" (click)="mediaInput.click()">
          <lucide-icon [img]="Layers" [size]="40" [strokeWidth]="1.5"></lucide-icon>
          <span>Haz clic para subir archivos multimedia</span>
          <small>Imágenes (JPG, PNG, WEBP) · Videos (MP4, MOV) · Documentos (PDF)</small>
        </div>
      } @else {
        <div class="media-grid">
          @for (file of mediaFiles(); track file.url) {
            <div class="media-card">
              <button class="media-delete-btn" (click)="removeMedia(file)" title="Eliminar">
                <lucide-icon [img]="X" [size]="12" [strokeWidth]="3"></lucide-icon>
              </button>
              <div class="media-thumb">
                @if (isImage(file.mimeType)) {
                  <img [src]="file.url" [alt]="file.name" />
                } @else if (isVideo(file.mimeType)) {
                  <div class="media-icon-thumb video">
                    <lucide-icon [img]="Film" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                  </div>
                } @else {
                  <div class="media-icon-thumb doc">
                    <lucide-icon [img]="FileText" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                  </div>
                }
              </div>
              <div class="media-info">
                <span class="media-name" [title]="file.name">{{ file.name }}</span>
                <span class="media-size">{{ formatSize(file.size) }}</span>
              </div>
            </div>
          }
          <!-- Add more -->
          <div class="media-card media-add-card" (click)="mediaInput.click()">
            <lucide-icon [img]="Plus" [size]="28" [strokeWidth]="1.5"></lucide-icon>
            <span>Agregar más</span>
          </div>
        </div>
      }

      @if (!isNew()) {
        <div class="media-save-hint">
          <lucide-icon [img]="Save" [size]="14"></lucide-icon>
          Los cambios en Medios se guardan al actualizar el evento desde la pestaña General.
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .text-muted-sm { font-size: 14px; color: var(--color-text-muted); margin: 4px 0 0; line-height: 1.5; }

    /* ── Media tab ── */
    .media-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; }
    .section-h3 { margin: 0; font-size: 17px; font-weight: 700; font-family: var(--font-heading); }
    .media-empty-zone { border: 2px dashed var(--color-border); border-radius: 16px; padding: 64px 24px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); background: var(--color-bg-app); transition: all 0.2s; }
    .media-empty-zone:hover { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }
    .media-empty-zone small { font-size: 13px; opacity: 0.7; }
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; margin-top: 8px; }
    .media-card { position: relative; border-radius: 14px; border: 1px solid var(--color-border); overflow: hidden; background: #fff; transition: box-shadow 0.2s, transform 0.2s; }
    .media-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .media-delete-btn { position: absolute; top: 6px; right: 6px; z-index: 2; width: 24px; height: 24px; background: rgba(0,0,0,0.55); border: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; opacity: 0; transition: opacity 0.2s; }
    .media-card:hover .media-delete-btn { opacity: 1; }
    .media-delete-btn:hover { background: var(--color-error); }
    .media-thumb { height: 110px; overflow: hidden; background: var(--color-bg-app); }
    .media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .media-icon-thumb { height: 100%; display: flex; align-items: center; justify-content: center; }
    .media-icon-thumb.video { background: #fff7ed; color: #f97316; }
    .media-icon-thumb.doc { background: #eff6ff; color: #3b82f6; }
    .media-info { padding: 10px 12px; }
    .media-name { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .media-size { display: block; font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
    .media-add-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; background: var(--color-bg-app); color: var(--color-text-muted); border-style: dashed; min-height: 155px; font-size: 13px; font-weight: 600; }
    .media-add-card:hover { border-color: var(--color-brand); color: var(--color-brand); background: var(--color-brand-light); }
    .upload-progress-bar { height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
    .upload-progress-inner { height: 100%; background: var(--color-brand); border-radius: 2px; animation: progressAnim 1.2s ease-in-out infinite; }
    @keyframes progressAnim { 0%{width:0;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0;margin-left:100%} }
    .upload-progress-label { font-size: 13px; color: var(--color-text-muted); text-align: center; margin-bottom: 16px; }
    .media-save-hint { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); padding: 12px 16px; background: var(--color-bg-app); border-radius: 10px; border: 1px solid var(--color-border); margin-top: 20px; }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .media-header { flex-direction: column; align-items: stretch; }
      .media-header .btn { width: 100%; justify-content: center; }
      .media-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
    }

    @media (max-width: 480px) {
      .media-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
    }
  `],
})
export class EventMediaTabComponent {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);

  readonly FileText = FileText; readonly Film = Film; readonly Layers = Layers;
  readonly Plus = Plus; readonly Save = Save; readonly X = X;

  mediaFiles = this.store.mediaFiles;
  isNew = this.store.isNew;

  uploadingMedia = signal(false);

  async onMediaFilesChange(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    this.uploadingMedia.set(true);
    for (const file of files) {
      try {
        const res = await firstValueFrom(this.api.upload(file));
        this.mediaFiles.update(prev => [...prev, {
          url: res.url,
          key: res.key,
          name: file.name,
          mimeType: res.contentType,
          size: file.size,
        }]);
      } catch (err: unknown) {
        const e = err as { error?: { message?: string } };
        this.toast.error(e.error?.message || `Error al subir ${file.name}`);
      }
    }
    this.uploadingMedia.set(false);
    (event.target as HTMLInputElement).value = '';
  }

  removeMedia(file: MediaFile) {
    this.mediaFiles.update(prev => prev.filter(f => f.url !== file.url));
  }

  isImage(mimeType: string): boolean { return mimeType.startsWith('image/'); }
  isVideo(mimeType: string): boolean { return mimeType.startsWith('video/'); }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
