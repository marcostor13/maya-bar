import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventsApiService } from './events-api.service';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

describe('EventsApiService', () => {
  let service: EventsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getLocals hace GET /locals', () => {
    service.getLocals().subscribe();
    const req = httpMock.expectOne(`${BASE}/locals`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getEvents hace GET /events con param localId', () => {
    service.getEvents('loc-1').subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/events`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('localId')).toBe('loc-1');
    req.flush([]);
  });

  it('getEvent hace GET /events/:id', () => {
    service.getEvent('ev-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('createEvent hace POST /events con el body', () => {
    const body = { title: 'Fiesta', localId: 'loc-1', price: 10 };
    service.createEvent(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateEvent hace PATCH /events/:id con el body', () => {
    const body = { title: 'Editado', status: 'published' };
    service.updateEvent('ev-1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('deleteEvent hace DELETE /events/:id', () => {
    service.deleteEvent('ev-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getRegistrations envía sortBy/sortOrder y omite status/search cuando no aplican', () => {
    service.getRegistrations('ev-1', { sortBy: 'createdAt', sortOrder: 'desc' }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/events/ev-1/registrations`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('sortBy')).toBe('createdAt');
    expect(req.request.params.get('sortOrder')).toBe('desc');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('search')).toBe(false);
    req.flush([]);
  });

  it('getRegistrations incluye status y search cuando se pasan', () => {
    service.getRegistrations('ev-1', {
      sortBy: 'name', sortOrder: 'asc', status: 'confirmed', search: 'ana',
    }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/events/ev-1/registrations`);
    expect(req.request.params.get('status')).toBe('confirmed');
    expect(req.request.params.get('search')).toBe('ana');
    req.flush([]);
  });

  it('checkIn hace PATCH .../registrations/:regId/check-in con body vacío', () => {
    service.checkIn('ev-1', 'reg-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1/registrations/reg-1/check-in`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('checkInByCode hace PATCH .../check-in/by-code con { code }', () => {
    service.checkInByCode('ev-1', 'TCK-99').subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1/registrations/check-in/by-code`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ code: 'TCK-99' });
    req.flush({});
  });

  it('getImpulsadores hace GET /events/:id/impulsadores', () => {
    service.getImpulsadores('ev-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1/impulsadores`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('shareEvent hace PATCH /events/:id/share con { sharedWith }', () => {
    service.shareEvent('ev-1', ['u1', 'u2']).subscribe();
    const req = httpMock.expectOne(`${BASE}/events/ev-1/share`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ sharedWith: ['u1', 'u2'] });
    req.flush({ sharedWith: ['u1', 'u2'] });
  });

  it('createExternalImpulsador hace POST /impulsadores/external con el body', () => {
    const body = { name: 'Juan', phone: '+51999', email: 'j@x.com' };
    service.createExternalImpulsador(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/impulsadores/external`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ _id: '1', name: 'Juan', code: 'ABC' });
  });

  it('deleteExternalImpulsador hace DELETE /impulsadores/external/:id', () => {
    service.deleteExternalImpulsador('imp-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/impulsadores/external/imp-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('runAI mapea cada herramienta a su endpoint con body vacío', () => {
    const cases = [
      ['copy', 'generate-copy'],
      ['social', 'generate-social'],
      ['hashtags', 'generate-hashtags'],
      ['email', 'generate-email'],
    ] as const;
    for (const [tool, endpoint] of cases) {
      service.runAI('ev-1', tool).subscribe();
      const req = httpMock.expectOne(`${BASE}/events/ev-1/${endpoint}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});
    }
  });

  it('upload hace POST /upload?folder=events con FormData que contiene el archivo', () => {
    const file = new File(['contenido'], 'foto.png', { type: 'image/png' });
    service.upload(file).subscribe();
    const req = httpMock.expectOne(`${BASE}/upload?folder=events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({ url: 'u', key: 'k', contentType: 'image/png', size: 9 });
  });

  it('upload acepta un folder personalizado', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    service.upload(file, 'docs').subscribe();
    const req = httpMock.expectOne(`${BASE}/upload?folder=docs`);
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'u', key: 'k', contentType: 'application/pdf', size: 1 });
  });
});
