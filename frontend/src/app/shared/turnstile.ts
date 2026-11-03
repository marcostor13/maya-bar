import {
  Component, ElementRef, OnDestroy, PLATFORM_ID, afterNextRender, inject, input, output, viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptLoading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return scriptLoading;
}

/**
 * Captcha de Cloudflare Turnstile. Emite el token cuando la persona pasa la
 * comprobación y `null` cuando caduca o falla. Cada token vale una sola vez:
 * tras un envío fallido hay que llamar a `reset()` para obtener otro.
 */
@Component({
  selector: 'app-turnstile',
  standalone: true,
  template: `<div #box class="turnstile-box"></div>`,
  styles: [`.turnstile-box { display: flex; justify-content: center; min-height: 65px; }`],
})
export class TurnstileComponent implements OnDestroy {
  siteKey = input.required<string>();
  token = output<string | null>();

  private box = viewChild.required<ElementRef<HTMLElement>>('box');
  private widgetId: string | null = null;
  private browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    afterNextRender(() => {
      if (!this.browser) return;
      loadScript()
        .then(() => {
          this.widgetId = window.turnstile!.render(this.box().nativeElement, {
            sitekey: this.siteKey(),
            language: 'es',
            callback: (t: string) => this.token.emit(t),
            'expired-callback': () => this.token.emit(null),
            'error-callback': () => this.token.emit(null),
          });
        })
        .catch(() => this.token.emit(null));
    });
  }

  reset() {
    this.token.emit(null);
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
  }

  ngOnDestroy() {
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}
