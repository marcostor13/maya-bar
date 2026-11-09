import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InboxBlockedComponent, type BlockedEntry } from './inbox-blocked';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const API = 'http://localhost:3000';
const SPAM: BlockedEntry = {
  _id: 'b1', channel: 'whatsapp', identifier: '51999888777', name: 'Spammer',
  reason: 'Spam', blockedByName: 'Luis', onChannel: true, createdAt: '2026-11-01T10:00:00Z',
};

describe('InboxBlockedComponent', () => {
  let fixture: ComponentFixture<InboxBlockedComponent>;
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
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const listReq = () =>
    http.expectOne(r => r.method === 'GET' && r.url === `${API}/conversations/blocked`);

  async function mount(items: BlockedEntry[] = [SPAM]) {
    await TestBed.configureTestingModule({
      imports: [InboxBlockedComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InboxBlockedComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    listReq().flush(items);
    await settle();
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => http.verify());

  it('lista los bloqueos con canal, motivo, quién y si también está en WhatsApp', async () => {
    await mount();
    expect(text()).toContain('+51999888777');
    expect(text()).toContain('Spammer');
    expect(text()).toContain('También en WhatsApp');
    expect(text()).toContain('Spam');
    expect(text()).toContain('por Luis');
  });

  it('sin bloqueos muestra el estado vacío', async () => {
    await mount([]);
    expect(text()).toContain('No hay contactos bloqueados');
  });

  it('envía el alta manual y la añade a la lista', async () => {
    await mount([]);
    const comp = fixture.componentInstance;
    comp.newContact = '999 888 777';
    comp.newReason = 'Acoso';
    const done = comp.add();
    const req = http.expectOne(r => r.method === 'POST' && r.url === `${API}/conversations/blocked`);
    expect(req.request.body).toEqual({ channel: 'whatsapp', contact: '999 888 777', reason: 'Acoso' });
    req.flush({ ...SPAM, _id: 'b2', reason: 'Acoso' });
    await done;
    await settle();
    expect(toast.success).toHaveBeenCalledWith('Contacto bloqueado');
    expect(text()).toContain('Acoso');
    expect(comp.newContact).toBe('');
  });

  it('un número inválido muestra el error del servidor', async () => {
    await mount([]);
    const comp = fixture.componentInstance;
    comp.newContact = '12';
    const done = comp.add();
    http
      .expectOne(`${API}/conversations/blocked`)
      .flush({ message: 'El número no es válido' }, { status: 400, statusText: 'x' });
    await done;
    expect(toast.error).toHaveBeenCalledWith('El número no es válido');
  });

  it('desbloquear pide confirmación y lo quita de la lista', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(true);
    button('Desbloquear +51999888777').click();
    await settle();
    const req = http.expectOne(`${API}/conversations/blocked/b1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ removed: true });
    await settle();
    expect(toast.success).toHaveBeenCalledWith('Contacto desbloqueado');
    expect(text()).toContain('No hay contactos bloqueados');
  });

  it('si WhatsApp no deja desbloquear, avisa del motivo', async () => {
    await mount();
    confirm.confirm.mockResolvedValue(true);
    button('Desbloquear +51999888777').click();
    await settle();
    http.expectOne(`${API}/conversations/blocked/b1`).flush({ removed: true, channelError: 'Cloud API 400' });
    await settle();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Cloud API 400'));
  });

  it('buscar vuelve a pedir la lista con el término', async () => {
    vi.useFakeTimers();
    try {
      await mount();
      fixture.componentInstance.onSearch('spam');
      vi.advanceTimersByTime(300);
      const req = http.expectOne(r => r.url === `${API}/conversations/blocked`);
      expect(req.request.params.get('q')).toBe('spam');
      req.flush([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
