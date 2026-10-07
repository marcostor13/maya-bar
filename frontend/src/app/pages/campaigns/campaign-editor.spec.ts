import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { CampaignEditorComponent } from './campaign-editor';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { TemplatesApiService } from '../../core/api/templates-api.service';
import { EmailAccountsApiService } from '../../core/api/email-accounts-api.service';
import { Campaign, CampaignPayload, WaTemplate } from '../../shared/models/campaign.model';

const mockApi = {
  previewCount: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getTemplates: vi.fn(),
  syncTemplates: vi.fn(),
  generateEmail: vi.fn(),
  upload: vi.fn(),
  audiencePreview: vi.fn(),
  smsStatus: vi.fn(),
  getShortDomains: vi.fn(),
  getContacts: vi.fn(),
};
const mockTemplatesApi = {
  variables: vi.fn(),
  emailTemplates: vi.fn(),
  messageTemplates: vi.fn(),
  previewMessage: vi.fn(),
  emailTemplate: vi.fn(),
};
const mockEmailAccounts = { list: vi.fn() };
const mockToast = { success: vi.fn(), error: vi.fn() };
const mockConfirm = { confirm: vi.fn().mockResolvedValue(true) };

const waTemplate: WaTemplate = {
  _id: 't1', name: 'promo_enero', category: 'MARKETING', language: 'es',
  status: 'APPROVED', body: 'Hola {{1}}, tenemos {{2}} para ti',
};

const emailCampaign: Campaign = {
  _id: 'c1', name: 'Promo', type: 'email', subject: 'Hola', body: 'Texto {nombre}',
  targeting: 'tags', recipientTags: ['VIP'], listIds: [], recipientCount: 0,
  status: 'draft', createdAt: new Date().toISOString(),
};

