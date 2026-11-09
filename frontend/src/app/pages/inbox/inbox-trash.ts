import { Component, HostListener, OnInit, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Trash2, RotateCcw, X, AlertCircle } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface TrashedConv {
  _id: string;
  channel: string;
  contact: string;
  contactName?: string;
  lastMessagePreview?: string;
  emailSubject?: string;
  trashedAt?: string;
  trashedByName?: string;
  purgeAt?: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  email: 'Correo',
};

/** Papelera de la bandeja: restaurar, borrar definitivamente o vaciar. */
@Component({
  selector: 'app-inbox-trash',
  standalone: true,
  imports: [LucideAngularModule, DatePipe],
  template: `
    <div class="overlay pn-overlay" (click)="closed.emit()" role="dialog" aria-modal="true" aria-labelledby="trash-title">
      <div class="card pn-modal" (click)="$event.stopPropagation()">
        <div class="pn-head">
          <h2 id="trash-title">Papelera</h2>
          <div class="pn-head-actions">
            @if (items().length > 0) {
              <button type="button" class="btn btn-sm btn-danger" (click)="empty()" [disabled]="busy()">
                <lucide-icon [img]="Trash2" [size]="15" [strokeWidth]="2.3"></lucide-icon> Vaciar
              </button>
            }
            <button type="button" class="btn-icon btn-ghost" (click)="closed.emit()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>
        </div>
        <p class="pn-hint">Las conversaciones eliminadas se guardan aquí 30 días y después se borran solas.</p>

        <div class="pn-body">
          @if (loading()) {
            <div class="pn-empty">Cargando…</div>
          } @else if (error()) {
            <div class="pn-empty pn-error">
              <lucide-icon [img]="AlertCircle" [size]="22" [strokeWidth]="2"></lucide-icon>
              <span>No se pudo cargar la papelera.</span>
              <button type="button" class="btn btn-sm btn-secondary" (click)="load()">Reintentar</button>
            </div>
          } @else if (items().length === 0) {
            <div class="pn-empty">
              <lucide-icon [img]="Trash2" [size]="28" [strokeWidth]="1.6"></lucide-icon>
              <span>La papelera está vacía.</span>
            </div>
          } @else {
            <ul class="pn-list">
              @for (c of items(); track c._id) {
                <li class="pn-row">
                  <div class="pn-info">
                    <span class="pn-name">{{ nameOf(c) }}</span>
                    <span class="pn-meta">
                      {{ channelLabel(c.channel) }}
                      · Eliminada{{ c.trashedByName ? ' por ' + c.trashedByName : '' }}
                      @if (c.trashedAt) { el {{ c.trashedAt | date: 'd MMM, HH:mm' }} }
                    </span>
                    @if (c.purgeAt) {
                      <span class="pn-meta">Se borrará el {{ c.purgeAt | date: 'd MMM' }}</span>
                    }
                  </div>
                  <div class="pn-row-actions">
                    <button type="button" class="btn btn-sm btn-secondary" (click)="restore(c)" [disabled]="busy()">
                      <lucide-icon [img]="RotateCcw" [size]="14" [strokeWidth]="2.4"></lucide-icon> Restaurar
                    </button>
                    <button type="button" class="btn-icon btn-ghost danger" (click)="purge(c)" [disabled]="busy()"
                      [attr.aria-label]="'Borrar definitivamente ' + nameOf(c)" title="Borrar definitivamente">
                      <lucide-icon [img]="Trash2" [size]="17" [strokeWidth]="2.2"></lucide-icon>
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .pn-overlay {
      position: fixed; inset: 0; z-index: 105;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
    }
    .pn-modal {
      width: calc(100% - 48px); max-width: 560px; max-height: calc(100dvh - 48px);
      box-sizing: border-box; padding: 24px 28px; display: flex; flex-direction: column; gap: 10px;
      animation: fadeInUp var(--transition-spring);
    }
    .pn-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .pn-head h2 { margin: 0; font-family: var(--font-heading); font-size: 19px; }
    .pn-head-actions { display: flex; align-items: center; gap: 6px; }
    .pn-hint { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .pn-body { overflow-y: auto; min-height: 120px; }
    .pn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .pn-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid var(--color-border);
    }
    .pn-row:last-child { border-bottom: none; }
    .pn-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pn-name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pn-meta { font-size: 12.5px; color: var(--color-text-muted); }
    .pn-row-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .danger { color: var(--color-error); }
    .pn-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 32px 0; color: var(--color-text-muted); font-size: 14px; text-align: center;
    }
    .pn-error { color: var(--color-error); }
    @media (max-width: 640px) {
      .pn-overlay { align-items: flex-end; }
      .pn-modal {
        width: 100%; max-width: none; max-height: 92dvh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        padding: 16px 20px calc(20px + var(--safe-bottom));
      }
    }
  `],
})
export class InboxTrashComponent implements OnInit {
  readonly Trash2 = Trash2;
  readonly RotateCcw = RotateCcw;
  readonly X = X;
  readonly AlertCircle = AlertCircle;

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  closed = output<void>();
  /** Chat que volvió a la bandeja (o en el que se unió el historial). */
  restored = output<{ _id: string } & Record<string, unknown>>();

  items = signal<TrashedConv[]>([]);
  loading = signal(true);
  error = signal(false);
  busy = signal(false);

  ngOnInit() {
    void this.load();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // Con una confirmación abierta, Escape solo cierra la confirmación.
    if (this.confirmSvc.state()) return;
    this.closed.emit();
  }

  async load() {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.items.set(await firstValueFrom(this.http.get<TrashedConv[]>(`${API}/conversations/trash`)));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  nameOf(c: TrashedConv) {
    if (c.contactName?.trim()) return c.contactName.trim();
    return c.channel === 'whatsapp' ? `+${c.contact}` : c.contact;
  }

  channelLabel(ch: string) {
    return CHANNEL_LABEL[ch] ?? ch;
  }

  async restore(c: TrashedConv) {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ conversation: { _id: string } & Record<string, unknown>; merged: boolean }>(
          `${API}/conversations/trash/${c._id}/restore`,
          {},
        ),
      );
      this.items.update(list => list.filter(i => i._id !== c._id));
      this.restored.emit(res.conversation);
      this.toast.success(
        res.merged ? 'Restaurada: el historial se unió a su chat actual' : 'Conversación restaurada',
      );
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo restaurar la conversación'));
    } finally {
      this.busy.set(false);
    }
  }

  async purge(c: TrashedConv) {
    const ok = await this.confirmSvc.confirm({
      title: 'Borrar definitivamente',
      message: `Se borrará para siempre el historial con ${this.nameOf(c)}. Esta acción no se puede deshacer.`,
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.delete(`${API}/conversations/trash/${c._id}`));
      this.items.update(list => list.filter(i => i._id !== c._id));
      this.toast.success('Conversación borrada definitivamente');
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo borrar la conversación'));
    } finally {
      this.busy.set(false);
    }
  }

  async empty() {
    const n = this.items().length;
    const ok = await this.confirmSvc.confirm({
      title: 'Vaciar papelera',
      message: `Se borrarán para siempre ${n === 1 ? '1 conversación' : n + ' conversaciones'}. Esta acción no se puede deshacer.`,
      confirmText: 'Vaciar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.http.delete<{ deleted: number }>(`${API}/conversations/trash`));
      this.items.set([]);
      this.toast.success(`Papelera vaciada (${res.deleted})`);
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo vaciar la papelera'));
    } finally {
      this.busy.set(false);
    }
  }

  private message(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: string } };
    return e?.error?.message || fallback;
  }
}
