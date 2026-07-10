import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CampaignEditorComponent } from './campaign-editor';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { Campaign, CampaignPayload, WaTemplate } from '../../shared/models/campaign.model';

const mockApi = {
  previewCount: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getTemplates: vi.fn(),
  syncTemplates: vi.fn(),
  generateEmail: vi.fn(),
  upload: vi.fn(),
};
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
        { provide: CampaignsApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmService, useValue: mockConfirm },
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
