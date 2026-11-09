import { Component, HostListener, OnInit, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, ShieldBan, ShieldCheck, X, Search, AlertCircle, Plus } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

type Channel = 'whatsapp' | 'instagram' | 'messenger' | 'email';

export interface BlockedEntry {
  _id: string;
  channel: Channel;
  identifier: string;
  name?: string;
  reason?: string;
  source?: 'inbox' | 'manual' | 'migration';
  blockedByName?: string;
  onChannel?: boolean;
  createdAt?: string;
}

const CHANNELS: { key: Channel; label: string; placeholder: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'Número, p. ej. +51 999 888 777' },
  { key: 'email', label: 'Correo', placeholder: 'correo@ejemplo.com' },
  { key: 'instagram', label: 'Instagram', placeholder: 'ID de Instagram' },
  { key: 'messenger', label: 'Messenger', placeholder: 'ID de Messenger' },
];

/** Contactos bloqueados de la empresa: buscar, añadir a mano y desbloquear. */
@Component({
  selector: 'app-inbox-blocked',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, FormsModule],
  template: `
    <div class="overlay pn-overlay" (click)="closed.emit()" role="dialog" aria-modal="true" aria-labelledby="blocked-title">
      <div class="card pn-modal" (click)="$event.stopPropagation()">
        <div class="pn-head">
          <h2 id="blocked-title">Contactos bloqueados</h2>
          <button type="button" class="btn-icon btn-ghost" (click)="closed.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>
        <p class="pn-hint">Sus mensajes se descartan al llegar, aunque se haya eliminado el chat.</p>

        <form class="bl-add" (ngSubmit)="add()" aria-label="Bloquear un contacto">
          <select class="select bl-channel" name="channel" [(ngModel)]="newChannel" aria-label="Canal">
            @for (c of channels; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
          </select>
          <input class="input bl-contact" name="contact" [(ngModel)]="newContact" maxlength="320"
            [placeholder]="placeholder()" aria-label="Contacto a bloquear" />
          <input class="input bl-reason" name="reason" [(ngModel)]="newReason" maxlength="200"
            placeholder="Motivo (opcional)" aria-label="Motivo" />
          <button type="submit" class="btn btn-sm btn-danger" [disabled]="busy() || !newContact.trim()">
            <lucide-icon [img]="Plus" [size]="15" [strokeWidth]="2.4"></lucide-icon> Bloquear
          </button>
        </form>

        <div class="search-wrap">
          <lucide-icon class="search-icon" [img]="Search" [size]="16" [strokeWidth]="2.2"></lucide-icon>
          <input class="input" type="search" [ngModel]="q()" (ngModelChange)="onSearch($event)"
            placeholder="Buscar por número, correo, nombre o motivo" aria-label="Buscar contactos bloqueados" />
        </div>

        <div class="pn-body">
          @if (loading()) {
            <div class="pn-empty">Cargando…</div>
          } @else if (error()) {
            <div class="pn-empty pn-error">
              <lucide-icon [img]="AlertCircle" [size]="22" [strokeWidth]="2"></lucide-icon>
              <span>No se pudo cargar la lista.</span>
              <button type="button" class="btn btn-sm btn-secondary" (click)="load()">Reintentar</button>
            </div>
          } @else if (items().length === 0) {
            <div class="pn-empty">
              <lucide-icon [img]="ShieldCheck" [size]="28" [strokeWidth]="1.6"></lucide-icon>
              <span>{{ q() ? 'Nada coincide con la búsqueda.' : 'No hay contactos bloqueados.' }}</span>
            </div>
          } @else {
            <ul class="pn-list">
              @for (b of items(); track b._id) {
                <li class="pn-row">
                  <div class="pn-info">
                    <span class="pn-name">{{ label(b) }}</span>
                    <span class="pn-meta">
                      {{ channelLabel(b.channel) }}
                      @if (b.name) { · {{ b.name }} }
                      @if (b.onChannel) { · <span class="bl-onchannel">También en WhatsApp</span> }
                    </span>
                    <span class="pn-meta">
                      {{ b.reason || 'Sin motivo' }}
                      @if (b.blockedByName) { · por {{ b.blockedByName }} }
                      @if (b.createdAt) { · {{ b.createdAt | date: 'd MMM y' }} }
                    </span>
                  </div>
                  <button type="button" class="btn btn-sm btn-secondary" (click)="unblock(b)" [disabled]="busy()"
                    [attr.aria-label]="'Desbloquear ' + label(b)">
                    <lucide-icon [img]="ShieldCheck" [size]="14" [strokeWidth]="2.4"></lucide-icon> Desbloquear
                  </button>
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
      width: calc(100% - 48px); max-width: 600px; max-height: calc(100dvh - 48px);
      box-sizing: border-box; padding: 24px 28px; display: flex; flex-direction: column; gap: 12px;
      animation: fadeInUp var(--transition-spring);
    }
    .pn-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .pn-head h2 { margin: 0; font-family: var(--font-heading); font-size: 19px; }
    .pn-hint { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .bl-add { display: grid; grid-template-columns: 130px 1fr; gap: 8px; }
    .bl-add .btn { justify-self: end; }
    .bl-add .input, .bl-add .select { width: 100%; min-width: 0; box-sizing: border-box; }
    .search-wrap { position: relative; }
    .search-wrap .input { width: 100%; box-sizing: border-box; padding-left: 38px; }
    .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }
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
    .bl-onchannel { color: var(--color-success); font-weight: 600; }
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
      .bl-add { grid-template-columns: 1fr; }
      .bl-add .btn { justify-self: stretch; }
      .bl-add .input, .search-wrap .input { font-size: 16px; }
    }
  `],
})
export class InboxBlockedComponent implements OnInit {
  readonly ShieldBan = ShieldBan;
  readonly ShieldCheck = ShieldCheck;
  readonly X = X;
  readonly Search = Search;
  readonly AlertCircle = AlertCircle;
  readonly Plus = Plus;
  readonly channels = CHANNELS;

  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);

  closed = output<void>();

  items = signal<BlockedEntry[]>([]);
  loading = signal(true);
  error = signal(false);
  busy = signal(false);
  q = signal('');

  newChannel: Channel = 'whatsapp';
  newContact = '';
  newReason = '';

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    void this.load();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // Con una confirmación abierta, Escape solo cierra la confirmación.
    if (this.confirmSvc.state()) return;
    this.closed.emit();
  }

  placeholder() {
    return CHANNELS.find(c => c.key === this.newChannel)?.placeholder ?? '';
  }

  onSearch(value: string) {
    this.q.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 300);
  }

  async load() {
    this.loading.set(true);
    this.error.set(false);
    try {
      const q = this.q().trim();
      this.items.set(
        await firstValueFrom(
          this.http.get<BlockedEntry[]>(`${API}/conversations/blocked`, { params: q ? { q } : {} }),
        ),
      );
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  label(b: BlockedEntry) {
    return b.channel === 'whatsapp' && /^\d+$/.test(b.identifier) ? `+${b.identifier}` : b.identifier;
  }

  channelLabel(ch: Channel) {
    return CHANNELS.find(c => c.key === ch)?.label ?? ch;
  }

  async add() {
    const contact = this.newContact.trim();
    if (!contact) return;
    this.busy.set(true);
    try {
      const entry = await firstValueFrom(
        this.http.post<BlockedEntry>(`${API}/conversations/blocked`, {
          channel: this.newChannel,
          contact,
          reason: this.newReason.trim() || undefined,
        }),
      );
      this.items.update(list => [entry, ...list.filter(i => i._id !== entry._id)]);
      this.newContact = '';
      this.newReason = '';
      this.toast.success('Contacto bloqueado');
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo bloquear el contacto'));
    } finally {
      this.busy.set(false);
    }
  }

  async unblock(b: BlockedEntry) {
    const ok = await this.confirmSvc.confirm({
      title: 'Desbloquear contacto',
      message: `Volverás a recibir los mensajes de ${this.label(b)}. Sigue en "No contactar" hasta que lo desmarques allí.`,
      confirmText: 'Desbloquear',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.http.delete<{ removed: true; channelError?: string }>(`${API}/conversations/blocked/${b._id}`),
      );
      this.items.update(list => list.filter(i => i._id !== b._id));
      if (res.channelError)
        this.toast.error(`Desbloqueado en la plataforma, pero no en WhatsApp: ${res.channelError}`);
      else this.toast.success('Contacto desbloqueado');
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo desbloquear el contacto'));
    } finally {
      this.busy.set(false);
    }
  }

  private message(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: string } };
    return e?.error?.message || fallback;
  }
}
