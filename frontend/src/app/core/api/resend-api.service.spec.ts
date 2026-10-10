import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ResendApiService } from './resend-api.service';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const BASE = `${API}/resend`;

describe('ResendApiService', () => {
  let service: ResendApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ResendApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getConfig hace GET /resend/config', () => {
    service.getConfig().subscribe();
    const req = httpMock.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('saveConfig hace PUT /resend/config con el body', () => {
    const body = { apiKey: 're_123', fromEmail: 'hola@empresa.pe', fromName: 'Empresa' };
    service.saveConfig(body as never).subscribe();
    const req = httpMock.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('test hace POST /resend/test con { to }', () => {
    service.test('ana@x.pe').subscribe();
    const req = httpMock.expectOne(`${BASE}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ to: 'ana@x.pe' });
    req.flush({ id: 'msg-1' });
  });

  it('remove hace DELETE /resend/config', () => {
    service.remove().subscribe();
    const req = httpMock.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('status hace GET /resend-status (fuera de /resend)', () => {
    service.status().subscribe();
    const req = httpMock.expectOne(`${API}/resend-status`);
    expect(req.request.method).toBe('GET');
    req.flush({ configured: true, from: 'hola@empresa.pe' });
  });
});
