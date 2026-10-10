import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormPayload, FormsApiService } from './forms-api.service';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const BASE = `${API}/forms`;

const payload: FormPayload = {
  name: 'Contacto web', description: 'Landing', active: true, successMessage: '¡Gracias!',
  fields: [{ key: 'nombre', label: 'Nombre', type: 'text', required: true, options: [], mapTo: 'name' }],
  tags: ['Web'], listIds: ['l1'], redirectUrl: 'https://maya.pe/gracias',
  autoWhatsApp: { enabled: false, templateVars: [] },
  autoEmail: { enabled: true, subject: 'Hola', body: 'Gracias {nombre}' },
};

describe('FormsApiService', () => {
  let service: FormsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FormsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('publicBase apunta a /public/forms del API', () => {
    expect(service.publicBase).toBe(`${API}/public/forms`);
  });

  it('list hace GET /forms', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('create hace POST /forms con el body', () => {
    service.create(payload).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('update hace PATCH /forms/:id con el body', () => {
    service.update('f1', payload).subscribe();
    const req = httpMock.expectOne(`${BASE}/f1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('remove hace DELETE /forms/:id', () => {
    service.remove('f1').subscribe();
    const req = httpMock.expectOne(`${BASE}/f1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('regenerateKey hace POST /forms/:id/regenerate-key con body vacío', () => {
    service.regenerateKey('f1').subscribe();
    const req = httpMock.expectOne(`${BASE}/f1/regenerate-key`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('templates hace GET /whatsapp-templates', () => {
    service.templates().subscribe();
    const req = httpMock.expectOne(`${API}/whatsapp-templates`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('upload hace POST /upload?folder=forms con el archivo en FormData', () => {
    const file = new File(['x'], 'cabecera.jpg', { type: 'image/jpeg' });
    service.upload(file).subscribe();
    const req = httpMock.expectOne(`${API}/upload?folder=forms`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect(((req.request.body as FormData).get('file') as File).name).toBe('cabecera.jpg');
    req.flush({ url: 'https://cdn/cabecera.jpg' });
  });

  it('submissions hace GET /forms/:id/submissions', () => {
    service.submissions('f1').subscribe();
    const req = httpMock.expectOne(`${BASE}/f1/submissions`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
