import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SmsApiService } from './sms-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/sms`;

describe('SmsApiService', () => {
  let service: SmsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SmsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getConfig hace GET /sms/config', () => {
    service.getConfig().subscribe();
    const req = httpMock.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('saveConfig hace PUT /sms/config con el body', () => {
    const body = { url: 'https://sms.proveedor.pe/send', method: 'POST', bodyType: 'json' };
    service.saveConfig(body as never).subscribe();
    const req = httpMock.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('test hace POST /sms/test con { to, message }', () => {
    service.test('51999888777', 'Hola').subscribe();
    const req = httpMock.expectOne(`${BASE}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ to: '51999888777', message: 'Hola' });
    req.flush({});
  });
});
