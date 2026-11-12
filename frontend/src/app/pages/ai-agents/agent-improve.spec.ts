import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AgentImproveComponent, type Review, type PromptVersion } from './agent-improve';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const AGENT = { _id: 'a1', name: 'Sofía', systemPrompt: 'Eres Sofía.\nNunca des precios.' };

const REVIEW: Review = {
  _id: 'r1',
  days: 14,
  conversationsAnalyzed: 12,
  summary: 'El agente comenta ofertas de terceros.',
  createdAt: '2026-11-12T10:00:00Z',
  suggestions: [
    {
      title: 'Promociones de terceros',
      problem: 'Opina sobre eventos ajenos.',
      evidence: [{ conversationId: 'c9', excerpt: 'Veo que buscan patrocinadores' }],
      action: 'replace',
      find: 'Nunca des precios.',
      text: 'Nunca des precios. No comentes ofertas de terceros.',
      status: 'pending',
    },
    { title: 'Despedidas', problem: 'Repite', evidence: [], action: 'add', text: 'Regla nueva', status: 'pending' },
  ],
};

const VERSION: PromptVersion = {
  _id: 'v1', prompt: 'Prompt viejo', source: 'manual', createdAt: '2026-11-10T09:00:00Z',
};

describe('AgentImproveComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn(), state: () => null };
  const el = () => harness.routeNativeElement as HTMLElement;
  const button = (label: string, root: ParentNode = el()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().includes(label))!;
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('.suggestion'));
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    harness.detectChanges();
  };

  async function open(reviews: Review[] = [REVIEW], versions: PromptVersion[] = [VERSION]) {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ai-agents/a1/mejoras', AgentImproveComponent);
    http.expectOne((r) => r.url.endsWith('/ai-agents/a1')).flush(AGENT);
    http.expectOne((r) => r.url.endsWith('/ai-agents/a1/reviews')).flush(reviews);
    http.expectOne((r) => r.url.endsWith('/ai-agents/a1/versions')).flush(versions);
    harness.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    confirm.confirm.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: 'ai-agents/:id/mejoras', component: AgentImproveComponent }]),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('muestra el diagnóstico, el antes/después y el enlace a la conversación', async () => {
    await open();
    expect(el().querySelector('h1')!.textContent).toContain('Mejorar Sofía');
    expect(el().querySelector('.summary')!.textContent).toContain('ofertas de terceros');
    const [first, second] = cards();
    expect(first.querySelector('.before pre')!.textContent).toBe('Nunca des precios.');
    expect(first.querySelector('.after pre')!.textContent).toContain('No comentes ofertas');
    expect(first.querySelector('.evidence a')!.getAttribute('href')).toBe('/inbox?c=c9');
    expect(second.querySelector('.before')).toBeNull();
    expect(second.querySelector('.after .diff-label')!.textContent).toContain('Se agrega al final');
  });

  it('sin análisis lo dice y lanza uno con el periodo elegido', async () => {
    await open([]);
    expect(el().textContent).toContain('Aún no hay análisis');
    const select = el().querySelector<HTMLSelectElement>('select[name="days"]')!;
    select.value = select.options[2].value; // 30 días
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    button('Analizar conversaciones').click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/ai-agents/a1/reviews'));
    expect(req.request.body).toEqual({ days: 30 });
    req.flush(REVIEW);
    harness.detectChanges();
    expect(cards()).toHaveLength(2);
    expect(toast.success).toHaveBeenCalledWith('Análisis listo: 2 sugerencias');
  });

  it('si el análisis falla muestra el error del servidor', async () => {
    await open([]);
    button('Analizar conversaciones').click();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reviews'))
      .flush({ message: 'Este agente no atendió conversaciones en los últimos 14 días.' }, { status: 400, statusText: 'Bad' });
    harness.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('Este agente no atendió conversaciones en los últimos 14 días.');
    expect(button('Analizar conversaciones').disabled).toBe(false);
  });

  it('aplica una sugerencia tras confirmar y refresca prompt, estado e historial', async () => {
    await open();
    button('Aplicar', cards()[0]).click();
    await settle();
    expect(confirm.confirm).toHaveBeenCalled();
    http
      .expectOne((r) => r.url.endsWith('/reviews/r1/suggestions/0/apply'))
      .flush({
        agent: { ...AGENT, systemPrompt: 'nuevo' },
        review: { ...REVIEW, suggestions: [{ ...REVIEW.suggestions[0], status: 'applied' }, REVIEW.suggestions[1]] },
      });
    http.expectOne((r) => r.url.endsWith('/versions')).flush([VERSION, { ...VERSION, _id: 'v2' }]);
    harness.detectChanges();
    expect(cards()[0].querySelector('.badge')!.textContent).toContain('Aplicada');
    expect(button('Aplicar', cards()[0])).toBeUndefined();
    expect(el().querySelectorAll('.version')).toHaveLength(2);
    expect(toast.success).toHaveBeenCalledWith('Sugerencia aplicada al prompt');
  });

  it('si el usuario cancela la confirmación no aplica nada', async () => {
    confirm.confirm.mockResolvedValue(false);
    await open();
    button('Aplicar', cards()[0]).click();
    await settle();
    http.expectNone((r) => r.url.includes('/apply'));
  });

  it('un 409 al aplicar se muestra como error', async () => {
    await open();
    button('Aplicar', cards()[0]).click();
    await settle();
    http
      .expectOne((r) => r.url.endsWith('/apply'))
      .flush({ message: 'El texto que la sugerencia cambia ya no está en el prompt.' }, { status: 409, statusText: 'Conflict' });
    expect(toast.error).toHaveBeenCalledWith('El texto que la sugerencia cambia ya no está en el prompt.');
  });

  it('descarta una sugerencia', async () => {
    await open();
    button('Descartar', cards()[1]).click();
    await settle();
    http
      .expectOne((r) => r.url.endsWith('/reviews/r1/suggestions/1/discard'))
      .flush({ ...REVIEW, suggestions: [REVIEW.suggestions[0], { ...REVIEW.suggestions[1], status: 'discarded' }] });
    harness.detectChanges();
    expect(cards()[1].querySelector('.badge')!.textContent).toContain('Descartada');
  });

  it('muestra una versión y la restaura tras confirmar', async () => {
    await open();
    const version = el().querySelector<HTMLElement>('.version')!;
    expect(version.textContent).toContain('Edición manual');
    button('Ver', version).click();
    harness.detectChanges();
    expect(version.querySelector('pre')!.textContent).toBe('Prompt viejo');
    button('Restaurar', version).click();
    await settle();
    http.expectOne((r) => r.url.endsWith('/versions/v1/restore')).flush({ ...AGENT, systemPrompt: 'Prompt viejo' });
    http.expectOne((r) => r.url.endsWith('/versions')).flush([]);
    harness.detectChanges();
    expect(toast.success).toHaveBeenCalledWith('Versión restaurada');
  });
});