describe('CampaignEditorComponent', () => {
  let fixture: ComponentFixture<CampaignEditorComponent>;
  let component: CampaignEditorComponent;

  async function setup(campaign: Campaign | null = null) {
    await TestBed.configureTestingModule({
      imports: [CampaignEditorComponent],
      providers: [
        // El editor enlaza a Plantillas y Configuración.
        provideRouter([]),
        { provide: CampaignsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
        { provide: TemplatesApiService, useValue: mockTemplatesApi },
        { provide: EmailAccountsApiService, useValue: mockEmailAccounts },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('campaign', campaign);
    fixture.detectChanges(); // ngOnInit
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.previewCount.mockReturnValue(of({ count: 5 }));
    mockApi.getTemplates.mockReturnValue(of([waTemplate]));
    mockApi.createCampaign.mockReturnValue(of({} as Campaign));
    mockApi.updateCampaign.mockReturnValue(of({} as Campaign));
    mockApi.audiencePreview.mockReturnValue(of({ total: 5, reachable: 5, blocked: 0, missing: 0 }));
    mockApi.smsStatus.mockReturnValue(of({ configured: true, name: 'Proveedor', from: 'MAYA' }));
    mockApi.getShortDomains.mockReturnValue(of({ domains: [] }));
    mockApi.getContacts.mockReturnValue(of([]));
    mockTemplatesApi.variables.mockReturnValue(of([]));
    mockTemplatesApi.emailTemplates.mockReturnValue(of([{ _id: 'tpl1', name: 'Promo', subject: 'Del diseño' }]));
    mockTemplatesApi.messageTemplates.mockReturnValue(of([{ _id: 'm1', name: 'Recordatorio', channel: 'sms', body: 'Hola {nombre}' }]));
    mockTemplatesApi.previewMessage.mockReturnValue(of({ body: '', unknown: [], sms: { segments: 1, length: 0, perSegment: 160, encoding: 'GSM-7', unicodeChars: [] } }));
    mockEmailAccounts.list.mockReturnValue(of([]));
  });

  it('SMS: guarda con type sms, sin proveedor de WhatsApp ni asunto', async () => {
    await setup();
    component.form.name = 'Aviso';
    component.setChannel('sms');
    component.form.body = 'Hola {nombre}';
    component.save();

    const payload = mockApi.createCampaign.mock.calls[0][0] as CampaignPayload;
    expect(payload.type).toBe('sms');
    expect(payload.waProvider).toBeUndefined();
    expect(payload.subject).toBeUndefined();
    expect(payload.body).toBe('Hola {nombre}');
  });

  it('email con plantilla HTML no exige cuerpo y manda el id de la plantilla', async () => {
    await setup();
    component.form.name = 'Boletín';
    component.form.emailTemplateId = 'tpl1';
    component.onEmailTemplateChange();
    component.form.body = '';
    component.save();

    expect(component.form.subject).toBe('Del diseño');
    const payload = mockApi.createCampaign.mock.calls[0][0] as CampaignPayload;
    expect(payload.emailTemplateId).toBe('tpl1');
    expect(payload.body).toBe('');
  });

  it('si el mensaje usa el link corto, exige el destino', async () => {
    await setup();
    component.form.name = 'Promo';
    component.setChannel('sms');
    component.form.body = 'Mira {link}';
    component.save();
    expect(component.formError()).toContain('link corto');
    expect(mockApi.createCampaign).not.toHaveBeenCalled();

    component.form.linkUrl = 'https://tienda.com';
    component.save();
    expect((mockApi.createCampaign.mock.calls[0][0] as CampaignPayload).linkUrl).toBe('https://tienda.com');
  });

  it('con contactos elegidos a mano manda sus ids y exige al menos uno', async () => {
    await setup();
    component.form.name = 'Selectos';
    component.form.body = 'Hola';
    component.setTargeting('contacts');
    component.save();
    expect(component.formError()).toBe('Elige al menos un contacto');

    component.toggleContact('a1');
    component.save();
    const payload = mockApi.createCampaign.mock.calls[0][0] as CampaignPayload;
    expect(payload.targeting).toBe('contacts');
    expect(payload.customerIds).toEqual(['a1']);
  });

  it('el recuento de destinatarios sale del backend, según canal y audiencia', async () => {
    vi.useFakeTimers();
    await setup();
    component.setChannel('sms');
    vi.advanceTimersByTime(500);
    expect(mockApi.audiencePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'sms', targeting: 'tags' }),
    );
    expect(component.previewCount()).toBe(5);
    vi.useRealTimers();
  });

  it('exige nombre antes de guardar', async () => {
    await setup();
    component.form.body = 'Hola';
    component.save();
    expect(component.formError()).toBe('El nombre es obligatorio');
    expect(mockApi.createCampaign).not.toHaveBeenCalled();
  });

  it('exige mensaje cuando no hay plantilla', async () => {
    await setup();
    component.form.name = 'Promo';
    component.form.body = '   ';
    component.save();
    expect(component.formError()).toBe('El mensaje es obligatorio');
    expect(mockApi.createCampaign).not.toHaveBeenCalled();
  });

  it('crea campaña de email con el payload correcto y emite saved', async () => {
    await setup();
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.form.name = '  Promo Verano ';
    component.form.subject = 'Oferta';
    component.form.body = 'Hola {nombre}';
    component.form.targeting = 'tags';
    component.form.recipientTags = ['VIP'];
    component.save();

    expect(mockApi.createCampaign).toHaveBeenCalledTimes(1);
    const payload = mockApi.createCampaign.mock.calls[0][0] as CampaignPayload;
    expect(payload.name).toBe('Promo Verano');
    expect(payload.type).toBe('email');
    expect(payload.waProvider).toBeUndefined();
    expect(payload.subject).toBe('Oferta');
    expect(payload.body).toBe('Hola {nombre}');
    expect(payload.recipientTags).toEqual(['VIP']);
    expect(payload.listIds).toEqual([]);
    expect(component.formError()).toBe('');
    expect(component.saving()).toBe(false);
    expect(mockToast.success).toHaveBeenCalledWith('Campaña creada');
    expect(savedSpy).toHaveBeenCalledTimes(1);
  });

  it('edita una campaña existente con PATCH y emite saved', async () => {
    await setup(emailCampaign);
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    expect(component.form.name).toBe('Promo');
    expect(component.form.channel).toBe('email');
    component.form.name = 'Promo v2';
    component.save();

    expect(mockApi.updateCampaign).toHaveBeenCalledTimes(1);
    expect(mockApi.updateCampaign.mock.calls[0][0]).toBe('c1');
    const payload = mockApi.updateCampaign.mock.calls[0][1] as CampaignPayload;
    expect(payload.name).toBe('Promo v2');
    expect(mockApi.createCampaign).not.toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Campaña actualizada');
    expect(savedSpy).toHaveBeenCalledTimes(1);
  });

  it('cloudapi con plantilla no exige body y envía datos de plantilla', async () => {
    await setup();
    component.form.name = 'Campaña Cloud';
    component.setChannel('cloudapi');
    component.selectTemplate(waTemplate);
    component.form.templateVars = ['María', 'descuento'];
    component.form.body = '';
    component.save();

    expect(mockApi.createCampaign).toHaveBeenCalledTimes(1);
    const payload = mockApi.createCampaign.mock.calls[0][0] as CampaignPayload;
    expect(payload.type).toBe('whatsapp');
    expect(payload.waProvider).toBe('cloudapi');
    expect(payload.body).toBe('[Plantilla: promo_enero]');
    expect(payload.templateName).toBe('promo_enero');
    expect(payload.templateLanguage).toBe('es');
    expect(payload.templateVars).toEqual(['María', 'descuento']);
  });

  it('selectTemplate calcula las variables desde el body de la plantilla', async () => {
    await setup();
    component.setChannel('cloudapi');
    component.selectTemplate(waTemplate);
    expect(component.form.templateVars.length).toBe(2);
    expect(component.templateVarCount()).toBe(2);
  });

  it('muestra formError y toast cuando el guardado falla', async () => {
    mockApi.createCampaign.mockReturnValue(
      throwError(() => ({ error: { message: 'Nombre duplicado' } })),
    );
    await setup();
    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.form.name = 'Promo';
    component.form.body = 'Hola';
    component.save();

    expect(component.formError()).toBe('Nombre duplicado');
    expect(mockToast.error).toHaveBeenCalledWith('Nombre duplicado');
    expect(component.saving()).toBe(false);
    expect(savedSpy).not.toHaveBeenCalled();
  });

  it('generateEmailWithAI rellena asunto y cuerpo y vuelve a modo manual', async () => {
    mockApi.generateEmail.mockReturnValue(of({ subject: 'Asunto IA', body: 'Cuerpo IA' }));
    await setup();
    component.emailMode.set('ai');
    component.aiTopic = 'Promo de verano';
    component.aiTone = 'exclusivo';
    component.generateEmailWithAI();

    expect(mockApi.generateEmail).toHaveBeenCalledWith('Promo de verano', 'exclusivo');
    expect(component.form.subject).toBe('Asunto IA');
    expect(component.form.body).toBe('Cuerpo IA');
    expect(component.emailMode()).toBe('manual');
    expect(component.aiGenerating()).toBe(false);
  });

  it('emite closed al cancelar', async () => {
    await setup();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.close();
    expect(closedSpy).toHaveBeenCalledTimes(1);
  });

  it('al editar una campaña cloudapi carga plantillas y resuelve la seleccionada', async () => {
    const cloudCampaign: Campaign = {
      ...emailCampaign, _id: 'c2', type: 'whatsapp', waProvider: 'cloudapi',
      templateName: 'promo_enero', templateLanguage: 'es', templateVars: ['a', 'b'],
    };
    await setup(cloudCampaign);
    expect(mockApi.getTemplates).toHaveBeenCalled();
    expect(component.form.channel).toBe('cloudapi');
    expect(component.selectedTemplate()?.name).toBe('promo_enero');
  });
});
