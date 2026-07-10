import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { InstagramSettingsComponent } from './instagram-settings';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { IgAccount } from '../../shared/models/accounts.model';

const accounts: IgAccount[] = [
  { _id: 'ig-1', label: 'IG Principal', username: 'mi_bar', igBusinessAccountId: '1789', active: true },
];

const mockApi = {
  getIgAccounts: vi.fn(),
  deleteIgAccount: vi.fn(),
  getIgStatus: vi.fn(),
  subscribeIgWebhook: vi.fn(),
  igWebhookUrl: vi.fn(() => 'http://api/ig/webhook'),
};
const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };

describe('InstagramSettingsComponent', () => {
  let fixture: ComponentFixture<InstagramSettingsComponent>;
  let component: InstagramSettingsComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockApi.getIgAccounts.mockReturnValue(of(accounts));
    mockApi.deleteIgAccount.mockReturnValue(of(null));
    mockApi.getIgStatus.mockReturnValue(of({ connected: true, username: 'mi_bar' }));
    mockApi.subscribeIgWebhook.mockReturnValue(of({ success: true, message: 'Webhook suscrito' }));

    await TestBed.configureTestingModule({
      imports: [InstagramSettingsComponent],
      providers: [
        { provide: AccountsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InstagramSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit
  });

  it('carga las cuentas al iniciar y las renderiza', () => {
    expect(mockApi.getIgAccounts).toHaveBeenCalled();
    expect(component.igAccounts()).toHaveLength(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('IG Principal');
    expect(text).toContain('@mi_bar');
  });

  it('checkIgStatus guarda el estado en igStatusMap', () => {
    component.checkIgStatus(accounts[0]);
    expect(mockApi.getIgStatus).toHaveBeenCalledWith('ig-1');
    expect(component.igStatusMap()['ig-1']).toEqual({ connected: true, username: 'mi_bar' });
  });

  it('deleteIgAccount pide confirmación, borra y recarga', async () => {
    mockApi.getIgAccounts.mockClear();
    await component.deleteIgAccount(accounts[0]);
    expect(mockConfirm.confirm).toHaveBeenCalled();
    expect(mockApi.deleteIgAccount).toHaveBeenCalledWith('ig-1');
    expect(mockToast.success).toHaveBeenCalled();
    expect(mockApi.getIgAccounts).toHaveBeenCalled();
  });

  it('subscribeIgWebhook muestra toast de éxito con el mensaje del backend', () => {
    component.subscribeIgWebhook(accounts[0]);
    expect(mockApi.subscribeIgWebhook).toHaveBeenCalledWith('ig-1');
    expect(mockToast.success).toHaveBeenCalledWith('Webhook suscrito');
  });
});
