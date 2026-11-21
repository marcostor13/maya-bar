import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Image, Save, Trash2, Upload } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

type BrandKey = 'logo' | 'favicon';
type ErrorLike = { error?: { message?: string | string[] } };

interface Branding {
  logo?: string;
  favicon?: string;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** Logo y favicon de la empresa: con ellos sale el link de sus eventos (HU26). */
@Component({
  selector: 'app-company-branding-settings',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Image" [size]="20"></lucide-icon></div>
        <div>
          <h2 class="section-title">Marca de la empresa</h2>
          <p class="section-desc">
            Tu logo y tu favicon aparecen en la landing de tus eventos, en el link de Maya y en tu dominio propio.
          </p>
        </div>
      </div>

      @if (loading()) {
        <p class="hint">Cargando…</p>
      } @else if (loadError()) {
        <p class="hint" role="alert">No se pudo cargar la marca.
          <button type="button" class="btn btn-ghost btn-sm" (click)="load()">Reintentar</button></p>
      } @else {
        <div class="grid2">
          @for (f of fields; track f.key) {
            <div class="field">
              <span class="label">{{ f.label }}</span>
              <div class="preview" [class.preview-icon]="f.key === 'favicon'">
                @if (draft()[f.key]) {
                  <img [src]="draft()[f.key]" [alt]="f.label + ' actual'" />
                } @else {
                  <span class="hint">Sin {{ f.label.toLowerCase() }}</span>
                }
              </div>
              <span class="hint">{{ f.hint }}</span>
              @if (canEdit()) {
                <div class="row">
                  <label class="btn btn-secondary btn-sm" [class.disabled]="uploading() === f.key">
                    <lucide-icon [img]="Upload" [size]="14"></lucide-icon>
                    {{ uploading() === f.key ? 'Subiendo…' : (draft()[f.key] ? 'Cambiar' : 'Subir') }}
                    <input type="file" class="sr-only" [accept]="accept" [attr.data-key]="f.key"
                      [disabled]="uploading() !== null" (change)="onFile(f.key, $event)" />
                  </label>
                  @if (draft()[f.key]) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="clear(f.key)"
                      [attr.aria-label]="'Quitar ' + f.label.toLowerCase()">
                      <lucide-icon [img]="Trash2" [size]="14"></lucide-icon> Quitar
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (canEdit()) {
          <div class="section-footer">
            <span class="spacer"></span>
            <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving() || !dirty() || uploading() !== null">
              <lucide-icon [img]="Save" [size]="16"></lucide-icon>
              {{ saving() ? 'Guardando…' : 'Guardar marca' }}
            </button>
          </div>
        } @else {
          <p class="hint">Solo el administrador de la empresa puede cambiar la marca.</p>
        }
      }
    </div>
  `,
  styles: [`
    .section-card { background:var(--color-white); border:1px solid var(--color-border); border-radius:var(--radius-lg);
      padding:24px; margin-bottom:24px; display:flex; flex-direction:column; gap:16px; }
    .section-header { display:flex; align-items:center; gap:16px; }
    .section-icon { width:44px; height:44px; border-radius:var(--radius-lg); display:grid; place-items:center; flex-shrink:0;
      background:var(--color-brand-light); color:var(--color-brand); }
    .section-title { font-family:var(--font-heading); font-size:17px; font-weight:600; margin:0; }
    .section-desc { font-size:13px; color:var(--color-text-muted); margin:0; }
    .section-footer { display:flex; align-items:center; gap:10px; }
    .spacer { flex:1; }
    .hint { font-size:12px; color:var(--color-text-muted); margin:0; }
    .field { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .preview { height:72px; border:1px dashed var(--color-border); border-radius:var(--radius-lg); display:flex;
      align-items:center; justify-content:center; padding:10px; box-sizing:border-box; background:var(--color-bg, var(--color-white)); }
    .preview img { max-height:100%; max-width:100%; object-fit:contain; }
    .preview-icon img { width:48px; height:48px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; }
    .row label { cursor:pointer; }
    .row label:focus-within { outline:2px solid var(--color-brand); outline-offset:2px; }
    .disabled { opacity:.6; pointer-events:none; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); border:0; }
    @media (max-width: 700px) { .grid2 { grid-template-columns:1fr; } }
  `],
})
export class CompanyBrandingSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly Image = Image;
  readonly Save = Save;
  readonly Trash2 = Trash2;
  readonly Upload = Upload;
  readonly accept = ACCEPT;
  readonly fields: { key: BrandKey; label: string; hint: string }[] = [
    { key: 'logo', label: 'Logo', hint: 'PNG con fondo transparente, horizontal. Se muestra arriba en la landing.' },
    { key: 'favicon', label: 'Favicon', hint: 'Imagen cuadrada (p. ej. 512×512 PNG). Es el icono de la pestaña; si falta se usa el logo.' },
  ];

  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  uploading = signal<BrandKey | null>(null);
  private saved = signal<Branding>({});
  draft = signal<Branding>({});
  dirty = computed(() => (['logo', 'favicon'] as const).some(k => (this.saved()[k] ?? '') !== (this.draft()[k] ?? '')));
  canEdit = computed(() => this.auth.currentUser()?.role === 'TENANT_ADMIN');

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.http.get<{ branding?: Branding }>(`${API}/tenants/me`).subscribe({
      next: (t) => {
        const b = { logo: t.branding?.logo, favicon: t.branding?.favicon };
        this.saved.set(b);
        this.draft.set(b);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  async onFile(key: BrandKey, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      this.toast.error('Usa una imagen PNG, JPG, WEBP o GIF');
      return;
    }
    this.uploading.set(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await firstValueFrom(this.http.post<{ url: string }>(`${API}/upload?folder=branding`, fd));
      this.draft.update(d => ({ ...d, [key]: res.url }));
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo subir la imagen'));
    } finally {
      this.uploading.set(null);
    }
  }

  clear(key: BrandKey) {
    this.draft.update(d => ({ ...d, [key]: undefined }));
  }

  save() {
    const d = this.draft();
    this.saving.set(true);
    this.http
      .patch<Branding>(`${API}/tenants/me/branding`, { logo: d.logo ?? null, favicon: d.favicon ?? null })
      .subscribe({
        next: (b) => {
          this.saved.set(b);
          this.draft.set(b);
          this.saving.set(false);
          this.toast.success('Marca guardada');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(this.message(err, 'No se pudo guardar la marca'));
        },
      });
  }

  private message(err: unknown, fallback: string): string {
    const m = (err as ErrorLike)?.error?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
  }
}
