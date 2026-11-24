import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebchatSettingsComponent, type WebWidgetConfig } from './webchat-settings';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const W: WebWidgetConfig = {
  _id: 'w1', key: 'k'.repeat(32), active: false, title: 'Escríbenos', greeting: 'Hola', color: '#4F46E5',
  askContact: false, whatsappNumber: '', allowedDomains: [], agentId: null,
  snippet: '<script src="https://api/public/webchat/widget.js" data-key="kkk" async></script>',
};

describe('Chat web en Configuración (HU69)', () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  let http: HttpTestingController;

  async function setup() {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [WebchatSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(WebchatSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}/webchat/widget`).flush(W);
    http.expectOne(`${API}/ai-agents`).flush([{ _id: 'a1', name: 'Vendedor', published: true }]);
    f.detectChanges();
    return f;
  }
  afterEach(() => http.verify());

  it('muestra el código para pegar y no deja activar sin dominios', async () => {
    const f = await setup();
    const c = f.componentInstance;
    expect((f.nativeElement as HTMLElement).textContent).toContain('data-key="kkk"');
    c.form.active = true;
    c.save();
    http.expectNone(`${API}/webchat/widget`);
    expect(toast.error).toHaveBeenCalledWith('Agrega al menos un dominio donde pegarás el chat');
  });

  it('guarda dominios, agente y color', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.form.active = true;
    c.form.agentId = 'a1';
    c.domains = 'mitienda.pe\n blog.mitienda.pe ';
    c.save();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${API}/webchat/widget`);
    expect(req.request.body).toMatchObject({ active: true, agentId: 'a1', allowedDomains: ['mitienda.pe', 'blog.mitienda.pe'] });
    req.flush({ ...W, active: true, agentId: 'a1', allowedDomains: ['mitienda.pe', 'blog.mitienda.pe'] });
    expect(toast.success).toHaveBeenCalledWith('Chat web guardado');
    expect(c.domains).toBe('mitienda.pe\nblog.mitienda.pe');
  });
});
