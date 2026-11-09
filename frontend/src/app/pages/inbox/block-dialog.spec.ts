import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BlockDialogComponent, type BlockDialogResult } from './block-dialog';

describe('BlockDialogComponent', () => {
  let fixture: ComponentFixture<BlockDialogComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent ?? '').trim() === label)!;

  async function mount(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [BlockDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(BlockDialogComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('bloquear: explica las consecuencias y devuelve motivo y canales', async () => {
    await mount({ name: 'Ana', canAllChannels: true });
    expect(text()).toContain('Bloquear contacto');
    expect(text()).toContain('Ana no podrá volver a escribirte');
    expect(text()).not.toContain('papelera');

    const result = vi.fn();
    fixture.componentInstance.confirmed.subscribe((r: BlockDialogResult) => result(r));
    const reason = el().querySelector<HTMLInputElement>('input.input')!;
    reason.value = '  Spam ';
    reason.dispatchEvent(new Event('input'));
    const all = el().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    all.click();
    fixture.detectChanges();
    await fixture.whenStable();

    button('Bloquear').click();
    expect(result).toHaveBeenCalledWith({ reason: 'Spam', allChannels: true });
  });

  it('sin cliente vinculado no ofrece bloquear todos los canales', async () => {
    await mount({ canAllChannels: false });
    expect(el().querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('eliminar y bloquear: avisa de la papelera y cuenta los chats', async () => {
    await mount({ mode: 'delete', count: 3 });
    expect(text()).toContain('Eliminar y bloquear');
    expect(text()).toContain('Estos 3 contactos');
    expect(text()).toContain('Las conversaciones irán a la papelera');
    expect(button('Eliminar y bloquear')).toBeTruthy();
  });

  it('Cancelar y Escape cierran sin confirmar', async () => {
    await mount();
    const cancelled = vi.fn();
    const confirmed = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentInstance.confirmed.subscribe(confirmed);
    button('Cancelar').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toHaveBeenCalledTimes(2);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('es un diálogo accesible con título', async () => {
    await mount();
    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('#' + dialog.getAttribute('aria-labelledby'))?.textContent).toContain('Bloquear contacto');
  });
});
