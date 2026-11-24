import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrandService } from './brand.service';
import { isCustomDomain, isPanelDomain, setHostForTests } from '../shared/custom-domain';
import { environment } from '../../environments/environment';

describe('Marca blanca del panel (HU72)', () => {
  let http: HttpTestingController;
  let svc: BrandService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(BrandService);
  });
  afterEach(() => {
    http.verify();
    setHostForTests(null);
    document.documentElement.style.removeProperty('--color-brand');
  });

  it('C2: en el dominio de la agencia usa su nombre, logo y color, y la raíz es el panel', async () => {
    setHostForTests('crm.andes.pe');
    const p = svc.initFromHost();
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/public/white-label` && r.params.get('host') === 'crm.andes.pe')
      .flush({ appName: 'Andes CRM', logo: 'https://cdn.andes.pe/logo.png', primaryColor: '#0EA5E9' });
    await p;
    expect(svc.custom()).toBe(true);
    expect(svc.logo()).toBe('https://cdn.andes.pe/logo.png');
    expect(document.title).toBe('Andes CRM');
    expect(document.documentElement.style.getPropertyValue('--color-brand')).toBe('#0EA5E9');
    expect(isPanelDomain()).toBe(true);
    expect(isCustomDomain()).toBe(false);
  });

  it('en el dominio de una landing de evento sigue siendo landing', async () => {
    setHostForTests('evento.cliente.pe');
    const p = svc.initFromHost();
    http.expectOne((r) => r.url.endsWith('/public/white-label')).flush({}, { status: 404, statusText: 'Not Found' });
    await p;
    expect(svc.custom()).toBe(false);
    expect(isCustomDomain()).toBe(true);
  });

  it('en el dominio de Maya no consulta nada y usa el logo de Maya', async () => {
    setHostForTests('mayacrm.site');
    await svc.initFromHost();
    expect(svc.logo()).toBe('/logo.png?v=2');
  });
});
