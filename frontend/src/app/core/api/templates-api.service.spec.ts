import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EmailTemplateInput, MessageTemplateInput, TemplatesApiService } from './templates-api.service';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

describe('TemplatesApiService', () => {
  let service: TemplatesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TemplatesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('plantillas de mensaje', () => {
    const input: MessageTemplateInput = { name: 'Bienvenida', channel: 'sms', body: 'Hola {nombre}' };

    it('variables hace GET /message-templates/variables', () => {
      service.variables().subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates/variables`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('messageTemplates sin canal hace GET /message-templates sin params', () => {
      service.messageTemplates().subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/message-templates`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([]);
    });

    it('messageTemplates con canal lo manda en ?channel=', () => {
      service.messageTemplates('whatsapp').subscribe();
      const req = httpMock.expectOne((r) => r.url === `${BASE}/message-templates`);
      expect(req.request.params.get('channel')).toBe('whatsapp');
      req.flush([]);
    });

    it('createMessageTemplate hace POST /message-templates con el body', () => {
      service.createMessageTemplate(input).subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      req.flush({});
    });

    it('updateMessageTemplate hace PATCH /message-templates/:id con el body', () => {
      service.updateMessageTemplate('m1', { body: 'Nuevo' }).subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates/m1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ body: 'Nuevo' });
      req.flush({});
    });

    it('deleteMessageTemplate hace DELETE /message-templates/:id', () => {
      service.deleteMessageTemplate('m1').subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates/m1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('previewMessage hace POST /message-templates/preview con body, subject y customerId', () => {
      service.previewMessage('Hola {nombre}', 'Asunto', 'c1').subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates/preview`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ body: 'Hola {nombre}', subject: 'Asunto', customerId: 'c1' });
      req.flush({});
    });

    it('previewMessage solo con el texto no inventa asunto ni contacto', () => {
      service.previewMessage('Hola').subscribe();
      const req = httpMock.expectOne(`${BASE}/message-templates/preview`);
      expect(req.request.body.body).toBe('Hola');
      expect(req.request.body.subject).toBeUndefined();
      expect(req.request.body.customerId).toBeUndefined();
      req.flush({});
    });
  });

  describe('plantillas de email', () => {
    const input: EmailTemplateInput = {
      name: 'Promo', subject: 'Oferta', preheader: 'Solo hoy', mode: 'html', html: '<p>Hola</p>',
    };

    it('emailTemplates hace GET /email-templates', () => {
      service.emailTemplates().subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('emailTemplate hace GET /email-templates/:id', () => {
      service.emailTemplate('e1').subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/e1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });

    it('createEmailTemplate hace POST /email-templates con el body', () => {
      service.createEmailTemplate(input).subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(input);
      req.flush({});
    });

    it('updateEmailTemplate hace PATCH /email-templates/:id con el body', () => {
      service.updateEmailTemplate('e1', { subject: 'Otra' }).subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/e1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ subject: 'Otra' });
      req.flush({});
    });

    it('duplicateEmailTemplate hace POST /email-templates/:id/duplicate con body vacío', () => {
      service.duplicateEmailTemplate('e1').subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/e1/duplicate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('deleteEmailTemplate hace DELETE /email-templates/:id', () => {
      service.deleteEmailTemplate('e1').subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/e1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('generateEmail hace POST /email-templates/generate con el brief', () => {
      const body = { brief: 'Promo de verano', tone: 'cercano', goal: 'ventas', ctaUrl: 'https://maya.pe', brandColor: '#FF5A5F' };
      service.generateEmail(body).subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/generate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });

    it('testSenders hace GET /email-templates/test-senders', () => {
      service.testSenders().subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/test-senders`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('sendTestEmail hace POST /email-templates/test con destinatario, asunto, html y buzón', () => {
      service.sendTestEmail('ana@x.pe', 'Prueba', '<p>Hola</p>', 'acc-1').subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/test`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ to: 'ana@x.pe', subject: 'Prueba', html: '<p>Hola</p>', accountId: 'acc-1' });
      req.flush(null);
    });

    it('sendTestEmail sin buzón no manda accountId', () => {
      service.sendTestEmail('ana@x.pe', 'Prueba', '<p>Hola</p>').subscribe();
      const req = httpMock.expectOne(`${BASE}/email-templates/test`);
      expect(req.request.body.accountId).toBeUndefined();
      req.flush(null);
    });

    it('uploadImage hace POST /upload?folder=email-templates con el archivo en FormData', () => {
      const file = new File(['x'], 'banner.png', { type: 'image/png' });
      service.uploadImage(file).subscribe();
      const req = httpMock.expectOne(`${BASE}/upload?folder=email-templates`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      expect(((req.request.body as FormData).get('file') as File).name).toBe('banner.png');
      req.flush({ url: 'https://cdn/banner.png' });
    });
  });
});
