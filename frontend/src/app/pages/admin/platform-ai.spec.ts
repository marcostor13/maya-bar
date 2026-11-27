import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminPlatformAiComponent, PlatformAiView } from './platform-ai';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/admin/platform-ai`;
const SAVED: PlatformAiView = { enabled: true, provider: 'openai', model: 'gpt-5-mini', hasKey: true, keyHint: '••••1234' };

describe('AdminPlatformAiComponent (HU85)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };

  async function render(view: PlatformAiView = SAVED) {
    await TestBed.configureTestingModule({
      imports: [AdminPlatformAiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AdminPlatformAiComponent);
    f.detectChanges();
    http.expectOne(API).flush(view);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
  }

  const click = (el: HTMLElement, test: string) => (el.querySelector(`[data-test="${test}"]`) as HTMLButtonElement).click();

  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('C10: carga la configuración sin la key y muestra la pista de la guardada', async () => {
    const { c, el } = await render();
    expect(c.enabled).toBe(true);
    expect(c.provider).toBe('openai');
    expect(c.model).toBe('gpt-5-mini');
    expect(c.apiKey).toBe('');
    const key = el.querySelector('[data-test="key"]') as HTMLInputElement;
    expect(key.type).toBe('password');
    expect(key.placeholder).toContain('••••1234');
  });

  it('C10: guardar manda la key solo si se escribió y avisa con toast', async () => {
    const { f, c, el } = await render();
    click(el, 'save');
    let req = http.expectOne(r => r.method === 'PUT' && r.url === API);
    expect(req.request.body).toEqual({ enabled: true, provider: 'openai', model: 'gpt-5-mini' });
    req.flush(SAVED);
    expect(toast.success).toHaveBeenCalledWith('IA de la plataforma activada');

    c.apiKey = ' sk-nueva ';
    c.enabled = false;
    f.detectChanges();
    click(el, 'save');
    req = http.expectOne(r => r.method === 'PUT' && r.url === API);
    expect(req.request.body).toEqual({ enabled: false, provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-nueva' });
    req.flush({ message: 'Escribe la API key del proveedor' }, { status: 400, statusText: 'Bad Request' });
    expect(toast.error).toHaveBeenCalledWith('Escribe la API key del proveedor');
  });

  it('C10: lista modelos y prueba la conexión', async () => {
    const { f, c, el } = await render();
    click(el, 'load-models');
    const m = http.expectOne(`${API}/models`);
    expect(m.request.body).toEqual({ provider: 'openai' });
    m.flush({ source: 'live', models: [{ id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'Barato', recommended: true }] });
    f.detectChanges();
    expect(c.models().length).toBe(1);
    expect(el.textContent).toContain('Barato');

    click(el, 'test');
    const t = http.expectOne(`${API}/test`);
    expect(t.request.body).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
    t.flush({ ok: true, reply: 'ok' });
    f.detectChanges();
    expect(el.textContent).toContain('Conexión correcta');
    expect(toast.success).toHaveBeenCalled();

    click(el, 'test');
    http.expectOne(`${API}/test`).flush({ message: 'El proveedor rechazó la prueba: 401' }, { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect(el.textContent).toContain('El proveedor rechazó la prueba: 401');
  });

  it('cambiar de proveedor limpia el modelo; con Gemini avisa de las herramientas', async () => {
    const { f, c, el } = await render();
    c.provider = 'gemini';
    c.onProviderChange();
    f.detectChanges();
    expect(c.model).toBe('');
    expect(el.textContent).toContain('no usan herramientas');
  });
});
