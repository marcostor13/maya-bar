import { Component, HostListener, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, Presentation, Copy, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

export interface DemoAccess {
  tenantId: string;
  email: string;
  password: string;
  users: { name: string; email: string; role: string }[];
  counts: Record<string, number>;
}

/** Botón del superadmin para crear o restablecer la cuenta demo (HU86). */
@Component({
  selector: 'app-demo-reset',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <button type="button" class="btn btn-secondary" (click)="reset()" [disabled]="busy()" data-test="demo-reset">
      <lucide-icon [img]="Presentation" [size]="16" /> {{ busy() ? 'Preparando demo…' : 'Crear / restablecer demo' }}
    </button>

    @if (access(); as a) {
      <div class="overlay" (click)="close()">
        <div class="card modal animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="demo-title" (click)="$event.stopPropagation()">
          <div class="head">
            <h2 id="demo-title">Cuenta demo lista</h2>
            <button type="button" class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar"><lucide-icon [img]="X" [size]="18" /></button>
          </div>
          <p class="muted">Clínica Dental Sonrisa: {{ a.counts['customers'] }} contactos, {{ a.counts['conversations'] }} conversaciones y {{ a.counts['leads'] }} oportunidades. Esta contraseña no se vuelve a mostrar.</p>
          <dl>
            <dt>Correo</dt><dd data-test="demo-email">{{ a.email }}</dd>
            <dt>Contraseña</dt><dd><code data-test="demo-password">{{ a.password }}</code></dd>
          </dl>
          <p class="muted small">Los vendedores ({{ others(a) }}) entran con la misma contraseña.</p>
          <p class="muted small" data-test="demo-incognito">Entra en una ventana de incógnito: en este navegador la demo reemplazaría tu sesión de superadmin.</p>
          <div class="actions">
            <button type="button" class="btn btn-secondary" (click)="copy(a)"><lucide-icon [img]="Copy" [size]="16" /> Copiar accesos</button>
            
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; display: grid; gap: 14px; }
    .head { display: flex; justify-content: space-between; align-items: center; }
    .head h2 { margin: 0; font-size: 20px; font-family: var(--font-heading); }
    .muted { color: var(--color-text-muted); margin: 0; font-size: 14px; }
    .small { font-size: 13px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
    dt { font-weight: 600; font-size: 13px; color: var(--color-text-muted); }
    dd { margin: 0; word-break: break-all; }
    code { font-size: 16px; letter-spacing: 1px; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  `],
})
export class DemoResetComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  readonly Presentation = Presentation;
  readonly Copy = Copy;
  readonly X = X;

  busy = signal(false);
  access = signal<DemoAccess | null>(null);

  async reset() {
    const ok = await this.confirm.confirm({
      title: 'Crear o restablecer la demo',
      message: 'Se borra la empresa demo actual con todo lo que se haya hecho en ella y se crea de nuevo con datos ficticios. Las demás empresas no se tocan.',
      confirmText: 'Restablecer demo',
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.post<DemoAccess>(`${environment.apiUrl}/admin/demo/reset`, {}).subscribe({
      next: a => { this.busy.set(false); this.access.set(a); this.toast.success('Demo lista'); },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo preparar la demo'); },
    });
  }

  others(a: DemoAccess) { return a.users.filter(u => u.email !== a.email).map(u => u.email).join(', '); }

  copy(a: DemoAccess) {
    const text = `Maya CRM demo\nCorreo: ${a.email}\nContraseña: ${a.password}`;
    navigator.clipboard?.writeText(text).then(
      () => this.toast.success('Accesos copiados'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  @HostListener('document:keydown.escape')
  close() { this.access.set(null); }
}
