import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CampaignsApiService } from './campaigns-api.service';
import { environment } from '../../../environments/environment';
import { CampaignPayload } from '../../shared/models/campaign.model';

const BASE = environment.apiUrl;

describe('CampaignsApiService', () => {
  let service: CampaignsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CampaignsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getCampaigns hace GET /campaigns', () => {
    service.getCampaigns().subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createCampaign hace POST /campaigns con el body', () => {
    const body: CampaignPayload = {
      name: 'Promo', type: 'email', subject: 'Hola', body: 'Texto',
      targeting: 'tags', recipientTags: ['VIP'], listIds: [],
    };
    service.createCampaign(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateCampaign hace PATCH /campaigns/:id con el body', () => {
    const body: CampaignPayload = {
      name: 'Editada', type: 'whatsapp', waProvider: 'waha', body: 'Msg',
      targeting: 'all', recipientTags: [], listIds: [],
    };
    service.updateCampaign('c-1', body).subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/c-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('deleteCampaign hace DELETE /campaigns/:id', () => {
    service.deleteCampaign('c-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/c-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('sendCampaign hace POST /campaigns/:id/send con body vacío', () => {
    service.sendCampaign('c-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/c-1/send`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('resendCampaign hace POST /campaigns/:id/resend con body vacío', () => {
    service.resendCampaign('c-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/c-1/resend`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });

  it('getEstimate hace GET /campaigns/:id/estimate', () => {
    service.getEstimate('c-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/c-1/estimate`);
    expect(req.request.method).toBe('GET');
    req.flush({ recipientCount: 10, estimatedMinutes: 5, dailyLimit: 50, sentToday: 0, remaining: 50 });
  });

  it('previewCount sin tags hace GET /campaigns/preview sin params', () => {
    service.previewCount().subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/campaigns/preview`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ count: 3 });
  });

  it('previewCount con tags vacíos no envía el param', () => {
    service.previewCount([]).subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/campaigns/preview`);
    expect(req.request.params.has('tags')).toBe(false);
    req.flush({ count: 0 });
  });

  it('previewCount con tags los envía unidos por coma', () => {
    service.previewCount(['VIP', 'Fiel']).subscribe();
    const req = httpMock.expectOne(r => r.url === `${BASE}/campaigns/preview`);
    expect(req.request.params.get('tags')).toBe('VIP,Fiel');
    req.flush({ count: 7 });
  });

  it('generateEmail hace POST /campaigns/generate-email con topic y tone', () => {
    service.generateEmail('Promo verano', 'amigable').subscribe();
    const req = httpMock.expectOne(`${BASE}/campaigns/generate-email`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ topic: 'Promo verano', tone: 'amigable' });
    req.flush({ subject: 's', body: 'b' });
  });

  it('getLists hace GET /lists', () => {
    service.getLists().subscribe();
    const req = httpMock.expectOne(`${BASE}/lists`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

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

  it('upload hace POST /upload?folder=campaigns con FormData que contiene el archivo', () => {
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    service.upload(file).subscribe();
    const req = httpMock.expectOne(`${BASE}/upload?folder=campaigns`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({ url: 'https://cdn/x.png' });
  });

  it('upload con filename adjunta el blob con ese nombre', () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    service.upload(blob, 'audio-1.webm').subscribe();
    const req = httpMock.expectOne(`${BASE}/upload?folder=campaigns`);
    const sent = (req.request.body as FormData).get('file') as File;
    expect(sent.name).toBe('audio-1.webm');
    req.flush({ url: 'https://cdn/a.webm' });
  });
});
