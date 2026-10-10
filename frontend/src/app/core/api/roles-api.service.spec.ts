import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RolesApiService } from './roles-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/roles`;

describe('RolesApiService', () => {
  let service: RolesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RolesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('catalog hace GET /roles/catalog', () => {
    service.catalog().subscribe();
    const req = httpMock.expectOne(`${BASE}/catalog`);
    expect(req.request.method).toBe('GET');
    req.flush({ modules: [], actions: [] });
  });

  it('list hace GET /roles', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('update hace PATCH /roles/:key con modules y actions', () => {
    service.update('MARKETING', ['customers', 'lists'], { customers: ['create', 'edit'] }).subscribe();
    const req = httpMock.expectOne(`${BASE}/MARKETING`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ modules: ['customers', 'lists'], actions: { customers: ['create', 'edit'] } });
    req.flush({});
  });

  it('create hace POST /roles con { label }', () => {
    service.create('Ventas').subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ label: 'Ventas' });
    req.flush({});
  });

  it('remove hace DELETE /roles/:key', () => {
    service.remove('ventas').subscribe();
    const req = httpMock.expectOne(`${BASE}/ventas`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ deleted: true });
  });
});
