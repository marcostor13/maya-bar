import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivityInput, ContactCareApiService } from './contact-care-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/customers`;

describe('ContactCareApiService', () => {
  let service: ContactCareApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ContactCareApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('owners hace GET /customers/owners', () => {
    service.owners().subscribe();
    const req = httpMock.expectOne(`${BASE}/owners`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('claim hace PATCH /customers/:id/claim con body vacío', () => {
    service.claim('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/claim`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('assign hace PATCH /customers/:id/assign con toUserId y note', () => {
    service.assign('c1', 'u2', 'te lo paso').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/assign`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ toUserId: 'u2', note: 'te lo paso' });
    req.flush({});
  });

  it('assign sin nota manda solo el destino', () => {
    service.assign('c1', 'u2').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/assign`);
    expect(req.request.body.toUserId).toBe('u2');
    expect(req.request.body.note).toBeUndefined();
    req.flush({});
  });

  it('release hace PATCH /customers/:id/release con note', () => {
    service.release('c1', 'no es mi zona').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/release`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ note: 'no es mi zona' });
    req.flush({});
  });

  it('bulkAssign hace POST /customers/bulk/assign con customerIds y toUserId', () => {
    service.bulkAssign(['c1', 'c2'], 'u2').subscribe();
    const req = httpMock.expectOne(`${BASE}/bulk/assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ customerIds: ['c1', 'c2'], toUserId: 'u2' });
    req.flush({ updated: 2, skipped: 0 });
  });

  it('bulkTags hace POST /customers/bulk/tags con customerIds, add y remove', () => {
    service.bulkTags(['c1'], ['VIP'], ['Nuevo']).subscribe();
    const req = httpMock.expectOne(`${BASE}/bulk/tags`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ customerIds: ['c1'], add: ['VIP'], remove: ['Nuevo'] });
    req.flush({ updated: 1 });
  });

  it('timeline hace GET /customers/:id/timeline', () => {
    service.timeline('c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/timeline`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('addActivity hace POST /customers/:id/activities con el body', () => {
    const body: ActivityInput = { type: 'call', title: 'Llamada', body: 'No contestó', at: '2026-10-01T10:00:00Z' };
    service.addActivity('c1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/activities`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateActivity hace PATCH /customers/:id/activities/:activityId con el body', () => {
    service.updateActivity('c1', 'a1', { title: 'Corregida' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/activities/a1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Corregida' });
    req.flush({});
  });

  it('deleteActivity hace DELETE /customers/:id/activities/:activityId', () => {
    service.deleteActivity('c1', 'a1').subscribe();
    const req = httpMock.expectOne(`${BASE}/c1/activities/a1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
