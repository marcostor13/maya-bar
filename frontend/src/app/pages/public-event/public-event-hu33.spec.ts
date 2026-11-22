import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PublicEventComponent } from './public-event';
import { buildIcs, ctaLabel, googleCalendarUrl, saveTicket } from './public-event-utils';

describe('public-event-utils (HU33)', () => {
  it('C3: .ics con hora local y fin al día siguiente si cruza la medianoche', () => {
    const ics = buildIcs({ title: 'Fiesta, noche', date: '2030-01-01', startTime: '22:00', endTime: '02:00', location: 'Bar; Centro' }, 'e1@maya');
    expect(ics).toContain('DTSTART:20300101T220000');
    expect(ics).toContain('DTEND:20300102T020000');
    expect(ics).toContain('SUMMARY:Fiesta\\, noche');
    expect(ics).toContain('LOCATION:Bar\\; Centro');
  });

  it('C3: sin hora es de día completo; Google Calendar lleva las fechas', () => {
    const ics = buildIcs({ title: 'X', date: '2030-12-31' }, 'u');
    expect(ics).toContain('DTSTART;VALUE=DATE:20301231');
    expect(ics).toContain('DTEND;VALUE=DATE:20310101');
    expect(googleCalendarUrl({ title: 'X', date: '2030-12-31' })).toContain('dates=20301231%2F20310101');
  });

  it('C5: el botón no promete un pago en línea', () => {
    expect(ctaLabel(0)).toBe('Reservar mi lugar');
    expect(ctaLabel(30)).toBe('Reservar entrada · S/ 30');
  });
});

describe('PublicEventComponent: invitado en el móvil (HU33)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PublicEventComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    localStorage.removeItem('maya.ticket.e1');
    await TestBed.configureTestingModule({
      imports: [PublicEventComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'fiesta' }), queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('maya.ticket.e1');
  });

  const load = (price = 0) => {
    fixture = TestBed.createComponent(PublicEventComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/public/events/fiesta')).flush({
      event: { _id: 'e1', title: 'Fiesta 2030', description: 'Línea uno\nLínea dos', date: '2030-01-01', startTime: '21:00', capacity: 0, price, status: 'published' },
      registrationsCount: 0,
      brand: null,
      venue: { name: 'Bar Centro', address: 'Av. Larco 123' },
    });
    fixture.detectChanges();
  };

  it('C1: muestra descripción y lugar con "Cómo llegar"', () => {
    load();
    expect(el().querySelectorAll('.pe-description p').length).toBe(2);
    const venue = el().querySelector('.pe-venue') as HTMLAnchorElement;
    expect(venue.textContent).toContain('Bar Centro · Av. Larco 123');
    expect(venue.textContent).toContain('Cómo llegar');
    expect(venue.href).toContain('google.com/maps');
  });

  it('C2: autocompletado y sin autofocus al cargar', () => {
    load();
    const name = el().querySelector('#pe-name') as HTMLInputElement;
    expect(name.hasAttribute('autofocus')).toBe(false);
    expect(name.getAttribute('autocomplete')).toBe('name');
    expect(el().querySelector('#pe-email')!.getAttribute('autocomplete')).toBe('email');
    expect(el().querySelector('#pe-phone')!.getAttribute('autocomplete')).toBe('tel');
    expect(document.activeElement).not.toBe(name);
  });

  it('C5: con precio el botón dice reservar y avisa del pago en el local', () => {
    load(30);
    expect(el().querySelector('.pe-cta-btn')!.textContent).toContain('Reservar entrada · S/ 30');
    expect(el().querySelector('.pe-pay-note')!.textContent).toContain('se paga en el local');
    expect(el().textContent).not.toContain('Comprar');
  });

  it('C4: con la entrada guardada ve "Ya estás registrado" sin registrarse', () => {
    saveTicket('e1', { ticketCode: 'ABC123', name: 'Ana', email: 'ana@mail.com' });
    load();
    expect(fixture.componentInstance.registered()).toBe(true);
    expect(fixture.componentInstance.returning()).toBe(true);
    expect(fixture.componentInstance.registration()!.ticketCode).toBe('ABC123');
  });

  it('C4: "Registrar a otra persona" olvida la entrada', () => {
    saveTicket('e1', { ticketCode: 'ABC123', name: 'Ana', email: 'ana@mail.com' });
    load();
    fixture.componentInstance.registerAnother();
    expect(localStorage.getItem('maya.ticket.e1')).toBeNull();
    expect(fixture.componentInstance.registered()).toBe(false);
  });
});
