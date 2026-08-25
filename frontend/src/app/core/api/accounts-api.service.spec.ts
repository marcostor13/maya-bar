import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountsApiService } from './accounts-api.service';
import { environment } from '../../../environments/environment';
import { blankIgAccount, blankWaAccount } from '../../shared/models/accounts.model';

const BASE = environment.apiUrl;

describe('AccountsApiService', () => {
  let service: AccountsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── Configuración ────────────────────────────────────────────────────────

  it('getSettings hace GET /settings', () => {
    service.getSettings().subscribe();
    const req = httpMock.expectOne(`${BASE}/settings`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('updateSettings hace PUT /settings con el body', () => {
    const body = { waDailyLimit: 80, openaiApiKey: 'sk-x' };
    service.updateSettings(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  // ── Cuentas WhatsApp ─────────────────────────────────────────────────────

  it('getWaAccounts hace GET /whatsapp-accounts', () => {
    service.getWaAccounts().subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createWaAccount hace POST /whatsapp-accounts con el body', () => {
    const { _id, ...body } = blankWaAccount();
    service.createWaAccount(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateWaAccount hace PATCH /whatsapp-accounts/:id con el body', () => {
    const { _id, ...body } = blankWaAccount();
    service.updateWaAccount('wa-1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('deleteWaAccount hace DELETE /whatsapp-accounts/:id', () => {
    service.deleteWaAccount('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('setDefaultWaAccount hace PATCH /whatsapp-accounts/:id/default con body vacío', () => {
    service.setDefaultWaAccount('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/default`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('configureWaWebhook hace POST /whatsapp-accounts/:id/webhook con body vacío', () => {
    service.configureWaWebhook('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/webhook`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, message: 'ok' });
  });

  it('getWaStatus hace GET /whatsapp-accounts/:id/status', () => {
    service.getWaStatus('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/status`);
    expect(req.request.method).toBe('GET');
    req.flush({ connected: true });
  });

  it('getWaQr hace GET /whatsapp-accounts/:id/qr', () => {
    service.getWaQr('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/qr`);
    expect(req.request.method).toBe('GET');
    req.flush({ qrcode: 'abc' });
  });

  it('testWaAccount hace POST /whatsapp-accounts/:id/test con { phone }', () => {
    service.testWaAccount('wa-1', '51999').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ phone: '51999' });
    req.flush({ success: true, formattedPhone: '51999' });
  });

  it('refreshWaToken hace POST /whatsapp-accounts/:id/oauth/refresh con body vacío', () => {
    service.refreshWaToken('wa-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/wa-1/oauth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, tokenExpiresAt: '2026-08-01' });
  });

  it('getWaOauthConfig hace GET /whatsapp-accounts/oauth/config', () => {
    service.getWaOauthConfig().subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/oauth/config`);
    expect(req.request.method).toBe('GET');
    req.flush({ appId: 'a', configId: 'c' });
  });

  it('connectWaOauth hace POST /whatsapp-accounts/oauth/connect con el payload', () => {
    const body = { code: 'code-1', wabaId: 'waba-1', phoneNumberId: 'pn-1' };
    service.connectWaOauth(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/whatsapp-accounts/oauth/connect`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('waWebhookUrl construye la URL según el provider', () => {
    expect(service.waWebhookUrl({ _id: 'wa-1', provider: 'waha' })).toBe(`${BASE}/wa/webhook/waha/wa-1`);
    expect(service.waWebhookUrl({ _id: 'wa-2', provider: 'cloudapi' })).toBe(`${BASE}/wa/webhook/cloud/wa-2`);
  });

  // ── Cuentas Instagram ────────────────────────────────────────────────────

  it('getIgAccounts hace GET /instagram-accounts', () => {
    service.getIgAccounts().subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createIgAccount hace POST /instagram-accounts con el body', () => {
    const { _id, ...body } = blankIgAccount();
    service.createIgAccount(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateIgAccount hace PATCH /instagram-accounts/:id con el body', () => {
    const { _id, ...body } = blankIgAccount();
    service.updateIgAccount('ig-1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/ig-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('deleteIgAccount hace DELETE /instagram-accounts/:id', () => {
    service.deleteIgAccount('ig-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/ig-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getIgStatus hace GET /instagram-accounts/:id/status', () => {
    service.getIgStatus('ig-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/ig-1/status`);
    expect(req.request.method).toBe('GET');
    req.flush({ connected: true, username: 'bar' });
  });

  it('startIgOauth hace GET /instagram-accounts/oauth/start', () => {
    service.startIgOauth().subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/oauth/start`);
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://instagram.com/oauth' });
  });

  it('refreshIgToken hace POST /instagram-accounts/:id/oauth/refresh con body vacío', () => {
    service.refreshIgToken('ig-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/ig-1/oauth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, tokenExpiresAt: '2026-08-01' });
  });

  it('subscribeIgWebhook hace POST /instagram-accounts/:id/subscribe con body vacío', () => {
    service.subscribeIgWebhook('ig-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/instagram-accounts/ig-1/subscribe`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, message: 'ok' });
  });

  it('igWebhookUrl devuelve la URL única del webhook de la app', () => {
    expect(service.igWebhookUrl()).toBe(`${BASE}/ig/webhook`);
  });

  // ── Plantillas ───────────────────────────────────────────────────────────

  it('getTemplates hace GET /settings/templates', () => {
    service.getTemplates().subscribe();
    const req = httpMock.expectOne(`${BASE}/settings/templates`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('syncTemplates hace POST /settings/templates/sync con body vacío', () => {
    service.syncTemplates().subscribe();
    const req = httpMock.expectOne(`${BASE}/settings/templates/sync`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush([]);
  });

  it('createTemplate hace POST /settings/templates con el dto', () => {
    const dto = { name: 'promo', category: 'MARKETING' as const, language: 'es', body: 'Hola {{1}}' };
    service.createTemplate(dto).subscribe();
    const req = httpMock.expectOne(`${BASE}/settings/templates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({});
  });

  it('deleteTemplate hace DELETE /settings/templates/:id', () => {
    service.deleteTemplate('tpl-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/settings/templates/tpl-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
