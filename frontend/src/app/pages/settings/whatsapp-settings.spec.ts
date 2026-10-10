import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { WhatsappSettingsComponent } from './whatsapp-settings';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { WaAccount } from '../../shared/models/accounts.model';

const accounts: WaAccount[] = [
  { _id: 'wa-1', label: 'Línea Reservas', provider: 'cloudapi', phoneNumber: '+51 999', active: true, isDefault: true },
  { _id: 'wa-2', label: 'Línea WAHA', provider: 'waha', active: true },
];

const mockApi = {
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getWaAccounts: vi.fn(),
  setDefaultWaAccount: vi.fn(),
  getWaStatus: vi.fn(),
  waWebhookUrl: vi.fn((a: Pick<WaAccount, '_id' | 'provider'>) => `http://api/wa/webhook/${a.provider === 'waha' ? 'waha' : 'cloud'}/${a._id}`),
  getWaWebhookConfig: vi.fn(),
  getWaQrConfig: vi.fn(),
  connectWaQr: vi.fn(),
  getWaQr: vi.fn(),
};
const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };

describe('WhatsappSettingsComponent', () => {
  let fixture: ComponentFixture<WhatsappSettingsComponent>;
  let component: WhatsappSettingsComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApi.getSettings.mockReturnValue(of({ waDailyLimit: 80 }));
    mockApi.getWaAccounts.mockReturnValue(of(accounts));
    mockApi.setDefaultWaAccount.mockReturnValue(of({}));
    mockApi.getWaStatus.mockReturnValue(of({ connected: true }));
    mockApi.getWaWebhookConfig.mockReturnValue(of({ url: 'https://api.test/wa/webhook/cloud', verifyToken: 'vtok' }));
    mockApi.getWaQrConfig.mockReturnValue(of({ available: true }));
    mockApi.getWaQr.mockReturnValue(of({ qrcode: 'AAA' }));

    await TestBed.configureTestingModule({
      imports: [WhatsappSettingsComponent],
      providers: [
        { provide: AccountsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WhatsappSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit
  });

  it('carga las cuentas al iniciar y las renderiza', () => {
    expect(mockApi.getWaAccounts).toHaveBeenCalled();
    expect(component.accounts()).toHaveLength(2);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Línea Reservas');
    expect(text).toContain('Línea WAHA');
    expect(text).toContain('Predeterminada');
  });

  it('carga el límite diario desde /settings', () => {
    expect(mockApi.getSettings).toHaveBeenCalled();
    expect(component.dailyLimit).toBe(80);
  });

  it('expone el provider de la cuenta predeterminada y lo emite tras cargar', () => {
    expect(component.defaultProvider()).toBe('cloudapi');
  });

  it('setDefault llama al service, muestra toast y recarga cuentas', () => {
    mockApi.getWaAccounts.mockClear();
    component.setDefault(accounts[1]);
    expect(mockApi.setDefaultWaAccount).toHaveBeenCalledWith('wa-2');
    expect(mockToast.success).toHaveBeenCalled();
    expect(mockApi.getWaAccounts).toHaveBeenCalled();
  });

  describe('conexión por QR', () => {
    const created: WaAccount = { _id: 'wa-qr', label: 'WhatsApp (QR)', provider: 'waha', managed: true, active: true };
    const el = () => fixture.nativeElement as HTMLElement;
    const qrButton = () => [...el().querySelectorAll('button')].find(b => b.textContent?.includes('Conectar con QR'));

    afterEach(() => component.ngOnDestroy());

    it('muestra el botón solo si el servidor tiene WAHA', () => {
      expect(qrButton()).toBeTruthy();
      component.qrAvailable.set(false);
      fixture.detectChanges();
      expect(qrButton()).toBeUndefined();
    });

    it('crea la cuenta, la añade a la lista y abre su QR', () => {
      mockApi.connectWaQr.mockReturnValue(of(created));
      qrButton()!.click();
      fixture.detectChanges();

      expect(mockApi.connectWaQr).toHaveBeenCalled();
      expect(component.accounts()[0]).toEqual(created);
      expect(component.qrActiveId()).toBe('wa-qr');
      expect(mockApi.getWaQr).toHaveBeenCalledWith('wa-qr');
      expect(mockToast.success).toHaveBeenCalled();
      expect(el().querySelector('img.qr-image')!.getAttribute('src')).toBe('data:image/png;base64,AAA');
      expect(el().textContent).toContain('Conectada por QR');
    });

    it('si el servidor rechaza la conexión muestra su mensaje', () => {
      mockApi.connectWaQr.mockReturnValue(throwError(() => ({ error: { message: 'Ya tienes 5 cuentas conectadas por QR' } })));
      component.connectWithQr();
      expect(mockToast.error).toHaveBeenCalledWith('Ya tienes 5 cuentas conectadas por QR');
      expect(component.connectingQr()).toBe(false);
      expect(component.qrActiveId()).toBe('');
    });

    it('cuando el QR ya fue escaneado cierra el panel y recarga las cuentas', () => {
      mockApi.connectWaQr.mockReturnValue(of(created));
      component.connectWithQr();
      mockApi.getWaAccounts.mockClear();

      component.checkStatus(created);

      expect(component.qrActiveId()).toBe('');
      expect(mockToast.success).toHaveBeenCalledWith('WhatsApp conectado');
      expect(mockApi.getWaAccounts).toHaveBeenCalled();
    });

    it('al editar una cuenta por QR no ofrece los datos de WAHA', () => {
      component.editAccount(created);
      fixture.detectChanges();
      expect(el().textContent).toContain('la gestiona la plataforma');
      expect(el().textContent).not.toContain('URL de WAHA');
      expect(el().querySelector('select')).toBeNull();
    });
  });

  it('checkStatus guarda el estado en statusMap', () => {
    component.checkStatus(accounts[0]);
    expect(mockApi.getWaStatus).toHaveBeenCalledWith('wa-1');
    expect(component.statusMap()['wa-1']).toEqual({ connected: true });
  });
});
