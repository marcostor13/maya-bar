import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminOnboardingComponent, OnboardingTask } from './onboarding';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/billing/admin/onboarding`;
const TASK: OnboardingTask = {
  _id: 't1', sessionPublicId: 's1', packageName: 'Puesta en marcha', plan: 'crece', period: 'annual', status: 'pending',
  contact: { company: 'Pastelería Ana', name: 'Ana', email: 'ana@x.pe', phone: '999' },
  checklist: [{ label: 'Conectar WhatsApp', done: false }, { label: 'Capacitación', done: false }],
  paidAt: '2026-11-24T12:00:00Z',
};

describe('AdminOnboardingComponent (HU55)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };

  async function render() {
    await TestBed.configureTestingModule({
      imports: [AdminOnboardingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AdminOnboardingComponent);
    f.detectChanges();
    http.expectOne(API).flush([TASK]);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('C2: muestra la tarea con contacto, paquete y checklist; marcar un paso lo guarda', async () => {
    const { f, el } = await render();
    const card = el.querySelector('[data-task="t1"]')!;
    expect(card.textContent).toContain('Pastelería Ana');
    expect(card.textContent).toContain('Puesta en marcha');
    expect(card.textContent).toContain('ana@x.pe');
    expect(card.textContent).toContain('0 de 2 pasos');
    const box = card.querySelector('input[type="checkbox"]') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const req = http.expectOne(`${API}/t1`);
    expect(req.request.body).toEqual({ checklist: [{ index: 0, done: true }] });
    req.flush({ ...TASK, checklist: [{ label: 'Conectar WhatsApp', done: true }, TASK.checklist[1]] });
    f.detectChanges();
    expect(el.textContent).toContain('1 de 2 pasos');
    expect(toast.success).toHaveBeenCalled();
  });

  it('guarda las notas al salir del campo y saca la tarea si ya no es del filtro', async () => {
    const { f, el } = await render();
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'Sesión el lunes';
    ta.dispatchEvent(new Event('blur'));
    http.expectOne(`${API}/t1`).flush({ ...TASK, notes: 'Sesión el lunes' });
    f.componentInstance.filter.set('pending');
    f.componentInstance.setStatus(f.componentInstance.tasks()[0], 'scheduled');
    http.expectOne(`${API}/t1`).flush({ ...TASK, status: 'scheduled' });
    f.detectChanges();
    expect(f.componentInstance.tasks()).toHaveLength(0);
  });

  it('filtra por estado', async () => {
    const { f, el } = await render();
    const btn = [...el.querySelectorAll('.pill')].find(b => b.textContent!.trim() === 'Terminada') as HTMLButtonElement;
    btn.click();
    http.expectOne(r => r.url === API && r.params.get('status') === 'done').flush([]);
    f.detectChanges();
    expect(el.textContent).toContain('No hay implementaciones en este estado');
  });
});
