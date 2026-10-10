import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RecoveryApiService } from './recovery-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/recovery`;

describe('RecoveryApiService', () => {
  let service: RecoveryApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RecoveryApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list hace GET /recovery', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('get hace GET /recovery/:id', () => {
    service.get('r1').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('create hace POST /recovery con el body', () => {
    const body = { lookbackDays: 90, context: 'Restaurante', timezone: 'America/Lima', name: 'Octubre' };
    service.create(body).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('reanalyze hace POST /recovery/:id/reanalyze con el body', () => {
    const body = { lookbackDays: 60, context: 'Bar' };
    service.reanalyze('r1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/reanalyze`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('update hace PATCH /recovery/:id con el body', () => {
    service.update('r1', { name: 'Nuevo nombre' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/r1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Nuevo nombre' });
    req.flush({});
  });

  it('rewrite hace POST /recovery/:id/segments/:key/rewrite con { instruction }', () => {
    service.rewrite('r1', 'inactivos', 'más corto').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/segments/inactivos/rewrite`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ instruction: 'más corto' });
    req.flush({ requestedAt: '2026-10-01' });
  });

  it('submitTemplates hace POST /recovery/:id/templates con body vacío', () => {
    service.submitTemplates('r1').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/templates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('refreshTemplates hace POST /recovery/:id/templates/refresh con body vacío', () => {
    service.refreshTemplates('r1').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/templates/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('schedule hace PUT /recovery/:id/schedule con { segments }', () => {
    const segments = [{ key: 'inactivos', sendAt: '2026-10-10T15:00:00Z' }];
    service.schedule('r1', segments as never).subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/schedule`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ segments });
    req.flush({});
  });

  it('cancel hace POST /recovery/:id/cancel con body vacío', () => {
    service.cancel('r1').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('remove hace DELETE /recovery/:id', () => {
    service.remove('r1').subscribe();
    const req = httpMock.expectOne(`${BASE}/r1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
