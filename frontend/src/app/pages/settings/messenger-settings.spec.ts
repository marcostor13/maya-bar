import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { MessengerSettingsComponent } from './messenger-settings';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { MsAccount } from '../../shared/models/accounts.model';

const accounts: MsAccount[] = [
  { _id: 'ms-1', label: 'Mi Bar', username: 'mi_bar', pageId: '1020', pageName: 'Mi Bar', active: true },
];

const mockApi = {
  getMsAccounts: vi.fn(),
  deleteMsAccount: vi.fn(),
  getMsStatus: vi.fn(),
  subscribeMsWebhook: vi.fn(),
  msWebhookUrl: vi.fn(() => 'http://api/messenger/webhook'),
  getMsWebhookConfig: vi.fn(),
};
const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };

describe('MessengerSettingsComponent', () => {
  let fixture: ComponentFixture<MessengerSettingsComponent>;
  let component: MessengerSettingsComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApi.getMsAccounts.mockReturnValue(of(accounts));
    mockApi.deleteMsAccount.mockReturnValue(of(null));
    mockApi.getMsStatus.mockReturnValue(of({ connected: true, name: 'Mi Bar' }));
    mockApi.subscribeMsWebhook.mockReturnValue(of({ success: true, message: 'Webhook suscrito' }));
    mockApi.getMsWebhookConfig.mockReturnValue(of({ url: 'https://api.test/messenger/webhook', verifyToken: 'mstok' }));

    await TestBed.configureTestingModule({
      imports: [MessengerSettingsComponent],
      providers: [
        { provide: AccountsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MessengerSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit
  });

  it('carga las cuentas al iniciar y las renderiza', () => {
    expect(mockApi.getMsAccounts).toHaveBeenCalled();
    expect(component.msAccounts()).toHaveLength(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mi Bar');
    expect(text).toContain('Page ID: 1020');
  });

  it('muestra la URL y el verify token del webhook que resuelve el backend', () => {
    expect(component.msWebhookUrl()).toBe('https://api.test/messenger/webhook');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('mstok');
  });

  it('checkMsStatus guarda el estado en msStatusMap', () => {
    component.checkMsStatus(accounts[0]);
    expect(mockApi.getMsStatus).toHaveBeenCalledWith('ms-1');
    expect(component.msStatusMap()['ms-1']).toEqual({ connected: true, name: 'Mi Bar' });
  });

  it('deleteMsAccount pide confirmación, borra y recarga', async () => {
    mockApi.getMsAccounts.mockClear();
    await component.deleteMsAccount(accounts[0]);
    expect(mockConfirm.confirm).toHaveBeenCalled();
    expect(mockApi.deleteMsAccount).toHaveBeenCalledWith('ms-1');
    expect(mockToast.success).toHaveBeenCalled();
    expect(mockApi.getMsAccounts).toHaveBeenCalled();
  });

  it('subscribeMsWebhook muestra toast de éxito con el mensaje del backend', () => {
    component.subscribeMsWebhook(accounts[0]);
    expect(mockApi.subscribeMsWebhook).toHaveBeenCalledWith('ms-1');
    expect(mockToast.success).toHaveBeenCalledWith('Webhook suscrito');
  });
});
