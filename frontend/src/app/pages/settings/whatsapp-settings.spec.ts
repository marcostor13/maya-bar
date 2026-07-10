import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
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

  it('checkStatus guarda el estado en statusMap', () => {
    component.checkStatus(accounts[0]);
    expect(mockApi.getWaStatus).toHaveBeenCalledWith('wa-1');
    expect(component.statusMap()['wa-1']).toEqual({ connected: true });
  });
});
