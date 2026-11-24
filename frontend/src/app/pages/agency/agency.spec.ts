import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AgencyComponent, type AgencyOverview } from './agency';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const client = (i: number) => ({
  _id: `c${i}`, name: `Cliente ${i}`, email: `c${i}@x.pe`, plan: 'crece', isActive: true, createdAt: '2026-11-01',
  usage: { users: 1, contacts: i * 10, conversations30d: i },
});
const OV: AgencyOverview = {
  agency: { _id: 'ag', name: 'Andes Digital', seats: 5, used: 5 },
  whiteLabel: { appName: 'Andes CRM' },
  actingTenantId: null,
  clients: [1, 2, 3, 4, 5].map(client),
};

describe('Panel de la agencia (HU72)', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  const auth = { switchTenant: vi.fn(() => of({})) };
  let http: HttpTestingController;

  async function setup(ov: AgencyOverview = OV) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AgencyComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }, { provide: AuthService, useValue: auth }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AgencyComponent);
    f.detectChanges();
    http.expectOne(`${API}/agency`).flush(ov);
    f.detectChanges();
    return f;
  }
  afterEach(() => http.verify());

  it('C1: lista las 5 sub-cuentas con su uso y entra a una', async () => {
    const f = await setup();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('5 de 5 sub-cuentas usadas');
    expect(el.querySelectorAll('tbody tr').length).toBe(5);
    expect((el.querySelector('.page-head .btn-primary') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelector('[aria-label="Entrar a Cliente 3"]') as HTMLButtonElement).click();
    expect(auth.switchTenant).toHaveBeenCalledWith('c3');
  });

  it('dentro de un cliente ofrece volver a la agencia', async () => {
    const f = await setup({ ...OV, actingTenantId: 'c2' });
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Estás trabajando dentro de Cliente 2');
    expect(el.textContent).toContain('Estás aquí');
    f.componentInstance.enter('ag');
    expect(auth.switchTenant).toHaveBeenCalledWith('ag');
  });

  it('guarda la marca blanca y avisa del error del servidor', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.wl.panelDomain = 'crm.andes.pe';
    c.saveBrand();
    const req = http.expectOne(`${API}/agency/white-label`);
    expect(req.request.body).toMatchObject({ appName: 'Andes CRM', panelDomain: 'crm.andes.pe' });
    req.flush({ message: 'Ese dominio ya lo usa otra agencia' }, { status: 409, statusText: 'Conflict' });
    expect(toast.error).toHaveBeenCalledWith('Ese dominio ya lo usa otra agencia');
  });
});
