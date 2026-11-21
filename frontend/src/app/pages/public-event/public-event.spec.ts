import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PublicEventComponent } from './public-event';
import type { SpotifyController, SpotifyIframeApi } from '../../shared/landing-music';
import { resetSpotifyIframeApiForTests } from '../../shared/landing-music';
import { setHostForTests } from '../../shared/custom-domain';

type Music = { embedCode: string; audioUrl?: string };

describe('PublicEventComponent: música (HU22)', () => {
  let fixture: ComponentFixture<PublicEventComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const btn = () => el().querySelector('.pe-music-btn') as HTMLButtonElement | null;
  const win = window as unknown as Record<string, unknown>;

  async function load(music: Music) {
    http.expectOne((r) => r.url.endsWith('/public/events/fiesta')).flush({
      event: {
        _id: 'e1', title: 'Fiesta', date: '2026-12-01', capacity: 0, price: 0, status: 'published',
        invitationDesign: { version: '1', background: { type: 'color', color: '#000' }, elements: [], music },
      },
      registrationsCount: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  }
  const click = async () => {
    btn()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicEventComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'fiesta' }), queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicEventComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    resetSpotifyIframeApiForTests();
    delete win['SpotifyIframeApi'];
    vi.restoreAllMocks();
  });

  it('sin música no hay botón', async () => {
    await load({ embedCode: '' });
    expect(btn()).toBeNull();
  });

  it('C2: con audio subido hay un solo botón, sin iframe, y un clic reproduce y otro pausa', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    let paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { paused = true; });
    await load({ embedCode: '<iframe src="https://open.spotify.com/embed/track/abc"></iframe>', audioUrl: 'https://x/a.mp3' });

    expect(el().querySelector('iframe')).toBeNull();
    expect(el().querySelector('audio')!.getAttribute('src')).toBe('https://x/a.mp3');
    expect(btn()!.getAttribute('aria-pressed')).toBe('false');

    await click();
    paused = false;
    expect(play).toHaveBeenCalledTimes(1);
    expect(btn()!.getAttribute('aria-pressed')).toBe('true');
    expect(btn()!.getAttribute('aria-label')).toBe('Pausar música');

    await click();
    expect(pause).toHaveBeenCalled();
    expect(btn()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('C2: si el navegador rechaza la reproducción el botón vuelve a play', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    await load({ embedCode: '', audioUrl: 'https://x/a.mp3' });
    await click();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(btn()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('C3: con Spotify el clic ordena play() al reproductor, sin segundo clic', async () => {
    let listener: ((e: { data: { isPaused: boolean } }) => void) | undefined;
    const controller = {
      play: vi.fn(), togglePlay: vi.fn(), pause: vi.fn(), destroy: vi.fn(),
      addListener: vi.fn((ev: string, cb: (e?: unknown) => void) => {
        if (ev === 'ready') cb();
        else listener = cb as typeof listener;
      }),
    } as unknown as SpotifyController;
    const api: SpotifyIframeApi = { createController: vi.fn((_el, _o, cb) => cb(controller)) };
    win['SpotifyIframeApi'] = api;

    await load({ embedCode: '<iframe src="https://open.spotify.com/embed/track/4uLU6hMC?utm_source=generator" height="352"></iframe>' });
    // Se prepara al cargar, plegado.
    expect(api.createController).toHaveBeenCalledWith(
      expect.any(HTMLElement), expect.objectContaining({ uri: 'spotify:track:4uLU6hMC', height: 80 }), expect.any(Function),
    );
    expect(el().querySelector('.pe-music-collapsed')).not.toBeNull();

    await click();
    expect(controller.togglePlay).toHaveBeenCalledTimes(1);
    expect(el().querySelector('.pe-music-collapsed')).toBeNull();

    listener!({ data: { isPaused: false } });
    fixture.detectChanges();
    expect(btn()!.getAttribute('aria-pressed')).toBe('true');
    listener!({ data: { isPaused: true } });
    fixture.detectChanges();
    expect(btn()!.getAttribute('aria-pressed')).toBe('false');
  });

  function pendingSpotify() {
    let onReady: (() => void) | undefined;
    const controller = {
      play: vi.fn(), togglePlay: vi.fn(), pause: vi.fn(), destroy: vi.fn(),
      addListener: vi.fn((ev: string, cb: () => void) => { if (ev === 'ready') onReady = cb; }),
    } as unknown as SpotifyController;
    win['SpotifyIframeApi'] = { createController: vi.fn((_el, _o, cb) => cb(controller)) };
    return { controller, ready: () => onReady!() };
  }

  it('C3: si pulsa antes de que el reproductor esté listo, reproduce al quedar listo (evento ready)', async () => {
    const { controller, ready } = pendingSpotify();
    await load({ embedCode: 'https://open.spotify.com/playlist/37i9dQ' });
    await click();
    expect(controller.play).not.toHaveBeenCalled();
    expect(controller.togglePlay).not.toHaveBeenCalled();
    ready();
    expect(controller.play).toHaveBeenCalledTimes(1);
  });

  it('C3: un segundo clic mientras carga cancela la reproducción', async () => {
    const { controller, ready } = pendingSpotify();
    await load({ embedCode: 'https://open.spotify.com/playlist/37i9dQ' });
    await click();
    await click();
    expect(btn()!.getAttribute('aria-pressed')).toBe('false');
    ready();
    expect(controller.play).not.toHaveBeenCalled();
  });

  it('R4: otro embed se monta al pulsar, como antes', async () => {
    await load({ embedCode: '<iframe src="https://w.soundcloud.com/player/?url=x"></iframe>' });
    expect(el().querySelector('iframe')).toBeNull();
    await click();
    const iframe = el().querySelector('.pe-music-compact iframe');
    expect(iframe!.getAttribute('src')).toContain('auto_play=true');
  });
});

describe('PublicEventComponent: marca de la empresa (HU26)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PublicEventComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const icon = () => document.head.querySelector('link[rel~="icon"]')!.getAttribute('href');

  beforeEach(async () => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
    document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="/favicon.ico">');
    document.title = 'Maya CRM';
    await TestBed.configureTestingModule({
      imports: [PublicEventComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'fiesta' }), queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicEventComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    document.head.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
  });

  const flush = (brand: unknown) => {
    http.expectOne((r) => r.url.endsWith('/public/events/fiesta')).flush({
      event: { _id: 'e1', title: 'Fiesta 2030', date: '2030-01-01', capacity: 0, price: 0, status: 'published' },
      registrationsCount: 0,
      brand,
    });
    fixture.detectChanges();
  };

  it('C6, C7: muestra el logo con el nombre y pone favicon y título del evento', () => {
    flush({ name: 'Fiestas SAC', logo: 'https://cdn.x/logo.png', favicon: 'https://cdn.x/icon.png' });
    const img = el().querySelector('.pe-brand img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.x/logo.png');
    expect(img.getAttribute('alt')).toBe('Fiestas SAC');
    expect(icon()).toBe('https://cdn.x/icon.png');
    expect(document.title).toBe('Fiesta 2030');
  });

  it('C6: sin logo no hay píldora de marca y se conserva el favicon de Maya', () => {
    flush({ name: 'Fiestas SAC' });
    expect(el().querySelector('.pe-brand')).toBeNull();
    expect(icon()).toBe('/favicon.ico');
  });

  it('C8: al salir de la landing se restauran favicon y título', () => {
    flush({ name: 'Fiestas SAC', favicon: 'https://cdn.x/icon.png' });
    fixture.destroy();
    expect(icon()).toBe('/favicon.ico');
    expect(document.title).toBe('Maya CRM');
  });
});

describe('PublicEventComponent: dominio propio (HU25)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PublicEventComponent>;

  beforeEach(async () => {
    setHostForTests('fiesta.miempresa.com');
    await TestBed.configureTestingModule({
      imports: [PublicEventComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        // La raíz del dominio no trae slug.
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PublicEventComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    setHostForTests(null);
  });

  it('C4: sin slug busca el evento por el host y lo carga', () => {
    const resolve = http.expectOne((r) => r.url.endsWith('/public/landing-domains/resolve'));
    expect(resolve.request.params.get('host')).toBe('fiesta.miempresa.com');
    resolve.flush({ slug: 'fiesta-2030' });
    http.expectOne((r) => r.url.endsWith('/public/events/fiesta-2030')).flush({
      event: { _id: 'e1', title: 'Fiesta 2030', date: '2030-01-01', capacity: 0, price: 0, status: 'published' },
      registrationsCount: 0,
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Fiesta 2030');
  });

  it('C4: un dominio sin evento activo muestra «no encontrado»', () => {
    http.expectOne((r) => r.url.endsWith('/public/landing-domains/resolve'))
      .flush({ message: 'x' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.componentInstance.notFound()).toBe(true);
    http.expectNone((r) => r.url.includes('/public/events/'));
  });
});
