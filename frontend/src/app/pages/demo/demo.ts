import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule, Eye, CircleAlert } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

/**
 * Enlace público de la demo (HU90): abre la cuenta demo de solo lectura sin
 * pedir contraseña y lleva al dashboard.
 */
@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="demo-page">
      <div class="card demo animate-fade-in">
        <img src="/logo.png?v=2" alt="Maya CRM" class="logo" />
        @if (error()) {
          <lucide-icon [img]="CircleAlert" [size]="36" class="icon" />
          <h1>No pudimos abrir la demo</h1>
          <p>{{ error() }}</p>
          <button type="button" class="btn btn-primary" (click)="enter()">Reintentar</button>
          <a routerLink="/" class="link">Volver a mayacrm.site</a>
        } @else {
          <lucide-icon [img]="Eye" [size]="36" class="icon" />
          <h1>Abriendo la demo…</h1>
          <p>Es una cuenta de ejemplo: puedes ver todo, pero no hacer cambios.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .demo-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
      box-sizing: border-box; background: var(--color-bg-app); }
    .demo { width: 100%; max-width: 440px; padding: 32px 28px; display: flex; flex-direction: column; gap: 14px; text-align: center; }
    .logo { height: 36px; align-self: center; }
    .icon { align-self: center; color: var(--color-brand); }
    h1 { font-family: var(--font-heading); font-size: 21px; margin: 0; }
    p { margin: 0; color: var(--color-text-muted); font-size: 14px; }
    .link { font-size: 13px; color: var(--color-brand); }
    .btn { justify-content: center; }
  `],
})
export class DemoComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly Eye = Eye;
  readonly CircleAlert = CircleAlert;
  error = signal('');

  ngOnInit() { this.enter(); }

  enter() {
    this.error.set('');
    this.auth.demoLogin().subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: err => {
        const msg = err.error?.message || 'Inténtalo de nuevo en un momento';
        this.error.set(msg);
        this.toast.error(msg);
      },
    });
  }
}
