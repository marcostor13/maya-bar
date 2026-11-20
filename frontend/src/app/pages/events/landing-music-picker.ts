import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Upload, Trash2, Music } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { EventsApiService } from '../../core/api/events-api.service';
import { spotifyUri } from '../../shared/landing-music';

export interface LandingMusic {
  embedCode: string;
  /** Audio subido: se reproduce con el botón de la landing, sin reproductor (HU22). */
  audioUrl?: string;
  audioName?: string;
}

const AUDIO_ACCEPT = 'audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/x-wav,.mp3,.m4a';
const MAX_AUDIO_MB = 30;

/** Contenido de la ventana «Música» del diseñador de invitaciones (HU22). */
@Component({
  selector: 'app-landing-music-picker',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <section class="lm-block">
      <h4><lucide-icon [img]="Music" [size]="15"></lucide-icon> Audio propio <span class="lm-tag">Recomendado</span></h4>
      <p class="lm-hint">Sube un mp3 o m4a (máx. {{ maxMb }} MB). En la landing solo aparece un botón: un clic y suena la canción completa.</p>
      @if (music().audioUrl) {
        <div class="lm-file">
          <span class="lm-name" [title]="music().audioName || ''">{{ music().audioName || 'Audio' }}</span>
          <button type="button" class="lm-link" (click)="removeAudio()">
            <lucide-icon [img]="Trash2" [size]="13"></lucide-icon> Quitar audio
          </button>
        </div>
        <audio class="lm-audio" controls preload="none" [src]="music().audioUrl"></audio>
      }
      <button type="button" class="lm-upload" (click)="fileInput.click()" [disabled]="uploading()">
        <lucide-icon [img]="Upload" [size]="14"></lucide-icon>
        {{ uploading() ? 'Subiendo…' : (music().audioUrl ? 'Cambiar audio' : 'Subir audio') }}
      </button>
      <input #fileInput type="file" hidden [accept]="accept" (change)="onFile($event)" />
    </section>

    <section class="lm-block">
      <h4>Spotify, YouTube o SoundCloud</h4>
      <p class="lm-hint">
        Pega el enlace de Spotify o el código <strong>embed</strong>. Con Spotify el botón lo reproduce en un reproductor pequeño;
        quien no tenga sesión en Spotify escucha 30 s.
        @if (music().audioUrl) { <br />Mientras haya audio propio, se usa el audio. }
      </p>
      <textarea class="lm-input" rows="4"
        [value]="music().embedCode"
        (input)="setEmbed($any($event.target).value)"
        placeholder="https://open.spotify.com/track/…  o  <iframe src=&quot;https://open.spotify.com/embed/…&quot;></iframe>"></textarea>
      @if (spotifyEmbedUrl(); as url) {
        <iframe class="lm-preview" [src]="url" height="80" allow="autoplay; encrypted-media" title="Vista previa de Spotify"></iframe>
      } @else if (music().embedCode.trim()) {
        <div class="lm-preview-html" [innerHTML]="embedHtml()"></div>
      }
    </section>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 14px; }
    .lm-block { display: flex; flex-direction: column; gap: 8px; }
    h4 { margin: 0; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; color: var(--color-text-main); }
    .lm-tag { font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; background: var(--color-brand-light); color: var(--color-brand); }
    .lm-hint { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }
    .lm-file { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; }
    .lm-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .lm-link { background: none; border: 0; padding: 0; color: var(--color-danger); font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    .lm-audio { width: 100%; height: 36px; }
    .lm-upload { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 12.5px; font-weight: 600;
      border: 1px solid var(--color-border); border-radius: 9999px; background: var(--color-bg-app); color: var(--color-text-main); cursor: pointer; }
    .lm-upload:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
    .lm-upload:disabled { opacity: 0.6; cursor: default; }
    .lm-input { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; font-size: 12.5px; border: 1px solid var(--color-border);
      border-radius: 12px; background: var(--color-bg-app); color: var(--color-text-main); resize: vertical; }
    .lm-preview { width: 100%; border: 0; border-radius: 12px; display: block; }
    .lm-preview-html { border-radius: 12px; overflow: hidden; }
    .lm-preview-html iframe { width: 100%; border: none; border-radius: 12px; display: block; }
  `],
})
export class LandingMusicPickerComponent {
  private api = inject(EventsApiService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  readonly Upload = Upload;
  readonly Trash2 = Trash2;
  readonly Music = Music;
  readonly accept = AUDIO_ACCEPT;
  readonly maxMb = MAX_AUDIO_MB;

  music = input<LandingMusic>({ embedCode: '' });
  musicChange = output<LandingMusic>();
  uploading = signal(false);

  spotifyEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const uri = spotifyUri(this.music().embedCode);
    if (!uri) return null;
    const [, type, id] = uri.split(':');
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://open.spotify.com/embed/${type}/${id}`);
  });
  embedHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.music().embedCode));

  async onFile(event: Event) {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      this.toast.error(`El audio supera ${MAX_AUDIO_MB} MB`);
      return;
    }
    this.uploading.set(true);
    try {
      const res = await firstValueFrom(this.api.upload(file));
      this.musicChange.emit({ ...this.music(), audioUrl: res.url, audioName: file.name });
      this.toast.success('Audio subido');
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'No se pudo subir el audio');
    } finally {
      this.uploading.set(false);
    }
  }

  removeAudio() {
    this.musicChange.emit({ embedCode: this.music().embedCode });
  }

  setEmbed(code: string) {
    this.musicChange.emit({ ...this.music(), embedCode: code });
  }
}
