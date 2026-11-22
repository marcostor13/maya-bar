import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { canvasScaleFor, isDoubleTap } from './designer-touch';
import { InvitationDesignerComponent } from './invitation-designer';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

describe('designer-touch (HU32)', () => {
  it('C2: en el móvil el lienzo ocupa el ancho, igual que en la landing', () => {
    expect(canvasScaleFor(355, 600, false)).toBeCloseTo(355 / 324, 2);
    expect(canvasScaleFor(300, 600, false)).toBeCloseTo(300 / 324, 2);
  });

  it('C2: en escritorio no agranda; en vista previa cabe entero', () => {
    expect(canvasScaleFor(900, 700, false)).toBe(1);
    expect(canvasScaleFor(375, 667, true)).toBeCloseTo(Math.min(375 / 324, 667 / 576), 2);
  });

  it('C1: doble toque solo sobre el mismo elemento en menos de 350 ms', () => {
    expect(isDoubleTap({ id: 'a', t: 1000 }, 'a', 1200)).toBe(true);
    expect(isDoubleTap({ id: 'a', t: 1000 }, 'b', 1200)).toBe(false);
    expect(isDoubleTap({ id: 'a', t: 1000 }, 'a', 1500)).toBe(false);
    expect(isDoubleTap(null, 'a', 1)).toBe(false);
  });
});

// El diseñador es grande: compilarlo con la suite completa en paralelo pasa de 5 s.
describe('InvitationDesignerComponent: táctil (HU32)', { timeout: 30000 }, () => {
  const textEl = { id: 't1', type: 'text' as const, left: 10, top: 10, width: 50, content: 'Hola', imageUrl: '', imageHeight: 0, style: {} };

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [InvitationDesignerComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfirmService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InvitationDesignerComponent);
    fixture.componentRef.setInput('initialDesign', {
      version: '1', background: { type: 'color', url: '', color: '#000', overlay: { color: '#000', opacity: 0 } }, elements: [textEl],
    });
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true);
    return fixture;
  }

  const pointer = (type: string, x: number, y: number, pointerType = 'touch') => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }) as MouseEvent & { pointerId: number; pointerType: string };
    Object.assign(e, { pointerId: 1, pointerType });
    return e;
  };

  it('C1: arrastrar con el dedo mueve el elemento', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const canvas = el.querySelector('.canvas') as HTMLElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 324, height: 576, right: 324, bottom: 576, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    const node = el.querySelector('.canvas-el') as HTMLElement;
    node.dispatchEvent(pointer('pointerdown', 100, 100));
    el.querySelector('.designer')!.dispatchEvent(pointer('pointermove', 132.4, 157.6));
    document.dispatchEvent(pointer('pointerup', 132.4, 157.6));
    const moved = fixture.componentInstance.design().elements[0];
    expect(moved.left).toBeCloseTo(20, 0);
    expect(moved.top).toBeCloseTo(20, 0);
  });

  it('C1: doble toque edita el texto', async () => {
    const fixture = await setup();
    const node = (fixture.nativeElement as HTMLElement).querySelector('.canvas-el') as HTMLElement;
    node.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointerup', 10, 10));
    node.dispatchEvent(pointer('pointerdown', 10, 10));
    expect(fixture.componentInstance.editingId()).toBe('t1');
  });

  it('C3: con un elemento seleccionado no hay fondo que tape el lienzo', async () => {
    const fixture = await setup();
    fixture.componentInstance.selectedId.set('t1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.d-props-sheet')).not.toBeNull();
    expect(el.querySelector('.d-drawer-backdrop')).toBeNull();
  });

  it('vista previa a pantalla completa y se cierra con Esc', async () => {
    const fixture = await setup();
    fixture.componentInstance.openPreview();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.designer.previewing')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.previewing()).toBe(false);
  });
});
