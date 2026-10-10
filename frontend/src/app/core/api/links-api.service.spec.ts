import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BatchInput, LinkInput, LinksApiService, saveBlob } from './links-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/links`;

describe('LinksApiService', () => {
  let service: LinksApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LinksApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('links', () => {
    it('list sin búsqueda hace GET /links sin params', () => {
      service.list().subscribe();
      const req = httpMock.expectOne((r) => r.url === BASE);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('list con búsqueda la manda en ?search=', () => {
      service.list('promo').subscribe();
      const req = httpMock.expectOne((r) => r.url === BASE);
      expect(req.request.params.get('search')).toBe('promo');
      req.flush([]);
    });

    it('get hace GET /links/:id', () => {
      service.get('k1').subscribe();
      const req = httpMock.expectOne(`${BASE}/k1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('create hace POST /links con el body', () => {
      const body: LinkInput = {
        destination: 'https://maya.pe/promo', title: 'Promo', alias: 'promo', domain: 'go.maya.pe',
        utm: { source: 'sms', campaign: 'oct' }, expiresAt: '2026-12-31',
      };
      service.create(body).subscribe();
      const req = httpMock.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('update hace PATCH /links/:id con el body (también para pausar)', () => {
      service.update('k1', { status: 'paused' }).subscribe();
      const req = httpMock.expectOne(`${BASE}/k1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'paused' });
      req.flush({});
    });

    it('remove hace DELETE /links/:id', () => {
      service.remove('k1').subscribe();
      const req = httpMock.expectOne(`${BASE}/k1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('analítica', () => {
    it('stats hace GET /links/stats con la zona horaria y solo los filtros con valor', () => {
      service.stats({ linkId: 'k1', from: '2026-10-01', to: '', batchId: undefined }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/stats`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().sort()).toEqual(['from', 'linkId', 'tz']);
      expect(req.request.params.get('linkId')).toBe('k1');
      expect(req.request.params.get('from')).toBe('2026-10-01');
      expect(req.request.params.get('tz')).toBeTruthy();
      req.flush({});
    });

    it('stats sin filtros manda solo tz', () => {
      service.stats({}).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/stats`);
      expect(req.request.params.keys()).toEqual(['tz']);
      req.flush({});
    });

    it('exportClicks hace GET /links/clicks.csv como blob con el filtro', () => {
      service.exportClicks({ batchId: 'b1' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/clicks.csv`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.params.keys()).toEqual(['batchId']);
      expect(req.request.params.get('batchId')).toBe('b1');
      req.flush(new Blob(['a,b']));
    });

    it('exportClicks por link manda linkId', () => {
      service.exportClicks({ linkId: 'k1' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/clicks.csv`);
      expect(req.request.params.get('linkId')).toBe('k1');
      expect(req.request.params.has('batchId')).toBe(false);
      req.flush(new Blob(['']));
    });
  });

  describe('dominios', () => {
    it('domains hace GET /links/domains', () => {
      service.domains().subscribe();
      const req = httpMock.expectOne(`${BASE}/domains`);
      expect(req.request.method).toBe('GET');
      req.flush({ serverIp: '1.2.3.4', platformBase: '', selfService: true, domains: [] });
    });

    it('addDomain hace POST /links/domains con { domain }', () => {
      service.addDomain('go.maya.pe').subscribe();
      const req = httpMock.expectOne(`${BASE}/domains`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ domain: 'go.maya.pe' });
      req.flush({});
    });

    it('verifyDomain hace POST /links/domains/:id/verify con body vacío', () => {
      service.verifyDomain('d1').subscribe();
      const req = httpMock.expectOne(`${BASE}/domains/d1/verify`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('setDefaultDomain hace PATCH /links/domains/:id/default con body vacío', () => {
      service.setDefaultDomain('d1').subscribe();
      const req = httpMock.expectOne(`${BASE}/domains/d1/default`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('removeDomain hace DELETE /links/domains/:id', () => {
      service.removeDomain('d1').subscribe();
      const req = httpMock.expectOne(`${BASE}/domains/d1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('lotes', () => {
    it('batches hace GET /links/batches', () => {
      service.batches().subscribe();
      const req = httpMock.expectOne(`${BASE}/batches`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('parseFile hace POST /links/batches/parse con el archivo en FormData', () => {
      const file = new File(['nombre,telefono'], 'contactos.csv', { type: 'text/csv' });
      service.parseFile(file).subscribe();
      const req = httpMock.expectOne(`${BASE}/batches/parse`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      expect(((req.request.body as FormData).get('file') as File).name).toBe('contactos.csv');
      req.flush({ columns: [], total: 0, rows: [] });
    });

    it('createBatch hace POST /links/batches con el body', () => {
      const body: BatchInput = {
        name: 'Octubre', destination: 'https://maya.pe', channel: 'sms', message: 'Hola {nombre}',
        listIds: ['l1'], customerIds: [], rows: [{ name: 'Ana', phone: '51999' }],
      };
      service.createBatch(body).subscribe();
      const req = httpMock.expectOne(`${BASE}/batches`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('batch hace GET /links/batches/:id', () => {
      service.batch('b1').subscribe();
      const req = httpMock.expectOne(`${BASE}/batches/b1`);
      expect(req.request.method).toBe('GET');
      req.flush({ batch: {}, rows: [] });
    });

    it('exportBatch hace GET /links/batches/:id/export.csv como blob', () => {
      service.exportBatch('b1').subscribe();
      const req = httpMock.expectOne(`${BASE}/batches/b1/export.csv`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['']));
    });

    it('removeBatch hace DELETE /links/batches/:id', () => {
      service.removeBatch('b1').subscribe();
      const req = httpMock.expectOne(`${BASE}/batches/b1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});

describe('saveBlob', () => {
  it('descarga el blob con el nombre dado y libera la URL', () => {
    const create = vi.fn().mockReturnValue('blob:fake');
    const revoke = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    let downloaded: { href: string; download: string; attached: boolean } | null = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = { href: this.href, download: this.download, attached: document.body.contains(this) };
    });
    const blob = new Blob(['a,b']);
    try {
      saveBlob(blob, 'clics.csv');
      expect(create).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      expect(downloaded).toEqual({ href: 'blob:fake', download: 'clics.csv', attached: true });
      expect(revoke).toHaveBeenCalledWith('blob:fake');
      expect(document.body.querySelector('a[download="clics.csv"]')).toBeNull();
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});
