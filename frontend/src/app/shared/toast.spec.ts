import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ToastComponent, ToastService } from './toast';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(ToastService);
  });
  afterEach(() => vi.useRealTimers());

  it('cada atajo crea el aviso con su tipo y su duración', () => {
    service.success('ok');
    service.error('mal', 'Ups');
    service.warning('ojo');
    service.info('dato');
    expect(service.toasts().map((t) => [t.type, t.message, t.duration, t.title])).toEqual([
      ['success', 'ok', 4000, undefined],
      ['error', 'mal', 5000, 'Ups'],
      ['warning', 'ojo', 4500, undefined],
      ['info', 'dato', 4000, undefined],
    ]);
  });

  it('show devuelve un id único y por defecto es info de 4 s', () => {
    const a = service.show('uno');
    const b = service.show('dos');
    expect(a).not.toBe(b);
    expect(service.toasts()[0]).toEqual({ id: a, type: 'info', title: undefined, message: 'uno', duration: 4000 });
  });

  it('se cierra solo al cumplirse la duración, tras la animación de salida', () => {
    const id = service.success('Guardado');
    vi.advanceTimersByTime(3999);
    expect(service.closing().has(id)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(service.closing().has(id)).toBe(true);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(350);
    expect(service.toasts()).toHaveLength(0);
    expect(service.closing().has(id)).toBe(false);
  });

  it('el error dura más que el éxito', () => {
    service.success('ok');
    service.error('mal');
    vi.advanceTimersByTime(4000 + 350);
    expect(service.toasts().map((t) => t.type)).toEqual(['error']);
    vi.advanceTimersByTime(1000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('dismiss cierra solo el aviso indicado', () => {
    const a = service.info('a');
    service.info('b');
    service.dismiss(a);
    vi.advanceTimersByTime(350);
    expect(service.toasts().map((t) => t.message)).toEqual(['b']);
  });
});

describe('ToastComponent', () => {
  let fixture: ComponentFixture<ToastComponent>;
  let service: ToastService;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(ToastComponent);
    service = TestBed.inject(ToastService);
    fixture.detectChanges();
  });
  afterEach(() => vi.useRealTimers());

  it('sin avisos no pinta ninguno', () => {
    expect(el().querySelectorAll('.toast')).toHaveLength(0);
  });

  it('pinta mensaje, título y tipo de cada aviso', () => {
    service.success('Guardado correctamente');
    service.error('No se pudo guardar', 'Error');
    fixture.detectChanges();
    const toasts = el().querySelectorAll('.toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0].getAttribute('data-type')).toBe('success');
    expect(toasts[0].querySelector('.toast-message')!.textContent).toContain('Guardado correctamente');
    expect(toasts[0].querySelector('.toast-title')).toBeNull();
    expect(toasts[1].getAttribute('data-type')).toBe('error');
    expect(toasts[1].querySelector('.toast-title')!.textContent).toContain('Error');
  });

  it('el botón de cerrar lo marca saliendo y luego lo quita', () => {
    service.info('Hola');
    fixture.detectChanges();
    const close = el().querySelector('.toast-close') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Cerrar');
    close.click();
    fixture.detectChanges();
    expect(el().querySelector('.toast')!.classList.contains('toast-out')).toBe(true);
    vi.advanceTimersByTime(350);
    fixture.detectChanges();
    expect(el().querySelector('.toast')).toBeNull();
  });

  it('desaparece solo pasado su tiempo', () => {
    service.success('Listo');
    fixture.detectChanges();
    expect(el().querySelectorAll('.toast')).toHaveLength(1);
    vi.advanceTimersByTime(4000 + 350);
    fixture.detectChanges();
    expect(el().querySelectorAll('.toast')).toHaveLength(0);
  });
});
