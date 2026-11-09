import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  LucideAngularModule, Bell, BellOff, BellRing, Share, Plus, Check, Smartphone, Monitor, Trash2, Send,
} from 'lucide-angular';
import { PushDevice, PushPrefs, PushService } from './push.service';
import { NativePushService } from '../core/push.service';
import { PlatformService } from '../core/platform.service';
import { ToastService } from './toast';
import { ConfirmService } from './confirm';

/** Estado de las notificaciones en el dispositivo actual. */
export type DevicePushState =
  | 'unsupported' | 'too-old' | 'needs-install' | 'server-off' | 'denied' | 'on' | 'off';

/** Tipos de aviso que el usuario puede apagar. */
const CATEGORIES: { key: keyof Omit<PushPrefs, 'muted'>; label: string; hint: string }[] = [
  { key: 'chats', label: 'Chats', hint: 'Mensajes nuevos y chats derivados por el agente IA' },
  { key: 'forms', label: 'Formularios', hint: 'Registros nuevos en tus formularios' },
  { key: 'leads', label: 'Leads', hint: 'Leads asignados y recordatorios de seguimiento' },
  { key: 'recovery', label: 'Recuperación', hint: 'Avisos de la recuperación de clientes' },
  { key: 'calls', label: 'Llamadas', hint: 'Llamadas de WhatsApp entrantes' },
];

/**
 * Panel completo de notificaciones: estado y alta del dispositivo actual (app
 * Android o navegador, también la PWA de iPhone), lista de dispositivos,
 * qué avisos recibir y notificación de prueba.
 *
 * Se usa en la campana de la cabecera (la ve todo el equipo) y en
 * Configuración. El permiso del sistema solo se pide al pulsar "Activar".
 */
