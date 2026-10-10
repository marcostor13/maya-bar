import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SuppressionComponent } from './suppression';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

const ANA = { _id: 's1', name: 'Ana Pérez', phone: '51999888777', reason: 'No quiere promos', source: 'inbox', createdAt: '2026-09-10T12:00:00Z' };
const SIN_NOMBRE = { _id: 's2', email: 'x@correo.com', source: 'reply', createdAt: '2026-09-11T12:00:00Z' };

describe('SuppressionComponent', () => {
  let fixture: ComponentFixture<SuppressionComponent>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  const confirm = { confirm: vi.fn() };

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes(label))!;
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('tbody tr'));
  const modal = () => el().querySelector('.form-modal') as HTMLElement;
  const click = (target: HTMLElement) => { target.click(); fixture.detectChanges(); };
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const expectList = () => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/suppression'));
  /** Campos del modal en orden: nombre, teléfono, email, motivo. */
  const fields = () => Array.from(modal().querySelectorAll<HTMLInputElement>('input.input'));

  async function mount() {
    await TestBed.configureTestingModule({
      imports: [SuppressionComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SuppressionComponent);
    fixture.detectChanges();
  }
  async function setup(entries: unknown[] = [ANA, SIN_NOMBRE]) {
    await mount();
    expectList().flush(entries);
    fixture.detectChanges();
  }

  beforeEach(() => { vi.clearAllMocks(); confirm.confirm.mockResolvedValue(true); });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  describe('listado', () => {
    it('mientras carga lo dice', async () => {
      await mount();
      expect(el().querySelector('.empty-state')!.textContent).toContain('Cargando…');
      expectList().flush([]);
    });

    it('sin nadie muestra el vacío explicando cómo se llena', async () => {
      await setup([]);
      expect(el().textContent).toContain('No hay nadie en la lista.');
      expect(el().textContent).toContain('0 personas');
      expect(el().querySelector('table')).toBeNull();
    });

    it('si falla la carga avisa con un toast', async () => {
      await mount();
      expectList().flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('No se pudo cargar la lista');
      expect(el().textContent).not.toContain('Cargando…');
    });

    it('pinta a cada persona con su contacto, motivo y origen', async () => {
      await setup();
      expect(el().querySelector('.count')!.textContent).toContain('2 personas');
      expect(rows()[0].querySelector('.who-name')!.textContent).toContain('Ana Pérez');
      expect(rows()[0].querySelector('.who-contact')!.textContent).toContain('+51999888777');
      expect(rows()[0].textContent).toContain('No quiere promos');
      expect(rows()[0].textContent).toContain('Desde un chat');
      // Sin nombre se le reconoce por el email, y sin motivo va un guion.
      expect(rows()[1].querySelector('.who-name')!.textContent).toContain('x@correo.com');
      expect(rows()[1].querySelector('.who-contact')).toBeNull();
      expect(rows()[1].querySelector('td[data-label="Motivo"]')!.textContent).toContain('—');
      expect(rows()[1].textContent).toContain('Lo pidió el cliente');
    });

    it('con una sola persona el contador va en singular', async () => {
      await setup([ANA]);
      expect(el().querySelector('.count')!.textContent!.trim()).toBe('1 persona');
    });
  });

  describe('búsqueda', () => {
    it('espera 300 ms tras la última tecla y busca con ?q= codificado', async () => {
      await setup();
      vi.useFakeTimers();
      const search = el().querySelector('.search-input') as HTMLInputElement;
      type(search, 'ana');
      vi.advanceTimersByTime(200);
      type(search, 'ana p');
      vi.advanceTimersByTime(299);
      http.expectNone((r) => r.url.includes('/suppression?q='));
      vi.advanceTimersByTime(1);

      const req = http.expectOne((r) => r.url.endsWith('/suppression?q=ana%20p'));
      expect(req.request.method).toBe('GET');
      req.flush([]);
      fixture.detectChanges();
      expect(el().textContent).toContain('Nadie coincide con esa búsqueda.');
    });
  });

  describe('añadir', () => {
    it('sin teléfono ni email avisa en el formulario y no manda nada', async () => {
      await setup();
      click(button('Añadir persona'));
      type(fields()[0], 'Solo nombre');
      click(button('Añadir a la lista'));
      expect(modal().querySelector('.fm-error')!.textContent).toContain('Escribe al menos un teléfono o un email.');
      http.expectNone((r) => r.method === 'POST');
    });

    it('manda POST /suppression solo con lo rellenado, avisa, cierra y recarga', async () => {
      await setup();
      click(button('Añadir persona'));
      type(fields()[0], ' Luis ');
      type(fields()[1], ' 51911222333 ');
      type(fields()[3], ' Pidió no recibir promociones ');
      click(button('Añadir a la lista'));
      expect(button('Guardando…').disabled).toBe(true);

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/suppression'));
      expect(req.request.body).toEqual({ name: 'Luis', phone: '51911222333', reason: 'Pidió no recibir promociones' });
      expect(req.request.body.email).toBeUndefined();
      req.flush({ _id: 's3' });
      fixture.detectChanges();

      expect(toast.success).toHaveBeenCalledWith('Añadido a la lista de no contactar');
      expect(modal()).toBeNull();
      expectList().flush([ANA]);
    });

    it('vale con solo el email', async () => {
      await setup();
      click(button('Añadir persona'));
      type(fields()[2], 'luis@correo.com');
      click(button('Añadir a la lista'));
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/suppression'));
      expect(req.request.body).toEqual({ email: 'luis@correo.com' });
      req.flush({ _id: 's3' });
      expectList().flush([]);
    });

    it('si el servidor lo rechaza muestra su mensaje en el formulario y deja reintentar', async () => {
      await setup();
      click(button('Añadir persona'));
      type(fields()[1], '123');
      click(button('Añadir a la lista'));
      http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/suppression'))
        .flush({ message: ['phone no es válido', 'revisa el número'] }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(modal().querySelector('.fm-error')!.textContent).toContain('phone no es válido revisa el número');
      expect(toast.success).not.toHaveBeenCalled();
      expect(button('Añadir a la lista').disabled).toBe(false);
    });

    it('cancelar cierra el modal sin mandar nada y al reabrir sale vacío', async () => {
      await setup();
      click(button('Añadir persona'));
      type(fields()[1], '51911222333');
      click(button('Cancelar'));
      expect(modal()).toBeNull();
      click(button('Añadir persona'));
      click(button('Añadir a la lista'));
      expect(modal().querySelector('.fm-error')).not.toBeNull();
    });
  });

  describe('quitar', () => {
    it('pide confirmación nombrando a la persona; cancelada no manda nada', async () => {
      await setup();
      confirm.confirm.mockResolvedValue(false);
      click(button('Quitar'));
      await settle();
      expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Quitar de la lista', confirmText: 'Quitar',
        message: expect.stringContaining('Ana Pérez'),
      }));
      http.expectNone((r) => r.method === 'DELETE');
    });

    it('confirmada manda DELETE /suppression/:id, avisa y recarga', async () => {
      await setup();
      click(button('Quitar'));
      await settle();
      const req = http.expectOne((r) => r.url.endsWith('/suppression/s1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      expect(toast.success).toHaveBeenCalledWith('Quitado de la lista');
      expectList().flush([SIN_NOMBRE]);
      fixture.detectChanges();
      expect(rows()).toHaveLength(1);
    });

    it('si falla avisa con un toast de error y la deja en la lista', async () => {
      await setup();
      click(button('Quitar'));
      await settle();
      http.expectOne((r) => r.url.endsWith('/suppression/s1')).flush(null, { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(toast.error).toHaveBeenCalledWith('No se pudo quitar de la lista');
      expect(rows()).toHaveLength(2);
    });
  });
});
