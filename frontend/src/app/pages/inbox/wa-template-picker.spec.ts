import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WaTemplatePickerComponent, type ChatTemplate } from './wa-template-picker';
import { windowState, formatLeft, renderTemplate, WINDOW_MS } from './wa-window';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const HOUR = 3_600_000;
const toast = { success: vi.fn(), error: vi.fn() };

const tpl = (data: Partial<ChatTemplate> = {}): ChatTemplate => ({
  _id: 't1',
  name: 'seguimiento',
  language: 'es',
  category: 'UTILITY',
  body: 'Hola {{1}}, ¿seguimos con {{2}}?',
  variables: 2,
  headerVariable: false,
  ...data,
});

describe('windowState (HU27)', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');

  it('sin ventana (QR, Instagram, correo) siempre se puede escribir', () => {
    expect(windowState(null, undefined, now)).toEqual({ applies: false, open: true, msLeft: 0 });
    expect(windowState({ applies: false, open: true, expiresAt: null }, undefined, now).open).toBe(true);
  });

  it('cuenta atrás desde lo que dijo el servidor y se cierra al vencer', () => {
    const server = { applies: true, open: true, expiresAt: new Date(now + 3 * HOUR).toISOString() };
    expect(windowState(server, undefined, now)).toEqual({ applies: true, open: true, msLeft: 3 * HOUR });
    expect(windowState(server, undefined, now + 3 * HOUR).open).toBe(false);
  });

  it('C2: un entrante nuevo reabre la ventana sin volver a preguntar', () => {
    const closed = { applies: true, open: false, expiresAt: new Date(now - HOUR).toISOString() };
    expect(windowState(closed, undefined, now).open).toBe(false);
    const justNow = new Date(now - 60_000).toISOString();
    const w = windowState(closed, justNow, now);
    expect(w.open).toBe(true);
    expect(w.msLeft).toBe(WINDOW_MS - 60_000);
  });

  it('formatea el tiempo y rellena la vista previa', () => {
    expect(formatLeft(3 * HOUR + 20 * 60_000)).toBe('3 h 20 min');
    expect(formatLeft(2 * HOUR)).toBe('2 h');
    expect(formatLeft(45 * 60_000)).toBe('45 min');
    expect(formatLeft(10_000)).toBe('menos de 1 min');
    expect(renderTemplate('Hola {{1}} y {{2}}', ['Ana', ' '])).toBe('Hola Ana y {{2}}');
  });
});

describe('WaTemplatePickerComponent (HU27)', () => {
  let fixture: ComponentFixture<WaTemplatePickerComponent>;
  let component: WaTemplatePickerComponent;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  function create(list: ChatTemplate[]) {
    fixture = TestBed.createComponent(WaTemplatePickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('conversationId', 'c1');
    fixture.componentRef.setInput('contactName', 'Ana Pérez');
    fixture.detectChanges();
    http.expectOne(`${API}/conversations/c1/templates`).flush(list);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [WaTemplatePickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin plantillas aprobadas explica dónde crearlas', () => {
    create([]);
    expect(text()).toContain('no tiene plantillas aprobadas');
    expect(component.canSend()).toBe(false);
  });

  it('C3: propone el nombre en {{1}}, pide el resto y envía con un id de dispositivo', () => {
    create([tpl()]);
    expect(component.selectedId()).toBe('t1');
    expect(component.vars()).toEqual(['Ana', '']);
    expect(component.canSend()).toBe(false);

    component.setVar(1, 'tu pedido');
    fixture.detectChanges();
    expect(component.preview()).toBe('Hola Ana, ¿seguimos con tu pedido?');
    expect(text()).toContain('Hola Ana, ¿seguimos con tu pedido?');
    expect(component.canSend()).toBe(true);

    const sent = vi.fn();
    component.sent.subscribe(sent);
    component.send();
    const req = http.expectOne(`${API}/conversations/c1/messages/template`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ templateId: 't1', variables: ['Ana', 'tu pedido'] });
    expect(req.request.body.clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    req.flush({ _id: 'm1', template: { name: 'seguimiento' } });
    expect(sent).toHaveBeenCalledWith({ _id: 'm1', template: { name: 'seguimiento' } });
    expect(toast.success).toHaveBeenCalled();
  });

  it('cabecera con variable: no envía sin su texto', () => {
    create([tpl({ variables: 0, body: 'Hola', headerType: 'TEXT', headerText: 'Hola {{1}}', headerVariable: true })]);
    component.send();
    expect(toast.error).toHaveBeenCalledWith('Escribe el texto de la cabecera');
    http.expectNone(`${API}/conversations/c1/messages/template`);
    component.headerText = 'Ana';
    component.send();
    const req = http.expectOne(`${API}/conversations/c1/messages/template`);
    expect(req.request.body.headerText).toBe('Ana');
    req.flush({});
  });

  it('si el servidor la rechaza, muestra su motivo y no cierra', () => {
    create([tpl({ variables: 0, body: 'Hola' })]);
    const sent = vi.fn();
    component.sent.subscribe(sent);
    component.send();
    http.expectOne(`${API}/conversations/c1/messages/template`)
      .flush({ message: 'Esa plantilla no existe' }, { status: 422, statusText: 'Unprocessable' });
    expect(toast.error).toHaveBeenCalledWith('Esa plantilla no existe');
    expect(sent).not.toHaveBeenCalled();
    expect(component.sending()).toBe(false);
  });
});