@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [LucideAngularModule, DatePipe],
  template: `
    <section class="np" aria-label="Notificaciones de este dispositivo">
      @switch (state()) {
        @case ('unsupported') {
          <p class="note">Este navegador no admite notificaciones push. Usa Chrome, Edge o Safari actualizados, o la app de Android.</p>
        }
        @case ('too-old') {
          <p class="note warn">Tu iPhone necesita iOS 16.4 o superior para recibir notificaciones. Actualízalo en <strong>Ajustes → General → Actualización de software</strong>.</p>
        }
        @case ('needs-install') {
          <p class="note">En iPhone y iPad las notificaciones solo funcionan con Maya instalada en la pantalla de inicio.</p>
          <ol class="steps">
            <li><lucide-icon [img]="Share" [size]="15" [strokeWidth]="2.2"></lucide-icon> Toca <strong>Compartir</strong> en la barra de Safari.</li>
            <li><lucide-icon [img]="Plus" [size]="15" [strokeWidth]="2.2"></lucide-icon> Elige <strong>Añadir a pantalla de inicio</strong>.</li>
            <li><lucide-icon [img]="BellRing" [size]="15" [strokeWidth]="2.2"></lucide-icon> Abre Maya desde el ícono nuevo, inicia sesión y vuelve aquí para activarlas.</li>
          </ol>
        }
        @case ('server-off') {
          <p class="note warn">Las notificaciones aún no están habilitadas en el servidor para {{ isNative ? 'la app' : 'el navegador' }}. Pide a tu administrador que siga la guía de notificaciones push.</p>
        }
        @case ('denied') {
          <p class="note warn">Bloqueaste las notificaciones. {{ deniedHelp() }}</p>
        }
        @case ('on') {
          <div class="status ok" role="status">
            <lucide-icon [img]="Check" [size]="16" [strokeWidth]="2.6"></lucide-icon>
            Notificaciones activas en este dispositivo.
          </div>
          <div class="actions">
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="test()">
              <lucide-icon [img]="Send" [size]="15" [strokeWidth]="2.2"></lucide-icon> Enviar prueba
            </button>
            <button type="button" class="btn btn-ghost danger" [disabled]="busy()" (click)="disable()">
              <lucide-icon [img]="BellOff" [size]="16" [strokeWidth]="2.2"></lucide-icon> Desactivar
            </button>
          </div>
        }
        @default {
          <p class="note">Recibe un aviso en este dispositivo por cada mensaje nuevo, lead o registro, aunque tengas la app cerrada.</p>
          <button type="button" class="btn btn-primary full" [disabled]="busy()" (click)="enable()">
            <lucide-icon [img]="BellRing" [size]="17" [strokeWidth]="2.2"></lucide-icon>
            {{ busy() ? 'Activando…' : 'Activar notificaciones' }}
          </button>
        }
      }
    </section>

    @if (prefs(); as p) {
      <section class="np-block" aria-labelledby="np-prefs-title">
        <h3 id="np-prefs-title">Qué avisos recibir</h3>
        <label class="pref mute">
          <input type="checkbox" role="switch" [checked]="p.muted" [attr.aria-checked]="p.muted"
                 (change)="savePref('muted', $any($event.target).checked)" />
          <span><strong>Silenciar todo</strong><small>No recibirás ningún aviso en ningún dispositivo.</small></span>
        </label>
        @for (c of categories; track c.key) {
          <label class="pref" [class.off]="p.muted">
            <input type="checkbox" role="switch" [checked]="p[c.key]" [attr.aria-checked]="p[c.key]" [disabled]="p.muted"
                   (change)="savePref(c.key, $any($event.target).checked)" />
            <span><strong>{{ c.label }}</strong><small>{{ c.hint }}</small></span>
          </label>
        }
      </section>
    }

    <section class="np-block" aria-labelledby="np-devices-title">
      <h3 id="np-devices-title">Tus dispositivos</h3>
      @if (loadingDevices()) {
        <p class="note">Cargando…</p>
      } @else if (devices().length === 0) {
        <p class="note">Aún no tienes ningún dispositivo con notificaciones.</p>
      } @else {
        <ul class="devices">
          @for (d of devices(); track d.kind + d.id) {
            <li>
              <lucide-icon [img]="d.kind === 'web' && !d.installed ? Monitor : Smartphone" [size]="18" [strokeWidth]="2.2"></lucide-icon>
              <div class="dev-info">
                <strong>{{ d.label }}@if (d.kind === 'web' && d.installed) { · app instalada }</strong>
                <small>
                  @if (isCurrent(d)) { <span class="current">Este dispositivo</span> · }
                  Activo desde {{ d.createdAt | date: 'd MMM y' }}
                  @if (d.lastSeenAt) { · último uso {{ d.lastSeenAt | date: 'd MMM, HH:mm' }} }
                </small>
              </div>
              <button type="button" class="btn-icon btn-ghost" (click)="remove(d)" [attr.aria-label]="'Quitar ' + d.label">
                <lucide-icon [img]="Trash2" [size]="16" [strokeWidth]="2.2"></lucide-icon>
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 22px; }
    .np { display: flex; flex-direction: column; gap: 14px; }
    .note { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--color-text-muted); }
    .note.warn { color: var(--color-text-main); background: var(--color-bg-light); border-radius: var(--radius-md); padding: 12px 16px; }
    .steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; }
    .steps lucide-icon { vertical-align: -3px; margin-right: 4px; color: var(--color-brand); }
    .status { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--radius-md); font-size: 13.5px; font-weight: 600; }
    .status.ok { background: var(--color-bg-light); color: var(--color-success); }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .actions .btn { flex: 1; gap: 8px; min-height: 44px; }
    .btn-ghost { background: transparent; border: 1px solid var(--color-border); color: var(--color-text-muted); }
    .btn-ghost.danger { color: var(--color-error); }
    .full { width: 100%; gap: 8px; min-height: 46px; }

    .np-block { display: flex; flex-direction: column; gap: 10px; }
    .np-block h3 { margin: 0; font-family: var(--font-heading); font-size: 15px; }
    .pref { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; padding: 6px 0; }
    .pref.off { opacity: 0.5; }
    .pref span { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; }
    .pref small { color: var(--color-text-muted); font-size: 12.5px; }
    .pref input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--color-brand); flex-shrink: 0; }
    .pref input:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }

    .devices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .devices li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .devices lucide-icon { color: var(--color-text-muted); flex-shrink: 0; }
    .dev-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13.5px; }
    .dev-info small { color: var(--color-text-muted); font-size: 12px; }
    .current { color: var(--color-brand); font-weight: 600; }
    .btn-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  `],
})
export class NotificationsPanelComponent implements OnInit {
  web = inject(PushService);
  native = inject(NativePushService);
  private platform = inject(PlatformService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Bell = Bell;
  readonly BellOff = BellOff;
  readonly BellRing = BellRing;
  readonly Share = Share;
  readonly Plus = Plus;
  readonly Check = Check;
  readonly Smartphone = Smartphone;
  readonly Monitor = Monitor;
  readonly Trash2 = Trash2;
  readonly Send = Send;
  readonly categories = CATEGORIES;
  readonly isNative = this.platform.isNative;

  devices = signal<PushDevice[]>([]);
  loadingDevices = signal(true);
  prefs = signal<PushPrefs | null>(null);
  private working = signal(false);

  busy = computed(() => this.working() || this.web.busy());

  state = computed<DevicePushState>(() => {
    if (this.isNative) {
      if (!this.native.serverEnabled()) return 'server-off';
      if (this.native.permission() === 'denied') return 'denied';
      return this.native.permission() === 'granted' && this.native.registered() ? 'on' : 'off';
    }
    if (this.web.iosTooOld()) return 'too-old';
    if (this.web.needsInstall()) return 'needs-install';
    if (!this.web.supported()) return 'unsupported';
    if (!this.web.serverEnabled()) return 'server-off';
    if (this.web.permission() === 'denied') return 'denied';
    return this.web.permission() === 'granted' && this.web.subscribed() ? 'on' : 'off';
  });

  /** Cómo reactivar un permiso negado en esta plataforma. */
  deniedHelp = computed(() => {
    if (this.isNative)
      return 'Android no vuelve a preguntar: actívalas en Ajustes → Aplicaciones → Maya → Notificaciones.';
    switch (this.web.deviceKind()) {
      case 'ios':
        return 'Actívalas en Ajustes del iPhone → Notificaciones → Maya CRM.';
      case 'android':
        return 'Mantén pulsado el ícono de Maya → Información de la app → Notificaciones, o en Chrome: Configuración → Configuración de sitios → Notificaciones.';
      default:
        return 'Vuelve a permitirlas desde el candado de la barra de direcciones y recarga la página.';
    }
  });

  ngOnInit(): void {
    void this.loadDevices();
    void this.web.preferences().then(p => this.prefs.set(p)).catch(() => this.prefs.set(null));
  }

  async loadDevices(): Promise<void> {
    this.loadingDevices.set(true);
    try {
      this.devices.set(await this.web.devices());
    } catch {
      this.devices.set([]);
    } finally {
      this.loadingDevices.set(false);
    }
  }

  isCurrent(d: PushDevice): boolean {
    const current = d.kind === 'web' ? this.web.currentDeviceId() : this.native.currentDeviceId();
    return !!current && current === d.id;
  }

  async enable(): Promise<void> {
    this.working.set(true);
    try {
      const ok = this.isNative ? await this.native.enable() : await this.web.enable();
      if (ok) {
        this.toast.success('Notificaciones activadas en este dispositivo');
        await this.loadDevices();
      } else if (!this.isNative) {
        this.toast.error(
          this.web.permission() === 'denied'
            ? 'El navegador bloqueó las notificaciones'
            : 'No se pudieron activar las notificaciones',
        );
      }
    } finally {
      this.working.set(false);
    }
  }

  async disable(): Promise<void> {
    this.working.set(true);
    try {
      if (this.isNative) await this.native.turnOff();
      else await this.web.disable();
      this.toast.info('Ya no recibirás avisos en este dispositivo');
      await this.loadDevices();
    } finally {
      this.working.set(false);
    }
  }

  async test(): Promise<void> {
    try {
      const sent = await this.web.sendTest();
      if (sent > 0) this.toast.success('Notificación de prueba enviada');
      else this.toast.warning('No hay dispositivos activos para tu usuario');
    } catch {
      this.toast.error('No se pudo enviar la prueba');
    }
  }

  async remove(d: PushDevice): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Quitar dispositivo',
      message: `"${d.label}" dejará de recibir notificaciones.`,
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      const current = this.isCurrent(d);
      await this.web.removeDevice(d);
      // Quitar el dispositivo en el que se está: que no se vuelva a dar de alta solo.
      if (current) await (d.kind === 'web' ? this.web.disable() : this.native.turnOff());
      this.devices.update(list => list.filter(x => !(x.kind === d.kind && x.id === d.id)));
      this.toast.success('Dispositivo quitado');
    } catch (err: unknown) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || 'No se pudo quitar el dispositivo');
    }
  }

  async savePref(key: keyof PushPrefs, value: boolean): Promise<void> {
    const prev = this.prefs();
    if (prev) this.prefs.set({ ...prev, [key]: value });
    try {
      this.prefs.set(await this.web.savePreferences({ [key]: value }));
      this.toast.success('Preferencias guardadas');
    } catch {
      this.prefs.set(prev);
      this.toast.error('No se pudieron guardar las preferencias');
    }
  }
}
