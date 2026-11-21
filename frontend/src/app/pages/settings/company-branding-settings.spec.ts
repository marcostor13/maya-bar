import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { CompanyBrandingSettingsComponent } from './company-branding-settings';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';

describe('CompanyBrandingSettingsComponent (HU26)', () => {
  let fixture: ComponentFixture<CompanyBrandingSettingsComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
  const user = signal<{ role: string } | null>({ role: 'TENANT_ADMIN' });
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(text));
  const tick = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  async function setup(role: string, branding: object = {}) {
    user.set({ role });
    fixture = TestBed.createComponent(CompanyBrandingSettingsComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/tenants/me')).flush({ name: 'Fiestas', branding });
    fixture.detectChanges();
  }

  async function pick(key: 'logo' | 'favicon', type = 'image/png') {
    const input = el().querySelector(`input[data-key="${key}"]`) as HTMLInputElement;
    const file = new File(['x'], 'a.png', { type });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await tick();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CompanyBrandingSettingsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { currentUser: user } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('C9: sube el logo a /upload?folder=branding, guarda con PATCH y avisa', async () => {
    await setup('TENANT_ADMIN', { favicon: 'https://cdn.x/f.png' });
    expect(button('Guardar marca')!.disabled).toBe(true);

    await pick('logo');
    http.expectOne((r) => r.method === 'POST' && r.urlWithParams.endsWith('/upload?folder=branding'))
      .flush({ url: 'https://cdn.x/logo.png' });
    await tick();
    expect(el().querySelector('img[alt="Logo actual"]')!.getAttribute('src')).toBe('https://cdn.x/logo.png');

    button('Guardar marca')!.click();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/tenants/me/branding'));
    expect(req.request.body).toEqual({ logo: 'https://cdn.x/logo.png', favicon: 'https://cdn.x/f.png' });
    req.flush({ logo: 'https://cdn.x/logo.png', favicon: 'https://cdn.x/f.png' });
    await tick();
    expect(toast.success).toHaveBeenCalledWith('Marca guardada');
    expect(button('Guardar marca')!.disabled).toBe(true);
  });

  it('C9: quitar el favicon envía null', async () => {
    await setup('TENANT_ADMIN', { logo: 'https://cdn.x/l.png', favicon: 'https://cdn.x/f.png' });
    (el().querySelector('[aria-label="Quitar favicon"]') as HTMLButtonElement).click();
    await tick();
    button('Guardar marca')!.click();
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ logo: 'https://cdn.x/l.png', favicon: null });
    req.flush({ logo: 'https://cdn.x/l.png' });
  });

  it('C9: un error al guardar o un archivo no válido se avisan con toast', async () => {
    await setup('TENANT_ADMIN');
    await pick('logo', 'image/svg+xml');
    expect(toast.error).toHaveBeenCalledWith('Usa una imagen PNG, JPG, WEBP o GIF');
    http.expectNone((r) => r.url.includes('/upload'));

    await pick('favicon');
    http.expectOne((r) => r.url.includes('/upload')).flush({ url: 'https://cdn.x/f.png' });
    await tick();
    button('Guardar marca')!.click();
    http.expectOne((r) => r.method === 'PATCH').flush(
      { message: ['logo must be a URL address'] }, { status: 400, statusText: 'Bad Request' },
    );
    await tick();
    expect(toast.error).toHaveBeenCalledWith('logo must be a URL address');
  });

  it('R8: quien no es administrador la ve en solo lectura', async () => {
    await setup('MANAGER', { logo: 'https://cdn.x/l.png' });
    expect(el().querySelector('input[type="file"]')).toBeNull();
    expect(button('Guardar marca')).toBeUndefined();
    expect(el().textContent).toContain('Solo el administrador');
  });
});
