import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmailComposeComponent } from './email-compose';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const toast = { success: vi.fn(), error: vi.fn() };
const accounts = [
  { _id: 'a1', label: 'Soporte', detail: 'soporte@acme.pe', isDefault: false },
  { _id: 'a2', label: 'Ventas', detail: 'ventas@acme.pe', isDefault: true },
];

describe('EmailComposeComponent', () => {
  let fixture: ComponentFixture<EmailComposeComponent>;
  let component: EmailComposeComponent;
  let http: HttpTestingController;

  function create(preferredId = '') {
    fixture = TestBed.createComponent(EmailComposeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('preferredId', preferredId);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [EmailComposeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('propone el buzón filtrado o, si no, el predeterminado', () => {
    create();
    expect(component.form.accountId).toBe('a2');
    create('a1');
    expect(component.form.accountId).toBe('a1');
  });

  it('solo deja enviar con destinatario válido, asunto y mensaje', () => {
    create();
    component.form = { accountId: 'a2', to: 'no-es-correo', subject: 'Hola', text: 'x' };
    expect(component.valid()).toBe(false);
    component.form.to = 'ana@cliente.pe';
    component.form.subject = '  ';
    expect(component.valid()).toBe(false);
    component.form.subject = 'Propuesta';
    expect(component.valid()).toBe(true);
  });

  it('envía el correo y devuelve la conversación creada', () => {
    create();
    const sent = vi.fn();
    component.sent.subscribe(sent);
    component.form = { accountId: 'a2', to: ' ana@cliente.pe ', subject: ' Propuesta ', text: 'Hola Ana ' };
    component.send();
    const req = http.expectOne(`${environment.apiUrl}/conversations/email/compose`);
    expect(req.request.body).toEqual({ accountId: 'a2', to: 'ana@cliente.pe', subject: 'Propuesta', text: 'Hola Ana' });
    req.flush({ conversationId: 'c9', status: 'sent' });
    expect(toast.success).toHaveBeenCalledWith('Correo enviado');
    expect(sent).toHaveBeenCalledWith('c9');
  });

  it('muestra el error del servidor y no cierra', () => {
    create();
    const sent = vi.fn();
    component.sent.subscribe(sent);
    component.form = { accountId: 'a2', to: 'ana@cliente.pe', subject: 'x', text: 'y' };
    component.send();
    http.expectOne(`${environment.apiUrl}/conversations/email/compose`).flush(
      { message: 'La cuenta de correo está inactiva' }, { status: 400, statusText: 'Bad Request' },
    );
    expect(toast.error).toHaveBeenCalledWith('La cuenta de correo está inactiva');
    expect(sent).not.toHaveBeenCalled();
    expect(component.sending()).toBe(false);
  });
});
