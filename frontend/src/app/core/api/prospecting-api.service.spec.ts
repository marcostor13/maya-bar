import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProspectingApiService } from './prospecting-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/prospecting`;

describe('ProspectingApiService', () => {
  let service: ProspectingApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProspectingApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('búsquedas', () => {
    it('integrations hace GET /prospecting/integrations', () => {
      service.integrations().subscribe();
      const req = httpMock.expectOne(`${BASE}/integrations`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('searches hace GET /prospecting/searches', () => {
      service.searches().subscribe();
      const req = httpMock.expectOne(`${BASE}/searches`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('search hace GET /prospecting/searches/:id', () => {
      service.search('s1').subscribe();
      const req = httpMock.expectOne(`${BASE}/searches/s1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('createSearch hace POST /prospecting/searches con el body', () => {
      const body = { query: 'restaurantes en Lima' };
      service.createSearch(body as never).subscribe();
      const req = httpMock.expectOne(`${BASE}/searches`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('retrySearch hace POST /prospecting/searches/:id/retry con body vacío', () => {
      service.retrySearch('s1').subscribe();
      const req = httpMock.expectOne(`${BASE}/searches/s1/retry`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('removeSearch hace DELETE /prospecting/searches/:id', () => {
      service.removeSearch('s1').subscribe();
      const req = httpMock.expectOne(`${BASE}/searches/s1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('prospectos', () => {
    it('prospects sin filtro hace GET /prospecting/prospects sin params', () => {
      service.prospects().subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/prospects`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('prospects manda solo los filtros con valor', () => {
      service.prospects({ status: 'new', q: '', searchId: 's1' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/prospects`);
      expect(req.request.params.keys().sort()).toEqual(['searchId', 'status']);
      expect(req.request.params.get('status')).toBe('new');
      expect(req.request.params.get('searchId')).toBe('s1');
      req.flush([]);
    });

    it('prospect hace GET /prospecting/prospects/:id', () => {
      service.prospect('p1').subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('createProspect hace POST /prospecting/prospects con el body', () => {
      const body = { name: 'La Mar', website: 'https://lamar.pe', searchId: 's1' };
      service.createProspect(body).subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('updateProspect hace PATCH /prospecting/prospects/:id con el body', () => {
      const body = { notes: 'Llamar el lunes', tags: ['Caliente'] };
      service.updateProspect('p1', body).subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('removeProspect hace DELETE /prospecting/prospects/:id', () => {
      service.removeProspect('p1').subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('research hace POST /prospecting/prospects/research con { ids }', () => {
      service.research(['p1', 'p2']).subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/research`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ids: ['p1', 'p2'] });
      req.flush({ queued: 2 });
    });

    it('material hace POST /prospecting/prospects/:id/material con { instructions }', () => {
      service.material('p1', 'más formal').subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1/material`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ instructions: 'más formal' });
      req.flush({});
    });

    it('toCustomer hace POST /prospecting/prospects/:id/customer con { personIndex }', () => {
      service.toCustomer('p1', 0).subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1/customer`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ personIndex: 0 });
      req.flush({ prospect: {} });
    });

    it('toLead hace POST /prospecting/prospects/:id/lead con el body', () => {
      const body = { personIndex: 1, title: 'Demo', value: 1500 };
      service.toLead('p1', body).subscribe();
      const req = httpMock.expectOne(`${BASE}/prospects/p1/lead`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ prospect: {}, leadId: 'l1' });
    });
  });
});
