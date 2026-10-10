import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContactImportApiService, ImportOptions, MongoConnection } from './contact-import-api.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/customers/import`;

const options: ImportOptions = {
  mapping: { name: 'Nombre', phone: 'Celular' }, dedupeBy: 'phone', tags: ['Importado'],
  updateExisting: true, keepUnmapped: false, customFields: ['Ciudad'],
};
const conn: MongoConnection = { uri: 'mongodb://h/db', database: 'crm', collection: 'clientes', filter: { activo: true } };

describe('ContactImportApiService', () => {
  let service: ContactImportApiService;
  let httpMock: HttpTestingController;
  const file = new File(['nombre,celular'], 'clientes.csv', { type: 'text/csv' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ContactImportApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('analyzeFile hace POST /customers/import/file/analyze con el archivo en FormData', () => {
    service.analyzeFile(file).subscribe();
    const req = httpMock.expectOne(`${BASE}/file/analyze`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body instanceof FormData).toBe(true);
    expect((body.get('file') as File).name).toBe('clientes.csv');
    expect(body.has('options')).toBe(false);
    req.flush({ columns: [], samples: {}, totalRows: 0, suggested: {} });
  });

  it('importFile hace POST /customers/import/file con el archivo y las opciones en JSON', () => {
    service.importFile(file, options).subscribe();
    const req = httpMock.expectOne(`${BASE}/file`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect((body.get('file') as File).name).toBe('clientes.csv');
    expect(JSON.parse(body.get('options') as string)).toEqual(options);
    req.flush({ total: 1, imported: 1, updated: 0, skipped: 0, errors: [] });
  });

  it('analyzeMongo hace POST /customers/import/mongo/analyze con la conexión', () => {
    service.analyzeMongo(conn).subscribe();
    const req = httpMock.expectOne(`${BASE}/mongo/analyze`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(conn);
    req.flush({ columns: [], samples: {}, totalRows: 0, suggested: {} });
  });

  it('importMongo hace POST /customers/import/mongo con conexión, opciones y saveAs', () => {
    const body = { ...conn, options, saveAs: 'ERP' };
    service.importMongo(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/mongo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ total: 0, imported: 0, updated: 0, skipped: 0, errors: [] });
  });

  it('listSources hace GET /customers/import/sources', () => {
    service.listSources().subscribe();
    const req = httpMock.expectOne(`${BASE}/sources`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('runSource hace POST /customers/import/sources/:id/run con body vacío', () => {
    service.runSource('s1').subscribe();
    const req = httpMock.expectOne(`${BASE}/sources/s1/run`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ total: 0, imported: 0, updated: 0, skipped: 0, errors: [] });
  });

  it('deleteSource hace DELETE /customers/import/sources/:id', () => {
    service.deleteSource('s1').subscribe();
    const req = httpMock.expectOne(`${BASE}/sources/s1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
