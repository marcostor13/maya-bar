import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LeadAdsSettingsComponent, type LeadAdForm } from './lead-ads-settings';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/lead-ads`;
const FORM: LeadAdForm = {
  _id: 'f1', formId: 'F1', pageId: 'P', name: 'Depas Miraflores', createLead: true, active: true, leadsCount: 3,
  questions: [{ key: 'full_name' }, { key: 'phone_number' }, { key: 'presupuesto', label: 'Presupuesto' }, { key: 'dni', label: 'DNI' }],
  mapping: { dni: 'ignore' },
};

describe('Meta Lead Ads (HU60)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };

  async function setup() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: { confirm: vi.fn() } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(LeadAdsSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}/forms`).flush([FORM]);
    http.expectOne(`${API}/leads?limit=20`).flush([
      { _id: 'l1', leadgenId: 'L1', status: 'failed', error: 'Meta caída', receivedAt: '2026-11-24T15:00:00Z', adName: 'Depa 2 dorm' },
      { _id: 'l2', leadgenId: 'L2', status: 'processed', receivedAt: '2026-11-24T15:00:00Z', existingContact: true, customerId: { _id: 'c', name: 'Ana' } },
    ]);
    http.expectOne(`${API}/report`).flush([{ _id: 'AD9', name: 'Depa 2 dorm', contacts: 4, fromLeadAds: 3, fromWhatsapp: 1, opportunities: 3, won: 1 }]);
    f.detectChanges();
    return f;
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('muestra formularios, leads con su estado y el reporte por anuncio', async () => {
    const el = (await setup()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Depas Miraflores');
    expect(el.textContent).toContain('Fallido');
    expect(el.textContent).toContain('Meta caída');
    expect(el.textContent).toContain('ya existía');
    expect(el.textContent).toContain('Resultados por anuncio');
    expect(el.textContent).toContain('Reintentar');
  });

  it('el mapeo parte de los valores por defecto y guarda campos personalizados', async () => {
    const c = (await setup()).componentInstance;
    c.openMapping(FORM);
    const m = c.mapping()!;
    expect(m.targets).toEqual({ full_name: 'name', phone_number: 'phone', presupuesto: 'custom', dni: 'ignore' });
    expect(m.custom['presupuesto']).toBe('presupuesto');
    expect(c.isDirty()).toBe(false);
    m.custom['presupuesto'] = 'Monto Máximo';
    expect(c.isDirty()).toBe(true);
    c.saveMapping();
    const req = http.expectOne(`${API}/forms/f1`);
    expect(req.request.body).toEqual({ mapping: { full_name: 'name', phone_number: 'phone', presupuesto: 'custom:monto_maximo', dni: 'ignore' } });
    req.flush({ ...FORM, mapping: req.request.body.mapping });
    expect(toast.success).toHaveBeenCalledWith('Campos guardados');
    expect(c.mapping()).toBeNull();
  });

  it('sincroniza formularios y reintenta un lead fallido', async () => {
    const c = (await setup()).componentInstance;
    c.sync();
    http.expectOne(`${API}/forms/sync`).flush({ synced: 2, errors: [], forms: [FORM] });
    expect(toast.success).toHaveBeenCalledWith('2 formularios al día');
    c.retry(c.leads()[0]);
    http.expectOne(`${API}/leads/l1/retry`).flush({ _id: 'l1', status: 'processed' });
    expect(toast.success).toHaveBeenCalledWith('Lead importado');
    http.expectOne(`${API}/forms`).flush([FORM]);
    http.expectOne(`${API}/leads?limit=20`).flush([]);
    http.expectOne(`${API}/report`).flush([]);
  });
});
