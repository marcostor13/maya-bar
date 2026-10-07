import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, MailCheck, Save, Send, Trash2, KeyRound, CircleCheck, TriangleAlert, ExternalLink,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { ResendApiService, ResendConfig, ResendDomain } from '../../core/api/resend-api.service';

type ErrorLike = { error?: { message?: string | string[] } };

/** Cuenta de Resend de la empresa: con ella salen los correos masivos. */
@Component({
  selector: 'app-resend-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="MailCheck" [size]="20"></lucide-icon></div>
        <div>
          <h2 class="section-title">Correos masivos (Resend)</h2>
          <p class="section-desc">
            Conecta tu cuenta de Resend para que las campañas de email salgan con tu dominio y tu propio límite de envío.
          </p>
        </div>
        <div class="section-actions">
          <span class="badge" [class.badge-success]="active()" [class.badge-neutral]="!active()">
            {{ active() ? 'Conectada' : 'Sin conectar' }}
          </span>
        </div>
      </div>

      @if (loading()) {
        <p class="hint">Cargando…</p>
      } @else {
        <ol class="steps">
          <li>
            Crea una API key en
            <a href="https://resend.com/api-keys" target="_blank" rel="noopener">
              resend.com/api-keys <lucide-icon [img]="ExternalLink" [size]="11"></lucide-icon>
            </a>
            (con acceso completo podremos comprobar tu dominio; con "solo envío" también funciona).
          </li>
          <li>
            Verifica tu dominio en
            <a href="https://resend.com/domains" target="_blank" rel="noopener">
              resend.com/domains <lucide-icon [img]="ExternalLink" [size]="11"></lucide-icon>
            </a>
            y usa un remitente de ese dominio.
          </li>
        </ol>

        <label class="field">
          <span class="label"><lucide-icon [img]="KeyRound" [size]="13"></lucide-icon> API key</span>
          <input class="input mono" type="password" autocomplete="new-password" [(ngModel)]="apiKey"
            [placeholder]="config()?.hasKey ? 'Guardada (termina en ' + config()!.keyHint + ') — escribe para cambiarla' : 're_…'" />
          <span class="hint">Se guarda cifrada y no se vuelve a mostrar.</span>
        </label>

        <div class="grid2">
          <label class="field">
            <span class="label">Correo remitente</span>
            <input class="input" type="email" [(ngModel)]="fromEmail" maxlength="200" placeholder="hola@tuempresa.com" />
          </label>
          <label class="field">
            <span class="label">Nombre del remitente</span>
            <input class="input" [(ngModel)]="fromName" maxlength="80" placeholder="Tu Empresa" />
          </label>
        </div>

        <div class="grid2">
          <label class="field">
            <span class="label">Responder a (opcional)</span>
            <input class="input" type="email" [(ngModel)]="replyTo" maxlength="200" placeholder="ventas@tuempresa.com" />
          </label>
          <label class="field">
            <span class="label">Envíos por minuto</span>
            <input class="input" type="number" min="10" max="600" [(ngModel)]="ratePerMinute" />
          </label>
        </div>
        <p class="hint">
          El ritmo con el que se despachan las campañas. Resend admite 2 peticiones por segundo por defecto (unos 100 por minuto);
          súbelo solo si tu plan tiene un límite mayor.
        </p>

        @if (config(); as c) {
          @if (c.domains.length) {
            <div class="domains">
              <span class="label">Dominios en tu cuenta</span>
              <div class="chips">
                @for (d of c.domains; track d.name) {
                  <span class="badge" [class.badge-success]="d.status === 'verified'" [class.badge-warning]="d.status !== 'verified'">
                    <lucide-icon [img]="d.status === 'verified' ? CircleCheck : TriangleAlert" [size]="12"></lucide-icon>
                    {{ d.name }} · {{ statusLabel(d) }}
                  </span>
                }
              </div>
              @if (c.checkedAt) { <span class="hint">Comprobado {{ c.checkedAt | date: 'dd/MM/yyyy HH:mm' }}</span> }
            </div>
          } @else if (c.hasKey && c.fromVerified === null) {
            <div class="warn">
              <lucide-icon [img]="TriangleAlert" [size]="14"></lucide-icon>
              Tu API key es de solo envío: no podemos comprobar el dominio. Usa "Enviar prueba" para confirmar que funciona.
            </div>
          }
        }

        <label class="check">
          <input type="checkbox" [(ngModel)]="enabled" />
          Usar mi cuenta de Resend para enviar las campañas de email
        </label>

        <div class="test">
          <input class="input" type="email" [(ngModel)]="testTo" placeholder="Tu correo para probar" />
          <button class="btn btn-secondary" (click)="test()" [disabled]="testing() || saving() || !testTo.trim()">
            <lucide-icon [img]="Send" [size]="14"></lucide-icon>
            {{ testing() ? 'Enviando…' : 'Enviar prueba' }}
          </button>
        </div>

        <div class="section-footer">
          @if (config()?.hasKey) {
            <button class="btn btn-ghost" (click)="disconnect()">
              <lucide-icon [img]="Trash2" [size]="15"></lucide-icon> Desconectar
            </button>
          }
          <span class="spacer"></span>
          <button class="btn btn-primary" (click)="save()" [disabled]="saving() || !fromEmail.trim()">
            <lucide-icon [img]="Save" [size]="15"></lucide-icon>
            {{ saving() ? 'Comprobando…' : 'Guardar' }}
          </button>
        </div>
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
    .section-actions { margin-left:auto; }
    .section-footer { display:flex; align-items:center; gap:10px; }
    .spacer { flex:1; }
    .steps { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--color-text-main); }
    .steps a { color:var(--color-brand); }
    .hint { font-size:12px; color:var(--color-text-muted); margin:0; }
    .field { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); display:flex; align-items:center; gap:6px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .mono { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12px; }
    .domains { display:flex; flex-direction:column; gap:8px; }
    .chips { display:flex; gap:8px; flex-wrap:wrap; }
    .warn { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--color-warning); }
    .check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-main); }
    .test { display:flex; gap:10px; flex-wrap:wrap; }
    .test .input { flex:1; min-width:220px; }
    @media (max-width: 700px) { .grid2 { grid-template-columns:1fr; } }
  `],
})
export class ResendSettingsComponent implements OnInit {
  private api = inject(ResendApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly MailCheck = MailCheck; readonly Save = Save; readonly Send = Send; readonly Trash2 = Trash2;
  readonly KeyRound = KeyRound; readonly CircleCheck = CircleCheck; readonly TriangleAlert = TriangleAlert;
  readonly ExternalLink = ExternalLink;

  config = signal<ResendConfig | null>(null);
  loading = signal(true);
  saving = signal(false);
  testing = signal(false);
  active = signal(false);

  apiKey = '';
  fromEmail = '';
  fromName = '';
  replyTo = '';
  ratePerMinute = 100;
  enabled = true;
  testTo = '';

  ngOnInit() {
    this.api.getConfig().subscribe({
      next: c => { this.apply(c); this.loading.set(false); },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(this.message(err, 'No se pudo cargar la cuenta de Resend'));
      },
    });
  }

  private apply(c: ResendConfig) {
    this.config.set(c);
    this.active.set(c.enabled && c.hasKey);
    this.apiKey = '';
    this.fromEmail = c.fromEmail;
    this.fromName = c.fromName;
    this.replyTo = c.replyTo;
    this.ratePerMinute = c.ratePerMinute;
    // Sin cuenta aún, la casilla viene marcada: lo normal es conectarla para usarla.
    this.enabled = c.hasKey ? c.enabled : true;
  }

  statusLabel(d: ResendDomain) {
    return d.status === 'verified' ? 'verificado' : d.status === 'pending' ? 'pendiente' : d.status;
  }

  save(then?: () => void) {
    this.saving.set(true);
    this.api
      .saveConfig({
        enabled: this.enabled,
        apiKey: this.apiKey.trim() || undefined,
        fromEmail: this.fromEmail.trim(),
        fromName: this.fromName.trim(),
        replyTo: this.replyTo.trim(),
        ratePerMinute: Number(this.ratePerMinute) || 100,
      })
      .subscribe({
        next: c => {
          this.saving.set(false);
          this.apply(c);
          this.toast.success(c.enabled ? 'Cuenta de Resend conectada' : 'Configuración guardada');
          then?.();
        },
        error: (err: ErrorLike) => {
          this.saving.set(false);
          this.toast.error(this.message(err, 'No se pudo guardar la cuenta de Resend'));
        },
      });
  }

  test() {
    // La prueba usa lo guardado: primero se guarda lo que haya en pantalla.
    this.save(() => {
      this.testing.set(true);
      this.api.test(this.testTo.trim()).subscribe({
        next: () => { this.testing.set(false); this.toast.success('Prueba enviada a ' + this.testTo.trim()); },
        error: (err: ErrorLike) => {
          this.testing.set(false);
          this.toast.error(this.message(err, 'Resend rechazó el envío de prueba'));
        },
      });
    });
  }

  async disconnect() {
    const ok = await this.confirm.confirm({
      title: 'Desconectar Resend',
      message: 'Se borrará la API key guardada. Las campañas de email volverán a salir por el remitente de la plataforma.',
      confirmText: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    this.api.remove().subscribe({
      next: () => {
        this.toast.success('Cuenta de Resend desconectada');
        this.apply({
          enabled: false, hasKey: false, keyHint: '', fromEmail: '', fromName: '', replyTo: '',
          ratePerMinute: 100, domains: [], fromVerified: null,
        });
      },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo desconectar')),
    });
  }

  private message(err: ErrorLike, fallback: string): string {
    const m = err.error?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
  }
}
