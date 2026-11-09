import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { CallDialogComponent, toContact } from './call-dialog';
import { CallOverlayComponent } from './call-overlay';
import { CallsService } from './calls.service';
import { ToastService } from '../toast';
import type { CallView, CurrentCall } from './calls.models';

const ACCOUNTS = [
  { _id: 'a1', label: 'Ventas', isDefault: true },
  { _id: 'a2', label: 'Soporte' },
];
const CALL: CallView = {
  _id: 'c1', accountId: 'a1', accountLabel: 'Ventas', direction: 'inbound', status: 'ringing',
  contact: '51999888777', contactName: 'Ana', startedAt: '2026-11-09T10:00:00Z',
};

const settle = async (f: ComponentFixture<unknown>) => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  f.detectChanges();
};

describe('toContact', () => {
  it('deja dígitos del teléfono y respeta el BSUID', () => {
    expect(toContact('+51 999 888-777')).toBe('51999888777');
    expect(toContact('PE.AbC123456')).toBe('PE.AbC123456');
  });
});

describe('CallDialogComponent', () => {
  let fixture: ComponentFixture<CallDialogComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const calls = { loadOptions: vi.fn(), call: vi.fn(), busy: signal(false) };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(label));
  const permission = () => http.expectOne((r) => r.url.endsWith('/calls/permission'));

  async function mount(target = { contact: '+51 999 888 777', contactName: 'Ana' }) {
    vi.clearAllMocks();
    calls.loadOptions.mockResolvedValue({ accounts: ACCOUNTS, users: [], iceServers: [] });
    TestBed.configureTestingModule({
      imports: [CallDialogComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: CallsService, useValue: calls },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CallDialogComponent);
    fixture.componentRef.setInput('target', target);
    fixture.detectChanges();
    await settle(fixture);
  }
  afterEach(() => http.verify());

  it('sin permiso: lo explica, deja pedirlo y no deja llamar', async () => {
    await mount();
    const req = permission();
    expect(req.request.params.get('accountId')).toBe('a1');
    expect(req.request.params.get('contact')).toBe('51999888777');
    req.flush({ status: 'none', canRequest: true, canCall: false });
    await settle(fixture);
    expect(el().textContent).toContain('todavía no te dio permiso');
    expect(button('Llamar')!.disabled).toBe(true);

    button('Pedir permiso')!.click();
    const ask = http.expectOne((r) => r.url.endsWith('/calls/permission/request'));
    expect(ask.request.body).toEqual({ accountId: 'a1', contact: '51999888777' });
    ask.flush({ status: 'pending', canRequest: false, canCall: false });
    await settle(fixture);
    expect(toast.success).toHaveBeenCalledWith('Solicitud de permiso enviada por WhatsApp');
    expect(el().textContent).toContain('esperando la respuesta');
    expect(el().textContent).toContain('1 vez al día y 2 por semana');
  });

  it('con permiso llama y se cierra', async () => {
    await mount();
    permission().flush({ status: 'granted', expiresAt: '2026-11-15T10:00:00Z', canRequest: false, canCall: true });
    await settle(fixture);
    calls.call.mockResolvedValue(true);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    button('Llamar')!.click();
    await settle(fixture);
    expect(calls.call).toHaveBeenCalledWith('a1', '51999888777');
    expect(closed).toHaveBeenCalled();
  });

  it('cambiar de cuenta vuelve a consultar el permiso', async () => {
    await mount();
    permission().flush({ status: 'rejected', canRequest: false, canCall: false });
    await settle(fixture);
    expect(el().textContent).toContain('rechazó');
    const done = fixture.componentInstance.pickAccount('a2');
    const req = permission();
    expect(req.request.params.get('accountId')).toBe('a2');
    req.flush({ status: 'permanent', canRequest: false, canCall: true });
    await done;
    fixture.detectChanges();
    expect(el().textContent).toContain('permiso permanente');
    expect(button('Llamar')!.disabled).toBe(false);
  });

  it('si Meta falla al consultar, muestra el motivo', async () => {
    await mount();
    permission().flush({ message: 'WhatsApp: no habilitado (código 138000)' }, { status: 400, statusText: 'Bad' });
    await settle(fixture);
    expect(el().textContent).toContain('código 138000');
    expect(toast.error).toHaveBeenCalledWith('WhatsApp: no habilitado (código 138000)');
  });
});

describe('CallOverlayComponent', () => {
  let fixture: ComponentFixture<CallOverlayComponent>;
  const calls = {
    start: vi.fn(), accept: vi.fn(), reject: vi.fn(), hangup: vi.fn(), toggleMute: vi.fn(), dismissMicError: vi.fn(),
    incoming: signal<CallView[]>([]), current: signal<CurrentCall | null>(null), micError: signal<string | null>(null),
    busy: signal(false), dialog: signal(null), elapsed: signal('00:07'),
  };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    calls.incoming.set([]);
    calls.current.set(null);
    calls.micError.set(null);
    TestBed.configureTestingModule({
      imports: [CallOverlayComponent],
      providers: [{ provide: CallsService, useValue: calls }],
    });
    fixture = TestBed.createComponent(CallOverlayComponent);
    fixture.detectChanges();
  });

  it('una entrante se anuncia como alerta con aceptar y rechazar', () => {
    calls.incoming.set([CALL, { ...CALL, _id: 'c2' }]);
    fixture.detectChanges();
    const alert = el().querySelector('[role="alertdialog"]')!;
    expect(alert.textContent).toContain('Ana');
    expect(alert.textContent).toContain('1 más en espera');
    (alert.querySelector('.accept') as HTMLButtonElement).click();
    expect(calls.accept).toHaveBeenCalledWith(CALL);
    (Array.from(alert.querySelectorAll('button')).find((b) => b.textContent!.includes('Rechazar')) as HTMLButtonElement).click();
    expect(calls.reject).toHaveBeenCalledWith(CALL);
  });

  it('Escape no rechaza la llamada', () => {
    calls.incoming.set([CALL]);
    fixture.detectChanges();
    el().querySelector('[role="alertdialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(calls.reject).not.toHaveBeenCalled();
  });

  it('en llamada muestra el cronómetro, silenciar y colgar', () => {
    calls.current.set({ call: { ...CALL, status: 'active' }, phase: 'active', muted: false, since: 1 });
    fixture.detectChanges();
    expect(el().textContent).toContain('00:07');
    const mute = el().querySelector<HTMLButtonElement>('[aria-label="Silenciar micrófono"]')!;
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    mute.click();
    expect(calls.toggleMute).toHaveBeenCalled();
    el().querySelector<HTMLButtonElement>('[aria-label="Colgar"]')!.click();
    expect(calls.hangup).toHaveBeenCalled();
  });

  it('micrófono denegado: explica cómo darlo', () => {
    calls.micError.set('Permite el acceso al micrófono');
    fixture.detectChanges();
    expect(el().textContent).toContain('Micrófono no disponible');
    expect(el().textContent).toContain('Permite el acceso al micrófono');
  });
});
