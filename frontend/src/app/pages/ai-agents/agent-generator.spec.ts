import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AgentGeneratorComponent } from './agent-generator';
import { ToastService } from '../../shared/toast';

const DRAFT = {
  name: 'Fara',
  description: 'Asistente de la farmacia',
  systemPrompt: '# Reglas de oro\n...',
  greeting: '¡Hola!',
  handoffInstructions: 'Reclamos',
};

describe('AgentGeneratorComponent', () => {
  let fixture: ComponentFixture<AgentGeneratorComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(label))!;

  async function type(name: string, value: string) {
    const input = el().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function fillRequired() {
    await type('businessName', 'Farma Center');
    await type('industry', 'Farmacia');
    await type('offer', 'Medicamentos con delivery');
    await type('goal', 'Tomar pedidos');
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AgentGeneratorComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgentGeneratorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('no deja generar sin los datos obligatorios', async () => {
    expect(button('Generar agente').disabled).toBe(true);
    await fillRequired();
    expect(button('Generar agente').disabled).toBe(false);
  });

  it('genera un borrador, lo muestra editable y crea el agente sin publicar', async () => {
    await fillRequired();
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne((r) => r.url.endsWith('/ai-agents/generate'));
    expect(req.request.body).toEqual({
      businessName: 'Farma Center', industry: 'Farmacia', offer: 'Medicamentos con delivery',
      goal: 'Tomar pedidos', tone: 'cercano', language: 'es',
    });
    req.flush(DRAFT);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector<HTMLTextAreaElement>('[name="draftPrompt"]')!.value).toBe(DRAFT.systemPrompt);
    http.expectNone((r) => r.method === 'POST' && r.url.endsWith('/ai-agents'));

    await type('draftName', 'Fara 2');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button('Crear agente').click();
    const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/ai-agents'));
    expect(create.request.body).toEqual({
      name: 'Fara 2', description: DRAFT.description, systemPrompt: DRAFT.systemPrompt, greeting: '¡Hola!',
      handoffEnabled: false, handoffInstructions: 'Reclamos', published: false,
    });
    create.flush({ _id: 'new1' });
    expect(toast.success).toHaveBeenCalledWith('Agente creado como borrador');
    expect(navigate).toHaveBeenCalledWith(['/ai-agents'], { queryParams: { edit: 'new1' } });
  });

  it('si la IA falla muestra el error y no queda borrador', async () => {
    await fillRequired();
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne((r) => r.url.endsWith('/generate'))
      .flush({ message: 'No hay API key de IA configurada' }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('No hay API key de IA configurada');
    expect(el().querySelector('[name="draftPrompt"]')).toBeNull();
  });
});
