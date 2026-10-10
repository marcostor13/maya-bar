import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmService } from './confirm';

describe('ConfirmService', () => {
  let service: ConfirmService;
  beforeEach(() => { service = TestBed.inject(ConfirmService); });

  it('abre el diálogo con los textos por defecto', () => {
    void service.confirm({ title: 'Eliminar', message: '¿Seguro?' });
    const s = service.state()!;
    expect(s.title).toBe('Eliminar');
    expect(s.message).toBe('¿Seguro?');
    expect(s.confirmText).toBe('Confirmar');
    expect(s.cancelText).toBe('Cancelar');
    expect(s.danger).toBe(false);
  });

  it('respond(true) resuelve true y cierra', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    service.respond(true);
    expect(await p).toBe(true);
    expect(service.state()).toBeNull();
  });

  it('respond(false) resuelve false y cierra', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    service.respond(false);
    expect(await p).toBe(false);
    expect(service.state()).toBeNull();
  });

  it('respond sin diálogo abierto no hace nada', () => {
    expect(() => service.respond(true)).not.toThrow();
    expect(service.state()).toBeNull();
  });
});

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let service: ConfirmService;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.confirm-actions button'));

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    service = TestBed.inject(ConfirmService);
    fixture.detectChanges();
  });

  it('cerrado no pinta nada', () => {
    expect(el().querySelector('.confirm-backdrop')).toBeNull();
  });

  it('pinta título, mensaje y los textos de los botones', () => {
    void service.confirm({ title: 'Eliminar lista', message: 'No se puede deshacer', confirmText: 'Eliminar', cancelText: 'Volver' });
    fixture.detectChanges();
    expect(el().querySelector('.confirm-title')!.textContent).toContain('Eliminar lista');
    expect(el().querySelector('.confirm-message')!.textContent).toContain('No se puede deshacer');
    const [cancel, ok] = buttons();
    expect(cancel.textContent).toContain('Volver');
    expect(ok.textContent).toContain('Eliminar');
  });

  it('en modo peligro el botón de confirmar es btn-danger; si no, btn-primary', () => {
    void service.confirm({ title: 't', message: 'm', danger: true });
    fixture.detectChanges();
    expect(buttons()[1].classList.contains('btn-danger')).toBe(true);
    expect(buttons()[1].classList.contains('btn-primary')).toBe(false);
    expect(el().querySelector('.confirm-icon-wrap')!.classList.contains('danger')).toBe(true);
    service.respond(false);

    void service.confirm({ title: 't', message: 'm' });
    fixture.detectChanges();
    expect(buttons()[1].classList.contains('btn-primary')).toBe(true);
    expect(buttons()[1].classList.contains('btn-danger')).toBe(false);
  });

  it('confirmar resuelve true y cierra el diálogo', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    fixture.detectChanges();
    buttons()[1].click();
    expect(await p).toBe(true);
    fixture.detectChanges();
    expect(el().querySelector('.confirm-backdrop')).toBeNull();
  });

  it('cancelar resuelve false', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    fixture.detectChanges();
    buttons()[0].click();
    expect(await p).toBe(false);
  });

  it('pulsar el fondo cancela, pero pulsar la tarjeta no', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    fixture.detectChanges();
    (el().querySelector('.confirm-card') as HTMLElement).click();
    expect(service.state()).not.toBeNull();
    (el().querySelector('.confirm-backdrop') as HTMLElement).click();
    expect(await p).toBe(false);
  });

  it('Escape cancela', async () => {
    const p = service.confirm({ title: 't', message: 'm' });
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await p).toBe(false);
    expect(service.state()).toBeNull();
  });
});
