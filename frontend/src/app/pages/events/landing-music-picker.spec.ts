import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { LandingMusicPickerComponent, type LandingMusic } from './landing-music-picker';
import { EventsApiService } from '../../core/api/events-api.service';
import { ToastService } from '../../shared/toast';

describe('LandingMusicPickerComponent (HU22)', () => {
  let fixture: ComponentFixture<LandingMusicPickerComponent>;
  const toast = { success: vi.fn(), error: vi.fn() };
  const api = { upload: vi.fn() };
  let emitted: LandingMusic[];
  const el = () => fixture.nativeElement as HTMLElement;

  const pick = async (file: File) => {
    const input = el().querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const setMusic = (m: LandingMusic) => {
    fixture.componentRef.setInput('music', m);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    emitted = [];
    await TestBed.configureTestingModule({
      imports: [LandingMusicPickerComponent],
      providers: [
        { provide: EventsApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LandingMusicPickerComponent);
    fixture.componentInstance.musicChange.subscribe((m) => emitted.push(m));
    setMusic({ embedCode: 'https://open.spotify.com/track/abc' });
  });

  it('C1: subir un audio guarda su URL y nombre sin perder el embed', async () => {
    api.upload.mockReturnValue(of({ url: 'https://s3/a.mp3', key: 'events/a.mp3', contentType: 'audio/mpeg' }));
    await pick(new File(['x'], 'cancion.mp3', { type: 'audio/mpeg' }));
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(emitted.at(-1)).toEqual({
      embedCode: 'https://open.spotify.com/track/abc',
      audioUrl: 'https://s3/a.mp3',
      audioName: 'cancion.mp3',
    });
    expect(toast.success).toHaveBeenCalledWith('Audio subido');
  });

  it('C1: si la subida falla avisa con un toast y no cambia nada', async () => {
    api.upload.mockReturnValue(throwError(() => ({ error: { message: 'Tipo de archivo no permitido' } })));
    await pick(new File(['x'], 'a.flac', { type: 'audio/flac' }));
    expect(toast.error).toHaveBeenCalledWith('Tipo de archivo no permitido');
    expect(emitted).toHaveLength(0);
  });

  it('C1: rechaza un audio de más de 30 MB sin subirlo', async () => {
    const big = new File(['x'], 'big.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 });
    await pick(big);
    expect(api.upload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('30 MB'));
  });

  it('C1/R6: con audio muestra su reproductor de prueba y «Quitar audio» lo borra', () => {
    setMusic({ embedCode: 'x', audioUrl: 'https://s3/a.mp3', audioName: 'cancion.mp3' });
    expect(el().querySelector('audio')!.getAttribute('src')).toBe('https://s3/a.mp3');
    expect(el().textContent).toContain('cancion.mp3');
    (Array.from(el().querySelectorAll('button')).find((b) => b.textContent!.includes('Quitar audio')) as HTMLButtonElement).click();
    expect(emitted.at(-1)).toEqual({ embedCode: 'x' });
  });

  it('un enlace de Spotify se previsualiza en tamaño compacto', () => {
    const iframe = el().querySelector('iframe.lm-preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://open.spotify.com/embed/track/abc');
    expect(iframe.getAttribute('height')).toBe('80');
  });

  it('editar el texto emite el embed conservando el audio', () => {
    setMusic({ embedCode: '', audioUrl: 'https://s3/a.mp3', audioName: 'a.mp3' });
    const ta = el().querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'https://open.spotify.com/album/z';
    ta.dispatchEvent(new Event('input'));
    expect(emitted.at(-1)).toEqual({ embedCode: 'https://open.spotify.com/album/z', audioUrl: 'https://s3/a.mp3', audioName: 'a.mp3' });
  });
});
