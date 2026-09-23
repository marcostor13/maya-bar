import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Send, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

/** Buzón tal como lo lista la bandeja (`/conversations/accounts`). */
export interface ComposeAccount {
  _id: string;
  label: string;
  detail: string;
  isDefault: boolean;
}

/**
 * Correo nuevo desde la bandeja, fuera de un hilo: a un cliente que todavía
 * no escribió o para retomar el contacto con otro asunto.
 */
@Component({
  selector: 'app-email-compose',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="closed.emit()" role="dialog" aria-modal="true" aria-label="Correo nuevo">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="head">
          <h2>Correo nuevo</h2>
          <button class="btn btn-icon btn-ghost" (click)="closed.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>
        @if (accounts.length > 1) {
          <label class="field">
            <span>Desde</span>
            <select class="select" [(ngModel)]="form.accountId">
              @for (a of accounts; track a._id) {
                <option [value]="a._id">{{ a.label }} · {{ a.detail }}</option>
              }
            </select>
          </label>
        }
        <label class="field">
          <span>Para</span>
          <input class="input" type="email" [(ngModel)]="form.to" placeholder="cliente@empresa.com" autocomplete="off" />
        </label>
        <label class="field">
          <span>Asunto</span>
          <input class="input" [(ngModel)]="form.subject" maxlength="250" />
        </label>
        <label class="field">
          <span>Mensaje</span>
          <textarea class="textarea" rows="7" [(ngModel)]="form.text"></textarea>
        </label>
        <p class="hint">El agente IA no responde en los hilos que inicias tú: puedes activarlo después desde la conversación.</p>
        <div class="foot">
          <button class="btn btn-ghost" (click)="closed.emit()">Cancelar</button>
          <button class="btn btn-primary" (click)="send()" [disabled]="sending() || !valid()">
            <lucide-icon [img]="Send" [size]="16" [strokeWidth]="2.4"></lucide-icon>
            {{ sending() ? 'Enviando…' : 'Enviar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      width: calc(100% - 48px); max-width: 520px; padding: 28px 32px; box-sizing: border-box;
      display: flex; flex-direction: column; gap: 14px; max-height: 92vh; overflow-y: auto;
      animation: pop var(--transition-spring); }
    @keyframes pop { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .head h2 { margin: 0; font: 700 18px var(--font-heading); }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
    .field .input, .field .select, .field .textarea { width: 100%; box-sizing: border-box; font-weight: 400; }
    .hint { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }
    .foot { display: flex; justify-content: flex-end; gap: 10px; }
    @media (max-width: 480px) {
      .modal-card { width: calc(100% - 24px); padding: 22px 18px; }
      .foot .btn { flex: 1; justify-content: center; }
    }
  `],
})
export class EmailComposeComponent implements OnInit {
  @Input({ required: true }) accounts: ComposeAccount[] = [];
  /** Buzón elegido en el filtro de la bandeja, si hay uno. */
  @Input() preferredId = '';
  @Output() closed = new EventEmitter<void>();
  /** Id de la conversación creada o reutilizada. */
  @Output() sent = new EventEmitter<string>();

  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly Send = Send;
  readonly X = X;

  sending = signal(false);
  form = { accountId: '', to: '', subject: '', text: '' };

  ngOnInit() {
    const preferred =
      this.accounts.find(a => a._id === this.preferredId) ??
      this.accounts.find(a => a.isDefault) ??
      this.accounts[0];
    this.form.accountId = preferred?._id ?? '';
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.closed.emit(); }

  valid(): boolean {
    const f = this.form;
    return !!f.accountId && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.to.trim()) && !!f.subject.trim() && !!f.text.trim();
  }

  send() {
    if (!this.valid() || this.sending()) return;
    this.sending.set(true);
    const f = this.form;
    this.http.post<{ conversationId: string; status: string }>(`${environment.apiUrl}/conversations/email/compose`, {
      accountId: f.accountId,
      to: f.to.trim(),
      subject: f.subject.trim(),
      text: f.text.trim(),
    }).subscribe({
      next: msg => {
        this.sending.set(false);
        if (msg.status === 'failed') this.toast.error('El correo se guardó pero no pudo enviarse');
        else this.toast.success('Correo enviado');
        this.sent.emit(msg.conversationId);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.sending.set(false);
        const m = err.error?.message;
        this.toast.error((Array.isArray(m) ? m[0] : m) || 'No se pudo enviar el correo');
      },
    });
  }
}
