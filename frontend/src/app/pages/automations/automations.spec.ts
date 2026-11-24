import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AutomationsComponent, type Automation } from './automations';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/automations`;
const STATS = { entered: 12, active: 3, completed: 6, replied: 4, exited: 3 };
const AUTO: Automation = {
  _id: 'a1', name: 'Seguimiento formulario', active: true, exitOnReply: true,
  trigger: { type: 'form_submitted' }, stats: STATS,
  steps: [{ type: 'whatsapp', text: 'Hola' }, { type: 'wait', minutes: 1440 }, { type: 'email', subject: 'Hola', text: 'x' }],
};

describe('Automatizaciones (HU58)', () => {
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn().mockResolvedValue(true) };

  async function setup() {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ToastService, useValue: toast }, { provide: ConfirmService, useValue: confirm }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AutomationsComponent);
    f.detectChanges();
    http.expectOne(API).flush([AUTO]);
    http.expectOne(`${API}/templates`).flush([{ key: 'form-followup', name: 'Seguimiento de lead del formulario (3 toques)', description: '…' }]);
    f.detectChanges();
    return f;
  }
  const flushRefs = () => {
    for (const path of ['/forms', '/leads/stages', '/events', '/leads/owners', '/campaigns', '/whatsapp-templates'])
      http.expectOne(`${environment.apiUrl}${path}`).flush([]);
  };
  afterEach(() => { http?.verify(); vi.clearAllMocks(); });

  it('lista las automatizaciones con sus métricas y las plantillas', async () => {
    const f = await setup();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Seguimiento formulario');
    expect(el.textContent).toContain('Envía un formulario · 3 pasos');
    expect(el.querySelector('[data-auto="a1"] .stats')!.textContent).toContain('4 respondieron');
    expect(el.querySelector('[data-tpl="form-followup"]')).toBeTruthy();
  });

  it('crea una secuencia con pasos en lista: espera en días se guarda en minutos', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.openNew();
    flushRefs();
    let e = c.editing()!;
    e.name = 'Leads web';
    c.addStep('wait');
    e = c.editing()!;
    c.setUnit(e, 1, 'd');
    c.setWait(e, 1, 1);
    c.addStep('email');
    e = c.editing()!;
    e.steps[2].subject = 'Hola {nombre}';
    e.steps[2].text = 'Seguimos';
    c.move(2, -1);
    c.move(1, 1);
    e.useWindow = true;
    c.save();
    const req = http.expectOne(r => r.method === 'POST' && r.url === API);
    expect(req.request.body).toMatchObject({
      name: 'Leads web', trigger: { type: 'form_submitted' }, exitOnReply: true, sendWindow: { from: 8, to: 20 },
      steps: [{ type: 'whatsapp' }, { type: 'wait', minutes: 1440 }, { type: 'email', subject: 'Hola {nombre}' }],
    });
    req.flush({ _id: 'a2' });
    http.expectOne(API).flush([]);
    expect(toast.success).toHaveBeenCalledWith('Automatización guardada');
    expect(c.editing()).toBeNull();
  });

  it('un error de validación del servidor se muestra con toast', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.openNew();
    flushRefs();
    c.editing()!.name = 'X';
    c.save();
    http.expectOne(r => r.method === 'POST').flush({ message: 'Paso 1: escribe el mensaje o elige una plantilla.' }, { status: 400, statusText: 'Bad Request' });
    expect(toast.error).toHaveBeenCalledWith('Paso 1: escribe el mensaje o elige una plantilla.');
  });

  it('pausa y elimina con confirmación', async () => {
    const f = await setup();
    const c = f.componentInstance;
    c.toggle(AUTO);
    const p = http.expectOne(`${API}/a1/active`);
    expect(p.request.body).toEqual({ active: false });
    p.flush({ active: false });
    expect(c.items()[0].active).toBe(false);
    await c.remove(AUTO);
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    http.expectOne(r => r.method === 'DELETE' && r.url === `${API}/a1`).flush({ deleted: true });
    http.expectOne(API).flush([]);
  });
});
