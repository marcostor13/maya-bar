import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InboxTrashComponent, type TrashedConv } from './inbox-trash';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const API = 'http://localhost:3000';
const ANA: TrashedConv = {
  _id: 'c1', channel: 'whatsapp', contact: '51999888777', contactName: 'Ana',
  trashedAt: '2026-11-01T10:00:00Z', trashedByName: 'Luis', purgeAt: '2026-12-01T10:00:00Z',
};
const MAIL: TrashedConv = { _id: 'c2', channel: 'email', contact: 'x@correo.com' };

describe('InboxTrashComponent', () => {
  let fixture: ComponentFixture<InboxTrashComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirmState = signal<unknown>(null);
  const confirm = { confirm: vi.fn(), state: confirmState };

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(b =>
      (b.textContent ?? '').includes(label) || b.getAttribute('aria-label')?.includes(label),
    )!;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };

  async function mount(items: TrashedConv[] = [ANA, MAIL]) {
    await TestBed.configureTestingModule({
      imports: [InboxTrashComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InboxTrashComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${API}/conversations/trash`).flush(items);
    await settle();
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => http.verify());

  it('lista lo eliminado, quién lo eliminó y cuándo se borrará', async () => {
    await mount();
    expect(text()).toContain('Ana');
    expect(text()).toContain('Eliminada por Luis');
    expect(text()).toContain('Se borrará el');
    expect(text()).toContain('x@correo.com');
  });

  it('Escape cierra la papelera, salvo si hay una confirmación abierta', async () => {
    await mount();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    confirmState.set({ title: 'x' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).not.toHaveBeenCalled();
    confirmState.set(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('vacía: muestra el estado vacío', async () => {
    await mount([]);
    expect(text()).toContain('La papelera está vacía');
    expect(button('Vaciar')).toBeUndefined();
  });

  it('si falla la carga ofrece reintentar', async () => {
    await TestBed.configureTestingModule({
      imports: [InboxTrashComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InboxTrashComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${API}/conversations/trash`).flush({}, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No se pudo cargar la papelera');
  });

  it('restaurar devuelve el chat y lo quita de la lista', async () => {
    await mount();
    const restored = vi.fn();
    fixture.componentInstance.restored.subscribe(restored);
    button('Restaurar').click();
    const req = http.expectOne(`${API}/conversations/trash/c1/restore`);
    expect(req.request.method).toBe('POST');
    req.flush({ conversation: { _id: 'c1' }, merged: false });
    await settle();
    expect(restored).toHaveBeenCalledWith({ _id: 'c1' });
    expect(toast.success).toHaveBeenCalledWith('Conversación restaurada');
    expect(text()).not.toContain('Eliminada por Luis');
  });

  it('borrar definitivamente pide confirmación y no hace nada si se cancela', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(false);
    button('Borrar definitivamente Ana').click();
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    http.expectNone(`${API}/conversations/trash/c1`);
  });

  it('borrar definitivamente tras confirmar', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(true);
    button('Borrar definitivamente Ana').click();
    await settle();
    const req = http.expectOne(`${API}/conversations/trash/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ deleted: true });
    await settle();
    expect(toast.success).toHaveBeenCalledWith('Conversación borrada definitivamente');
  });

  it('vaciar la papelera tras confirmar', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(true);
    button('Vaciar').click();
    await settle();
    const req = http.expectOne(r => r.method === 'DELETE' && r.url === `${API}/conversations/trash`);
    req.flush({ deleted: 2 });
    await settle();
    expect(text()).toContain('La papelera está vacía');
    expect(toast.success).toHaveBeenCalledWith('Papelera vaciada (2)');
  });

  it('un error al restaurar se muestra con el mensaje del servidor', async () => {
    await mount();
    button('Restaurar').click();
    http
      .expectOne(`${API}/conversations/trash/c1/restore`)
      .flush({ message: 'Tu rol no puede eliminar conversaciones.' }, { status: 403, statusText: 'x' });
    await settle();
    expect(toast.error).toHaveBeenCalledWith('Tu rol no puede eliminar conversaciones.');
  });
});
