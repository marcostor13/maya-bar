import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { QuoteEditorComponent } from './quote-editor';
import { computeQuote } from './quote-calc';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const QUOTE = {
  _id: 'q1', leadId: 'l1', number: 'COT-0007', igvRate: 18, currency: 'PEN', subtotal: 200, discount: 0, igv: 36, total: 236,
  items: [{ name: 'Servicio', unit: 'unidad', quantity: 2, unitPrice: 118, discountPct: 0, taxIncluded: true, total: 236 }],
  validUntil: '2030-01-31T00:00:00.000Z', notes: '', payOnline: false, status: 'draft', publicToken: 'tok', sentVia: [], createdAt: '2026-11-24',
};

describe('Editor de cotizaciones (HU68)', () => {
  let fixture: ComponentFixture<QuoteEditorComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };
  const navigate = vi.fn().mockResolvedValue(true);

  async function setup(id: string, query: Record<string, string> = {}) {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [QuoteEditorComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }), queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QuoteEditorComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/products`).flush([
      { _id: 'p1', name: 'Hora de consultoría', price: 150, taxIncluded: false, unit: 'hora', active: true, source: 'manual' },
    ]);
  }
  afterEach(() => http?.verify());

  it('el cálculo del frontend cuadra con el del backend', () => {
    expect(computeQuote([
      { quantity: 1, unitPrice: 1000, discountPct: 10, taxIncluded: false },
      { quantity: 3, unitPrice: 9.99, taxIncluded: true },
    ])).toMatchObject({ subtotal: 925.4, igv: 166.57, total: 1091.97, discount: 100 });
  });

  it('nueva: agrega del catálogo, recalcula al editar y crea la cotización de la oportunidad', async () => {
    await setup('nueva', { lead: 'l1' });
    const c = fixture.componentInstance;
    fixture.detectChanges();
    const sel = (fixture.nativeElement as HTMLElement).querySelector('.add-product') as HTMLSelectElement;
    sel.value = 'p1';
    sel.dispatchEvent(new Event('change'));
    expect(c.state.items).toHaveLength(1);
    expect(c.totals()).toMatchObject({ subtotal: 150, igv: 27, total: 177 });
    c.state.items[0].quantity = 2;
    c.touch();
    expect(c.totals().total).toBe(354);
    expect(c.dirty()).toBe(true);

    void c.save();
    const req = http.expectOne(`${API}/quotes`);
    expect(req.request.body).toMatchObject({
      leadId: 'l1', igvRate: 18, payOnline: false,
      items: [{ productId: 'p1', name: 'Hora de consultoría', quantity: 2, unitPrice: 150, taxIncluded: false }],
    });
    req.flush(QUOTE);
    expect(toast.success).toHaveBeenCalledWith('Cotización COT-0007 creada');
    expect(navigate).toHaveBeenCalledWith(['/cotizaciones', 'q1'], { replaceUrl: true });
    expect(c.dirty()).toBe(false);
  });

  it('no guarda sin ítems con descripción', async () => {
    await setup('nueva', { lead: 'l1' });
    void fixture.componentInstance.save();
    expect(toast.error).toHaveBeenCalledWith('Agrega al menos un ítem con descripción');
  });

  it('existente: envía por email tras confirmar y muestra el error del servidor por WhatsApp', async () => {
    await setup('q1');
    http.expectOne(`${API}/quotes/q1`).flush(QUOTE);
    const c = fixture.componentInstance;
    expect(c.publicLink()).toContain('/q/tok');

    confirm.confirm.mockResolvedValue(true);
    await c.send('email');
    const req = http.expectOne(`${API}/quotes/q1/send`);
    expect(req.request.body).toEqual({ channel: 'email' });
    req.flush({ ...QUOTE, status: 'sent', sentVia: ['email'] });
    expect(toast.success).toHaveBeenCalledWith('Cotización enviada por email');
    expect(c.quote()!.status).toBe('sent');

    await c.send('whatsapp');
    http.expectOne(`${API}/quotes/q1/send`).flush({ message: 'La ventana de 24 h de WhatsApp está cerrada' }, { status: 409, statusText: 'Conflict' });
    expect(toast.error).toHaveBeenCalledWith('La ventana de 24 h de WhatsApp está cerrada');
  });

  it('una cotización aceptada queda de solo lectura y volver abre la oportunidad', async () => {
    await setup('q1');
    http.expectOne(`${API}/quotes/q1`).flush({ ...QUOTE, status: 'accepted' });
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.closed()).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).not.toContain('Guardar');
    c.back();
    expect(navigate).toHaveBeenCalledWith(['/leads'], { queryParams: { lead: 'l1' } });
  });
});
