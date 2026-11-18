import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageCostsCardComponent, type MessageCosts } from './message-costs-card';
import { ToastService } from '../../shared/toast';

const COSTS: MessageCosts = {
  range: '30d',
  currency: 'USD',
  ratesEffective: '2026-10-01',
  totalUsd: 3.2203,
  whatsapp: { usd: 0.0703, billed: 1, free: 4, unknown: 2, byCategory: [{ category: 'marketing', count: 1, usd: 0.0703 }] },
  sms: { segments: 3, messages: 2, ratePerSegment: null, usd: null },
  email: { sent: 3000, ratePer1000: 1, usd: 3 },
  instagram: { sent: 2, usd: 0 },
  messenger: { sent: 1, usd: 0 },
  settings: { emailPer1000: 1 },
};

describe('MessageCostsCardComponent (HU18 C6)', () => {
  let fixture: ComponentFixture<MessageCostsCardComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [MessageCostsCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MessageCostsCardComponent);
    fixture.componentRef.setInput('range', '30d');
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  const flush = (c = COSTS) => {
    const req = http.expectOne((r) => r.url.endsWith('/dashboard/costs'));
    expect(req.request.params.get('range')).toBe('30d');
    req.flush(c);
  };

  it('pinta total, desglose, «sin tarifa», aviso y enlaces', async () => {
    flush();
    await settle();
    const text = el().textContent!;
    expect(text).toContain('US$ 3.2203');
    expect(text).toContain('Marketing');
    expect(text).toContain('1 cobrados · 4 gratis');
    expect(text).toContain('Sin tarifa');
    expect(text).toContain('Gratis');
    expect(text).toContain('2 mensajes de WhatsApp aún sin dato');
    expect(text).toContain('Estimación con tarifas de lista');
    const links = Array.from(el().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('https://developers.facebook.com/docs/whatsapp/pricing');
    expect(links).toContain('https://resend.com/pricing');
    expect(links.some((l) => l!.includes('twilio.com'))).toBe(true);
    expect(links.some((l) => l!.includes('messenger-platform'))).toBe(true);
  });

  it('guarda las tarifas con toast y recarga', async () => {
    flush();
    await settle();
    button('Tarifas').click();
    await settle();
    const sms = el().querySelector('#mc-sms') as HTMLInputElement;
    expect((el().querySelector('#mc-email') as HTMLInputElement).value).toBe('1');
    sms.value = '0.05';
    sms.dispatchEvent(new Event('input'));
    await settle();
    button('Guardar').click();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/dashboard/costs/settings'));
    expect(req.request.body).toEqual({ smsPerSegment: 0.05, emailPer1000: 1 });
    req.flush({ smsPerSegment: 0.05, emailPer1000: 1 });
    expect(toast.success).toHaveBeenCalledWith('Tarifas guardadas');
    flush();
  });

  it('una tarifa fuera de rango no se envía', async () => {
    flush();
    await settle();
    button('Tarifas').click();
    await settle();
    const sms = el().querySelector('#mc-sms') as HTMLInputElement;
    sms.value = '50';
    sms.dispatchEvent(new Event('input'));
    await settle();
    button('Guardar').click();
    expect(toast.error).toHaveBeenCalled();
    http.expectNone((r) => r.method === 'PUT');
  });
});
