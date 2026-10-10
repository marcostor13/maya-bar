import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmailAccountsApiService } from './email-accounts-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/email-accounts`;

describe('EmailAccountsApiService', () => {
  let service: EmailAccountsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EmailAccountsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list hace GET /email-accounts', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('providers hace GET /email-accounts/oauth/providers', () => {
    service.providers().subscribe();
    const req = httpMock.expectOne(`${BASE}/oauth/providers`);
    expect(req.request.method).toBe('GET');
    req.flush({ gmail: true, outlook: false });
  });

  it('startOAuth hace GET /email-accounts/oauth/:provider/start', () => {
    service.startOAuth('outlook').subscribe();
    const req = httpMock.expectOne(`${BASE}/oauth/outlook/start`);
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://login' });
  });

  it('create hace POST /email-accounts con el body', () => {
    const body = { label: 'Ventas', email: 'ventas@x.pe' };
    service.create(body as never).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('update hace PATCH /email-accounts/:id con el body', () => {
    service.update('a1', { active: false }).subscribe();
    const req = httpMock.expectOne(`${BASE}/a1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    req.flush({});
  });

  it('setDefault hace PATCH /email-accounts/:id/default con body vacío', () => {
    service.setDefault('a1').subscribe();
    const req = httpMock.expectOne(`${BASE}/a1/default`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('test hace POST /email-accounts/:id/test con body vacío', () => {
    service.test('a1').subscribe();
    const req = httpMock.expectOne(`${BASE}/a1/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ ok: true });
  });

  it('remove hace DELETE /email-accounts/:id', () => {
    service.remove('a1').subscribe();
    const req = httpMock.expectOne(`${BASE}/a1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
