import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignRecipientsComponent } from './campaign-recipients';
import { ResendSettingsComponent } from '../settings/resend-settings';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';
import type { Campaign } from '../../shared/models/campaign.model';

const API = environment.apiUrl;
const STATS = { total: 3, pending: 0, sent: 3, failed: 0, skipped: 0 };

describe('Aperturas y clics de email (HU61)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };

  async function configure() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: { confirm: vi.fn() } }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  }

  async function setup(type: 'email' | 'sms') {
    await configure();
    const f = TestBed.createComponent(CampaignRecipientsComponent);
    f.componentRef.setInput('campaign', { _id: 'c1', name: 'Black Friday', type } as Campaign);
    f.detectChanges();
    http.expectOne((r) => r.url === `${API}/campaigns/c1/recipients`).flush({
      items: [
        { _id: 'r1', customerId: 'k1', name: 'Ana', to: 'ana@x.pe', status: 'sent', openedAt: '2026-11-24', opens: 3, clickedAt: '2026-11-24', clicks: 1 },
        { _id: 'r2', customerId: 'k2', name: 'Beto', to: 'b@x.pe', status: 'sent', bouncedAt: '2026-11-24', bounceType: 'hard' },
      ],
      total: 2, page: 1, pageSize: 100, stats: STATS,
    });
    return f;
  }
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('muestra tasas, aviso de Apple Mail, quién hizo clic y marcas por destinatario', async () => {
    const f = await setup('email');
    http.expectOne(`${API}/campaigns/c1/email-metrics`).flush({
      sent: 3, delivered: 3, opened: 2, clicked: 1, bounced: 1, complained: 0, unsubscribed: 0,
      rates: { open: 66.7, click: 33.3, bounce: 33.3, unsubscribe: 0 },
      clickers: [{ _id: 'r1', customerId: 'k1', name: 'Ana', to: 'ana@x.pe', clicks: 1, lastClickUrl: 'https://marca.pe/oferta' }],
    });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('66.7%');
    expect(el.textContent).toContain('Apple Mail');
    expect(el.textContent).toContain('https://marca.pe/oferta');
    expect(el.textContent).toContain('Abrió ×3');
    expect(el.textContent).toContain('Rebote duro');

    f.componentInstance.createLead(f.componentInstance.metrics()!.clickers[0]);
    const req = http.expectOne(`${API}/leads`);
    expect(req.request.body).toEqual({ customerId: 'k1', title: 'Black Friday: hizo clic', source: 'email' });
    req.flush({ _id: 'l1' });
    expect(toast.success).toHaveBeenCalledWith('Oportunidad creada para Ana');
  });

  it('en SMS no pide métricas de email', async () => {
    await setup('sms');
    http.expectNone(`${API}/campaigns/c1/email-metrics`);
  });

  it('Resend: guarda el secreto del webhook y activa el seguimiento', async () => {
    await configure();
    const f = TestBed.createComponent(ResendSettingsComponent);
    f.detectChanges();
    http.expectOne(`${API}/resend/config`).flush({
      enabled: true, hasKey: true, keyHint: 'abcd', fromEmail: 'hola@marca.pe', fromName: '', replyTo: '', ratePerMinute: 100,
      domains: [], fromVerified: null, webhookUrl: 'https://api.x/resend/webhook/t1', hasWebhookSecret: false, trackingEnabled: false,
    });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect((el.querySelector('input[aria-label="URL del webhook"]') as HTMLInputElement).value).toBe('https://api.x/resend/webhook/t1');
    const c = f.componentInstance;
    c.webhookSecret = 'whsec_abc';
    c.saveSecret();
    const s = http.expectOne(`${API}/resend/webhook-secret`);
    expect(s.request.body).toEqual({ secret: 'whsec_abc' });
    s.flush({ ...c.config(), hasWebhookSecret: true });
    expect(toast.success).toHaveBeenCalledWith('Secreto del webhook guardado');
    c.enableTracking();
    http.expectOne(`${API}/resend/tracking`).flush({ ...c.config(), trackingEnabled: true });
    expect(c.config()?.trackingEnabled).toBe(true);
  });
});
