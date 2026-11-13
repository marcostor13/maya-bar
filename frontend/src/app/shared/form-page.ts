import {
  Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, booleanAttribute, inject, input, output,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule, ArrowLeft } from 'lucide-angular';
import { ConfirmService } from './confirm';

/** Parámetro de la URL que marca que hay un formulario abierto. */
export const FORM_QUERY_PARAM = 'form';

/**
 * Pantalla completa para crear o editar un registro (reemplaza al panel
 * lateral). La página la muestra con `@if`, pasa los campos como contenido y
 * los botones en el slot `[formActions]`.
 *
 * - Con `urlKey`, añade `?form=<urlKey>` a la URL: el botón atrás del
 *   navegador (o del móvil) cierra el formulario en vez de salir de la página.
 * - Con `dirty` en true, pregunta antes de cerrar y perder los cambios.
 * - ESC y la flecha de volver emiten `closed`; guardar lo maneja la página.
 */
@Component({
  selector: 'app-form-page',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="form-page animate-fade-in" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
      <header class="form-page-bar">
        <button type="button" class="btn btn-ghost btn-icon back" (click)="requestClose()" [attr.aria-label]="'Volver a ' + backLabel()">
          <lucide-icon [img]="ArrowLeft" [size]="20" [strokeWidth]="2.5"></lucide-icon>
        </button>
        <div class="titles">
          <span class="crumb">{{ backLabel() }}</span>
          <h1 [id]="titleId" tabindex="-1" #heading>{{ title() }}</h1>
          @if (subtitle()) { <p class="sub">{{ subtitle() }}</p> }
        </div>
        <div class="bar-actions"><ng-content select="[formActions]" /></div>
      </header>
      <div class="form-page-body">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 95; display: block; }
    .form-page { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--color-bg-app); }
    .form-page-bar {
      display: flex; align-items: center; gap: 16px; padding: 16px 40px;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
      padding-left: calc(40px + env(safe-area-inset-left, 0px));
      padding-right: calc(40px + env(safe-area-inset-right, 0px));
      background: var(--color-white); border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .back { flex-shrink: 0; }
    .titles { flex: 1; min-width: 0; }
    .crumb { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .4px; }
    h1 { margin: 0; font-family: var(--font-heading); font-size: 22px; font-weight: 800; letter-spacing: -.4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; outline: none; }
    .sub { margin: 2px 0 0; font-size: 13px; color: var(--color-text-muted); }
    .bar-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .form-page-body {
      flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      width: 100%; box-sizing: border-box; padding: 32px 40px;
      padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
      padding-left: calc(40px + env(safe-area-inset-left, 0px));
      padding-right: calc(40px + env(safe-area-inset-right, 0px));
    }
    @media (max-width: 768px) {
      .form-page-bar {
        padding: 12px 16px; padding-top: calc(12px + env(safe-area-inset-top, 0px));
        padding-left: calc(16px + env(safe-area-inset-left, 0px));
        padding-right: calc(16px + env(safe-area-inset-right, 0px));
        flex-wrap: wrap; gap: 10px;
      }
      .bar-actions { width: 100%; }
      .bar-actions ::ng-deep .btn { flex: 1 1 auto; }
      h1 { font-size: 19px; }
      .form-page-body {
        padding: 20px 16px; padding-bottom: calc(32px + env(safe-area-inset-bottom, 0px));
        padding-left: calc(16px + env(safe-area-inset-left, 0px));
        padding-right: calc(16px + env(safe-area-inset-right, 0px));
      }
    }
  `],
})
export class FormPageComponent implements OnInit {
  private hostEl = inject(ElementRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  readonly ArrowLeft = ArrowLeft;
  private static seq = 0;
  readonly titleId = `form-page-title-${++FormPageComponent.seq}`;

  title = input.required<string>();
  subtitle = input<string>('');
  /** A qué pantalla se vuelve (texto del enlace y de la miga). */
  backLabel = input<string>('Volver');
  /** Hay cambios sin guardar: se pregunta antes de cerrar. */
  dirty = input(false, { transform: booleanAttribute });
  /** Valor de `?form=` (p. ej. "nuevo" o el id). Sin él, la URL no cambia. */
  urlKey = input<string>('');

  closed = output<void>();

  @ViewChild('heading', { static: true }) heading!: ElementRef<HTMLElement>;

  private location = inject(Location);

  private pushedUrl = false;
  private closing = false;
  private asking = false;
  /** Formulario con `?form=` vigente: al abrir otro encima, le pasa la entrada. */
  private static urlOwner: FormPageComponent | null = null;

  ngOnInit() {
    // Al cerrar, el foco vuelve a lo que abrió el formulario (teclado / lector).
    const opener = document.activeElement as HTMLElement | null;
    this.destroyRef.onDestroy(() => {
      if (opener?.isConnected) opener.focus();
    });
    queueMicrotask(() => this.heading.nativeElement.focus());
    const key = this.urlKey();
    if (key) {
      // De ficha a edición (o similar): el nuevo reemplaza la entrada del
      // anterior en vez de apilar otra, y el anterior ya no la toca.
      const prev = FormPageComponent.urlOwner;
      const handOff = !!prev && prev !== this && prev.pushedUrl;
      if (handOff) prev!.pushedUrl = false;
      FormPageComponent.urlOwner = this;
      this.pushedUrl = true;
      this.pushKey(handOff);
      // Atrás del navegador: el parámetro desaparece y se cierra el formulario
      // (preguntando si hay cambios). Solo cuenta cuando el parámetro ya
      // estuvo: la primera lectura es la URL de antes de añadirlo.
      let seen = false;
      const sub = this.route.queryParamMap.subscribe((params) => {
        if (params.get(FORM_QUERY_PARAM) !== null) { seen = true; return; }
        if (seen && this.pushedUrl && !this.closing) void this.onBrowserBack();
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
    this.destroyRef.onDestroy(() => {
      this.clearUrl();
      if (FormPageComponent.urlOwner === this) FormPageComponent.urlOwner = null;
    });
  }

  private pushKey(replaceUrl = false) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [FORM_QUERY_PARAM]: this.urlKey() },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  /** Atrás del navegador o del móvil: igual que la flecha, con aviso si hay cambios. */
  private async onBrowserBack() {
    if (this.asking) return;
    if (this.dirty()) {
      this.asking = true;
      const ok = await this.askDiscard();
      this.asking = false;
      if (!ok) {
        // Sigue editando: se vuelve a poner la entrada que atrás quitó.
        this.pushKey();
        return;
      }
    }
    this.pushedUrl = false;
    this.closing = true;
    this.closed.emit();
  }

  /** Teclado: el foco no sale de la pantalla hacia el listado tapado. */
  @HostListener('keydown.tab', ['$event'])
  @HostListener('keydown.shift.tab', ['$event'])
  onTab(event: Event) {
    const e = event as KeyboardEvent;
    const root = (this.hostEl.nativeElement as HTMLElement).querySelector('.form-page');
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    // Si hay un modal o confirmación abierto encima, ESC es para ese diálogo.
    // Se mira el DOM (y no el orden de los listeners) porque la página puede
    // haber cerrado ya su modal en este mismo evento sin repintar todavía.
    if (event.defaultPrevented || this.otherDialogOpen()) return;
    event.stopImmediatePropagation();
    void this.requestClose();
  }

  private otherDialogOpen(): boolean {
    const own = (this.hostEl.nativeElement as HTMLElement).querySelector('.form-page');
    return Array.from(document.querySelectorAll('[aria-modal="true"], .overlay, .confirm-backdrop')).some(
      (el) => el !== own && !el.contains(own),
    );
  }

  /** Volver: pregunta si hay cambios sin guardar. */
  async requestClose() {
    if (this.dirty() && !(await this.askDiscard())) return;
    this.closing = true;
    this.closed.emit();
  }

  private askDiscard(): Promise<boolean> {
    return this.confirm.confirm({
      title: 'Descartar cambios',
      message: 'Tienes cambios sin guardar. Si sales ahora se pierden.',
      confirmText: 'Salir sin guardar',
      cancelText: 'Seguir editando',
      danger: true,
    });
  }

  /**
   * Al cerrar (guardado o cancelado) se deshace la entrada `?form=` que se
   * añadió al abrir: volviendo atrás, para no dejar en el historial un paso
   * "vacío" que obligue a pulsar atrás dos veces para salir de la página.
   */
  private clearUrl() {
    if (!this.pushedUrl) return;
    this.pushedUrl = false;
    const current = this.router.parseUrl(this.router.url).queryParamMap.get(FORM_QUERY_PARAM);
    if (current === this.urlKey()) this.location.back();
  }
}

/** Compara el formulario con como estaba al abrirlo (para `dirty`). */
export function snapshotOf(value: unknown): string {
  return JSON.stringify(value);
}
