import { Component, ElementRef, HostListener, computed, input, output, viewChild, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ShieldBan, X } from 'lucide-angular';

export interface BlockDialogResult {
  reason: string;
  allChannels: boolean;
}

/**
 * Confirmación de bloqueo. En modo `delete` es "Eliminar y bloquear": además
 * del bloqueo, los chats van a la papelera. Un solo paso, una sola confirmación.
 */
@Component({
  selector: 'app-block-dialog',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay bd-overlay" (click)="cancelled.emit()" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      <div class="card bd-modal" (click)="$event.stopPropagation()">
        <div class="bd-head">
          <h2 id="bd-title">
            <lucide-icon [img]="ShieldBan" [size]="20" [strokeWidth]="2.3"></lucide-icon>
            {{ title() }}
          </h2>
          <button type="button" class="btn-icon btn-ghost" (click)="cancelled.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>

        <p class="bd-text">
          {{ subject() }} no podrá volver a escribirte: sus mensajes se descartarán sin avisar, no podrás escribirle y
          pasará a "No contactar".
          @if (mode() === 'delete') {
            {{ count() === 1 ? 'La conversación irá' : 'Las conversaciones irán' }} a la papelera, donde se puede
            restaurar durante 30 días.
          }
        </p>

        <label class="bd-field">
          <span>Motivo <em>(opcional)</em></span>
          <input #reasonInput class="input" [(ngModel)]="reason" maxlength="200" placeholder="Spam, acoso, número equivocado…" />
        </label>

        @if (canAllChannels()) {
          <label class="bd-check">
            <input type="checkbox" [(ngModel)]="allChannels" />
            <span>
              Bloquear en todos los canales del cliente
              <small>Su WhatsApp, su correo y sus otros chats guardados en el contacto.</small>
            </span>
          </label>
        }

        <div class="bd-actions">
          <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancelar</button>
          <button type="button" class="btn btn-danger" (click)="confirm()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bd-overlay {
      position: fixed; inset: 0; z-index: 110;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
    }
    .bd-modal {
      width: calc(100% - 48px); max-width: 480px; box-sizing: border-box;
      padding: 28px 32px; display: flex; flex-direction: column; gap: 16px;
      animation: fadeInUp var(--transition-spring);
    }
    .bd-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .bd-head h2 {
      margin: 0; display: flex; align-items: center; gap: 8px;
      font-family: var(--font-heading); font-size: 19px; color: var(--color-error);
    }
    .bd-text { margin: 0; font-size: 14px; line-height: 1.5; color: var(--color-text-muted); }
    .bd-field { display: flex; flex-direction: column; gap: 6px; }
    .bd-field > span { font-size: 12.5px; font-weight: 600; }
    .bd-field em { font-style: normal; font-weight: 500; color: var(--color-text-muted); }
    .bd-field .input { width: 100%; box-sizing: border-box; }
    .bd-check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; cursor: pointer; }
    .bd-check input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--color-brand); }
    .bd-check small { display: block; color: var(--color-text-muted); font-size: 12.5px; margin-top: 2px; }
    .bd-actions { display: flex; justify-content: flex-end; gap: 10px; }
    @media (max-width: 640px) {
      .bd-overlay { align-items: flex-end; }
      .bd-modal {
        width: 100%; max-width: none; padding: 20px 20px calc(20px + var(--safe-bottom));
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }
      .bd-actions .btn { flex: 1; }
      .bd-field .input { font-size: 16px; }
    }
  `],
})
export class BlockDialogComponent {
  readonly ShieldBan = ShieldBan;
  readonly X = X;

  /** `block`: solo bloquear. `delete`: eliminar y bloquear. */
  mode = input<'block' | 'delete'>('block');
  /** Cuántos chats afecta (para los textos). */
  count = input(1);
  /** Nombre del contacto cuando es uno solo. */
  name = input<string>('');
  /** Hay cliente vinculado: tiene sentido bloquear sus otros canales. */
  canAllChannels = input(false);

  confirmed = output<BlockDialogResult>();
  cancelled = output<void>();

  reason = '';
  allChannels = false;

  private reasonInput = viewChild<ElementRef<HTMLInputElement>>('reasonInput');

  title = computed(() => (this.mode() === 'delete' ? 'Eliminar y bloquear' : 'Bloquear contacto'));
  subject = computed(() =>
    this.count() > 1 ? `Estos ${this.count()} contactos` : this.name() || 'Este contacto',
  );
  confirmLabel = computed(() => (this.mode() === 'delete' ? 'Eliminar y bloquear' : 'Bloquear'));

  constructor() {
    afterNextRender(() => this.reasonInput()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.cancelled.emit();
  }

  confirm() {
    this.confirmed.emit({ reason: this.reason.trim(), allChannels: this.allChannels });
  }
}
