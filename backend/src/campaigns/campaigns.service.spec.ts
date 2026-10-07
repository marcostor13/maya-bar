import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CampaignsService } from './campaigns.service';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';
import { Campaign } from './campaign.schema';
import { Customer } from '../customers/customer.schema';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { ListsService } from '../lists/lists.service';
import { SuppressionService } from '../suppression/suppression.service';
import { AiService } from '../ai/ai.service';
import { CampaignRecipient } from './campaign-recipient.schema';
import { CampaignSenderService } from './campaign-sender.service';
import { EmailTemplate } from '../email-templates/email-template.schema';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { SmsService } from '../sms/sms.service';
import { LinksService } from '../links/links.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  q.lean.mockReturnValue(q);
  return q;
}

function makeCampaignDoc(overrides: Partial<Record<string, unknown>> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: { toString: () => tenantId },
    name: 'Promo Verano',
    type: 'email',
    waProvider: 'waha',
    subject: 'Oferta especial',
    body: 'Hola {nombre}, tenemos una oferta',
    targeting: 'tags',
    recipientTags: [] as string[],
    listIds: [] as Types.ObjectId[],
    recipientCount: 0,
    status: 'draft',
    sentAt: undefined as Date | undefined,
    errorMessage: undefined as string | undefined,
    mediaUrl: undefined as string | undefined,
    mediaType: undefined as string | undefined,
    templateName: undefined as string | undefined,
    templateLanguage: undefined as string | undefined,
    templateVars: [] as string[],
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function makeCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'Ana',
    email: 'ana@test.com',
    phone: '+51999888777',
    ...overrides,
  };
}

function createMockModel() {
  const constructor = jest.fn();
  (constructor as any).find = jest.fn().mockReturnValue(buildQuery([]));
  (constructor as any).findById = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  (constructor as any).findByIdAndDelete = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  (constructor as any).countDocuments = jest.fn().mockResolvedValue(0);
  return constructor as any;
}

/** Flush pending microtasks/macrotasks so fire-and-forget queues finish. */
async function flushAsync(times = 10) {
  for (let i = 0; i < times; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CampaignsService', () => {
  let service: CampaignsService;
  let campaignModel: any;
  let customerModel: any;
  let recipientModel: any;
  let emailTemplateModel: any;

  const mockSender = { countStats: jest.fn() };
  const mockEmailAccounts = { findOne: jest.fn() };
  const mockSms = { requireConfig: jest.fn(), getConfig: jest.fn() };
  const mockLinks = { createPersonalLinks: jest.fn() };

  const mockMail = { sendCampaign: jest.fn() };
  const mockSettings = {
    getWaDailyLimit: jest.fn(),
    sendWhatsApp: jest.fn(),
    sendWhatsAppTemplate: jest.fn(),
  };
  const mockLists = { resolveCustomers: jest.fn() };
  const mockAi = { chat: jest.fn(), parseJson: jest.fn() };
  // Por defecto no hay nadie de baja: cada prueba que lo necesite lo cambia.
  const mockSuppression = {
    filterAllowed: jest.fn(),
    setFor: jest.fn(),
    matches: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    campaignModel = createMockModel();
    customerModel = createMockModel();
    recipientModel = createMockModel();
    recipientModel.deleteMany = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    recipientModel.updateMany = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    recipientModel.insertMany = jest.fn().mockResolvedValue([]);
    emailTemplateModel = createMockModel();
    emailTemplateModel.findOne = jest.fn().mockReturnValue(buildQuery(null));
    // Por defecto nadie está de baja (conjunto vacío).
    mockSuppression.setFor.mockResolvedValue({
      phones: new Set(),
      emails: new Set(),
      empty: true,
    });
    mockSuppression.matches.mockReturnValue(false);
    mockSms.requireConfig.mockResolvedValue({ ratePerMinute: 60 });
    mockSms.getConfig.mockResolvedValue({ ratePerMinute: 60 });
    mockLinks.createPersonalLinks.mockResolvedValue([]);

    mockMail.sendCampaign.mockResolvedValue(undefined);
    mockSettings.getWaDailyLimit.mockResolvedValue(50);
    mockSettings.sendWhatsApp.mockResolvedValue(undefined);
    mockSettings.sendWhatsAppTemplate.mockResolvedValue(undefined);
    mockLists.resolveCustomers.mockResolvedValue([]);
    mockSuppression.filterAllowed.mockImplementation(
      (_t: string, people: unknown[]) =>
        Promise.resolve({ allowed: people, blocked: 0 }),
    );

    // Sin cabecera variable: es el caso por defecto de una plantilla de texto.
    const mockTemplates = {
      resolveSendHeader: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getModelToken(Campaign.name), useValue: campaignModel },
        { provide: WhatsAppTemplatesService, useValue: mockTemplates },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: MailService, useValue: mockMail },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ListsService, useValue: mockLists },
        { provide: AiService, useValue: mockAi },
        { provide: SuppressionService, useValue: mockSuppression },
        {
          provide: getModelToken(CampaignRecipient.name),
          useValue: recipientModel,
        },
        {
          provide: getModelToken(EmailTemplate.name),
          useValue: emailTemplateModel,
        },
        { provide: CampaignSenderService, useValue: mockSender },
        { provide: EmailAccountsService, useValue: mockEmailAccounts },
        { provide: SmsService, useValue: mockSms },
        { provide: LinksService, useValue: mockLinks },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  function stubFindById(doc: unknown) {
    campaignModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(doc),
    });
  }

  function stubCustomers(customers: unknown[]) {
    customerModel.find.mockReturnValue(buildQuery(customers));
  }

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('queries by tenantId sorted by createdAt desc', async () => {
      const query = buildQuery([]);
      campaignModel.find.mockReturnValue(query);

      await service.findAll(tenantId);

      expect(campaignModel.find).toHaveBeenCalledWith(
        { tenantId: expect.any(Types.ObjectId) },
        { html: 0 },
      );
      expect(campaignModel.find.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('defaults targeting to tags and converts listIds to ObjectIds', async () => {
      const listId = new Types.ObjectId().toString();
      let captured: any;
      campaignModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(makeCampaignDoc()) };
      });

      await service.create(tenantId, {
        name: 'C1',
        type: 'email',
        body: 'hola',
        listIds: [listId],
      });

      expect(captured.targeting).toBe('tags');
      expect(captured.recipientTags).toEqual([]);
      expect(captured.tenantId).toBeInstanceOf(Types.ObjectId);
      expect(captured.tenantId.toString()).toBe(tenantId);
      expect(captured.listIds[0]).toBeInstanceOf(Types.ObjectId);
      expect(captured.listIds[0].toString()).toBe(listId);
    });

    it('respects explicit targeting', async () => {
      let captured: any;
      campaignModel.mockImplementation((data: any) => {
        captured = data;
        return { save: jest.fn().mockResolvedValue(makeCampaignDoc()) };
      });

      await service.create(tenantId, {
        name: 'C2',
        type: 'whatsapp',
        body: 'hola',
        targeting: 'all',
      });

      expect(captured.targeting).toBe('all');
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('assigns dto fields and saves', async () => {
      const doc = makeCampaignDoc();
      stubFindById(doc);

      await service.update(doc._id.toString(), tenantId, { name: 'Nuevo' });

      expect(doc.name).toBe('Nuevo');
      expect(doc.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when campaign not found', async () => {
      stubFindById(null);
      await expect(service.update('x', tenantId, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      stubFindById(makeCampaignDoc({ tenantId: { toString: () => 'other' } }));
      await expect(service.update('x', tenantId, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException while campaign is sending', async () => {
      stubFindById(makeCampaignDoc({ status: 'sending' }));
      await expect(service.update('x', tenantId, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes the campaign after ownership check', async () => {
      const doc = makeCampaignDoc();
      stubFindById(doc);

      await service.delete(doc._id.toString(), tenantId);

      expect(campaignModel.findByIdAndDelete).toHaveBeenCalledWith(
        doc._id.toString(),
      );
    });

    it('throws NotFoundException when campaign not found', async () => {
      stubFindById(null);
      await expect(service.delete('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      stubFindById(makeCampaignDoc({ tenantId: { toString: () => 'other' } }));
      await expect(service.delete('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── previewCount ───────────────────────────────────────────────────────────

  describe('lista de no contactar', () => {
    /**
     * Lo que de verdad importa: da igual cómo se segmente la campaña, quien
     * pidió no recibir comunicaciones no puede acabar recibiéndolas. Se prueba
     * con las tres formas de segmentar porque el filtro está en el punto por
     * donde pasan todas.
     */
    const bloqueada = { name: 'Harta', phone: '+51 999 888 777' };
    const permitida = { name: 'Ana', phone: '+51 911 222 333' };

    const soloPermitida = () =>
      mockSuppression.filterAllowed.mockResolvedValue({
        allowed: [permitida],
        blocked: 1,
      });

    it.each([
      ['todos', { targeting: 'all', listIds: [], recipientTags: [] }],
      ['etiquetas', { targeting: 'tags', listIds: [], recipientTags: ['vip'] }],
    ])('la excluye segmentando por %s', async (_caso, targeting) => {
      soloPermitida();
      stubCustomers([bloqueada, permitida]);
      const campaign = {
        ...targeting,
        _id: 'k1',
        tenantId: { toString: () => tenantId },
        type: 'whatsapp',
        waProvider: 'cloudapi',
        body: 'Promo',
        status: 'draft',
        // El servicio lo sobrescribe al enviar; va declarado para que el tipo
        // del literal lo incluya y el test pueda comprobarlo.
        recipientCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };
      stubFindById(campaign);

      await service.send('k1', tenantId);

      const destinatarios = mockSettings.sendWhatsApp.mock.calls.map(
        (c) => c[0],
      );
      expect(destinatarios).not.toContain(bloqueada.phone);
      expect(campaign.recipientCount).toBe(1);
    });

    it('la excluye también cuando la audiencia viene de una lista', async () => {
      soloPermitida();
      mockLists.resolveCustomers.mockResolvedValue([bloqueada, permitida]);
      const campaign = {
        _id: 'k2',
        tenantId: { toString: () => tenantId },
        targeting: 'lists',
        listIds: [{ toString: () => 'l1' }],
        recipientTags: [],
        type: 'whatsapp',
        waProvider: 'cloudapi',
        body: 'Promo',
        status: 'draft',
        recipientCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };
      stubFindById(campaign);

      await service.send('k2', tenantId);

      expect(mockSuppression.filterAllowed).toHaveBeenCalledWith(tenantId, [
        bloqueada,
        permitida,
      ]);
      expect(campaign.recipientCount).toBe(1);
    });

    it('en email queda omitido con su motivo, no pendiente de envío', async () => {
      const bloqueada = makeCustomer({
        name: 'Harta',
        email: 'harta@mail.com',
      });
      const permitida = makeCustomer({ name: 'Ana', email: 'ana@mail.com' });
      mockSuppression.matches.mockImplementation(
        (_set: unknown, c: { email?: string }) => c.email === 'harta@mail.com',
      );
      stubCustomers([bloqueada, permitida]);
      const doc = makeCampaignDoc({ targeting: 'all', type: 'email' });
      stubFindById(doc);

      await service.send(doc._id.toString(), tenantId);

      const rows = recipientModel.insertMany.mock.calls[0][0];
      expect(rows.map((r: any) => [r.to, r.status, r.error])).toEqual([
        ['harta@mail.com', 'skipped', 'En la lista de no contactar'],
        ['ana@mail.com', 'pending', undefined],
      ]);
      expect(doc.recipientCount).toBe(1);
    });
  });

  describe('previewCount', () => {
    it('filters by tags with $in when tags are provided', async () => {
      stubCustomers([{ phone: '1' }, { phone: '2' }, { phone: '3' }]);

      const result = await service.previewCount(tenantId, ['vip', 'frecuente']);

      expect(result).toEqual({ count: 3, blocked: 0 });
      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toEqual({ $in: ['vip', 'frecuente'] });
    });

    it('counts all tenant customers when no tags', async () => {
      stubCustomers(new Array(20).fill({ phone: '1' }));

      const result = await service.previewCount(tenantId, []);

      expect(result.count).toBe(20);
      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toBeUndefined();
      expect(filter.tenantId.toString()).toBe(tenantId);
    });

    it('descuenta del recuento a quien está en la lista de no contactar', async () => {
      stubCustomers([{ phone: 'a' }, { phone: 'b' }, { phone: 'c' }]);
      mockSuppression.filterAllowed.mockResolvedValue({
        allowed: [{ phone: 'a' }],
        blocked: 2,
      });

      // El número de la pantalla tiene que ser el que se enviará de verdad.
      expect(await service.previewCount(tenantId, [])).toEqual({
        count: 1,
        blocked: 2,
      });
    });
  });

  // ─── recipient resolution (via send) ────────────────────────────────────────

  describe('recipient resolution', () => {
    it('targeting=lists delegates to ListsService.resolveCustomers with string ids', async () => {
      const l1 = new Types.ObjectId();
      const l2 = new Types.ObjectId();
      const doc = makeCampaignDoc({ targeting: 'lists', listIds: [l1, l2] });
      stubFindById(doc);
      mockLists.resolveCustomers.mockResolvedValue([makeCustomer()]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockLists.resolveCustomers).toHaveBeenCalledWith(
        [l1.toString(), l2.toString()],
        tenantId,
      );
      expect(customerModel.find).not.toHaveBeenCalled();
    });

    it('targeting=lists with empty listIds falls back to tags filter', async () => {
      const doc = makeCampaignDoc({ targeting: 'lists', listIds: [] });
      stubFindById(doc);
      stubCustomers([]);

      // Sin contactos el envío se rechaza; aquí solo importa la consulta.
      await service.send(doc._id.toString(), tenantId).catch(() => undefined);

      expect(mockLists.resolveCustomers).not.toHaveBeenCalled();
      expect(customerModel.find).toHaveBeenCalled();
    });

    it('targeting=all queries every customer of the tenant', async () => {
      const doc = makeCampaignDoc({ targeting: 'all' });
      stubFindById(doc);
      stubCustomers([]);

      // Sin contactos el envío se rechaza; aquí solo importa la consulta.
      await service.send(doc._id.toString(), tenantId).catch(() => undefined);

      const filter = customerModel.find.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
    });

    it('targeting=tags filters by recipientTags with $in', async () => {
      const doc = makeCampaignDoc({
        targeting: 'tags',
        recipientTags: ['vip'],
      });
      stubFindById(doc);
      stubCustomers([]);

      // Sin contactos el envío se rechaza; aquí solo importa la consulta.
      await service.send(doc._id.toString(), tenantId).catch(() => undefined);

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toEqual({ $in: ['vip'] });
    });

    it('targeting=tags without tags targets all tenant customers', async () => {
      const doc = makeCampaignDoc({ targeting: 'tags', recipientTags: [] });
      stubFindById(doc);
      stubCustomers([]);

      // Sin contactos el envío se rechaza; aquí solo importa la consulta.
      await service.send(doc._id.toString(), tenantId).catch(() => undefined);

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toBeUndefined();
    });
  });

  // ─── send: state validations ───────────────────────────────────────────────

  describe('send state validations', () => {
    it('throws NotFoundException when campaign not found', async () => {
      stubFindById(null);
      await expect(service.send('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      stubFindById(makeCampaignDoc({ tenantId: { toString: () => 'other' } }));
      await expect(service.send('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects re-sending an already sent campaign', async () => {
      stubFindById(makeCampaignDoc({ status: 'sent' }));
      await expect(service.send('x', tenantId)).rejects.toThrow(
        'La campaña ya fue enviada',
      );
    });

    it('rejects sending a campaign already in progress', async () => {
      stubFindById(makeCampaignDoc({ status: 'sending' }));
      await expect(service.send('x', tenantId)).rejects.toThrow(
        'La campaña ya está en proceso de envío',
      );
    });
  });

  // ─── send: email ────────────────────────────────────────────────────────────

  describe('send email / sms campaign (en cola)', () => {
    it('no envía en la petición: deja a cada destinatario pendiente', async () => {
      const doc = makeCampaignDoc({ type: 'email', subject: 'Oferta' });
      stubFindById(doc);
      const ana = makeCustomer({ name: 'Ana', email: 'ana@test.com' });
      const luis = makeCustomer({ name: 'Luis', email: 'luis@test.com' });
      stubCustomers([ana, luis]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockMail.sendCampaign).not.toHaveBeenCalled();
      const rows = recipientModel.insertMany.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        campaignId: doc._id,
        customerId: ana._id,
        name: 'Ana',
        to: 'ana@test.com',
        status: 'pending',
      });
      expect(doc.status).toBe('sending');
      expect(doc.recipientCount).toBe(2);
      expect(doc.stats).toEqual({
        total: 2,
        pending: 2,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
    });

    it('sin asunto no falla: el envío usará el nombre de la campaña', async () => {
      const doc = makeCampaignDoc({ subject: undefined, name: 'Mi Campaña' });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);

      await service.send(doc._id.toString(), tenantId);

      expect(doc.status).toBe('sending');
    });

    it('omite a quien no tiene email y a los repetidos, con su motivo', async () => {
      const doc = makeCampaignDoc({ type: 'email' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ email: 'uno@test.com' }),
        makeCustomer({ email: undefined }),
        makeCustomer({ email: 'UNO@test.com' }),
      ]);

      await service.send(doc._id.toString(), tenantId);

      const rows = recipientModel.insertMany.mock.calls[0][0];
      expect(rows.map((r: any) => [r.status, r.error])).toEqual([
        ['pending', undefined],
        ['skipped', 'Sin email'],
        ['skipped', 'Email repetido'],
      ]);
      expect(doc.stats).toMatchObject({ total: 3, pending: 1, skipped: 2 });
    });

    it('rechaza el envío si nadie puede recibirlo', async () => {
      const doc = makeCampaignDoc({ type: 'email' });
      stubFindById(doc);
      stubCustomers([makeCustomer({ email: undefined })]);

      await expect(service.send(doc._id.toString(), tenantId)).rejects.toThrow(
        BadRequestException,
      );
      expect(recipientModel.insertMany).not.toHaveBeenCalled();
      expect(doc.status).toBe('draft');
    });

    it('con fecha futura queda programada en vez de enviándose', async () => {
      const doc = makeCampaignDoc({
        type: 'email',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);

      await service.send(doc._id.toString(), tenantId);

      expect(doc.status).toBe('scheduled');
    });

    it('con plantilla copia su HTML a la campaña', async () => {
      const doc = makeCampaignDoc({
        type: 'email',
        body: '',
        subject: '',
        emailTemplateId: new Types.ObjectId(),
      });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);
      emailTemplateModel.findOne.mockReturnValue(
        buildQuery({
          html: '<p>Hola {nombre}</p>',
          subject: 'Del diseño',
          preheader: 'pre',
        }),
      );

      await service.send(doc._id.toString(), tenantId);

      expect(doc.html).toBe('<p>Hola {nombre}</p>');
      expect(doc.subject).toBe('Del diseño');
      // La plantilla se busca dentro de la empresa, nunca solo por id.
      expect(emailTemplateModel.findOne.mock.calls[0][0].tenantId).toBe(
        doc.tenantId,
      );
    });

    it('{link} exige un destino y crea un link personal por destinatario', async () => {
      const doc = makeCampaignDoc({ type: 'sms', body: 'Mira {link}' });
      stubFindById(doc);
      const ana = makeCustomer();
      stubCustomers([ana]);

      await expect(service.send(doc._id.toString(), tenantId)).rejects.toThrow(
        /indica a qué dirección/,
      );

      doc.linkUrl = 'https://tienda.com/oferta';
      mockLinks.createPersonalLinks.mockResolvedValue([
        { linkId: new Types.ObjectId(), shortUrl: 'https://go.x/aB3xK9p' },
      ]);
      await service.send(doc._id.toString(), tenantId);

      expect(mockLinks.createPersonalLinks.mock.calls[0][2]).toEqual([
        { customerId: ana._id },
      ]);
      expect(recipientModel.insertMany.mock.calls[0][0][0].shortUrl).toBe(
        'https://go.x/aB3xK9p',
      );
    });

    it('SMS: sin proveedor configurado no se encola nada', async () => {
      const doc = makeCampaignDoc({ type: 'sms', body: 'Hola' });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);
      mockSms.requireConfig.mockRejectedValue(
        new BadRequestException('No hay un proveedor de SMS activo'),
      );

      await expect(service.send(doc._id.toString(), tenantId)).rejects.toThrow(
        /proveedor de SMS/,
      );
      expect(recipientModel.insertMany).not.toHaveBeenCalled();
    });

    it('SMS: el destino es el teléfono y sin teléfono se omite', async () => {
      const doc = makeCampaignDoc({ type: 'sms', body: 'Hola {nombre}' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: '+51999000111' }),
        makeCustomer({ phone: undefined }),
      ]);

      await service.send(doc._id.toString(), tenantId);

      const rows = recipientModel.insertMany.mock.calls[0][0];
      expect(rows.map((r: any) => [r.to, r.status, r.error])).toEqual([
        ['+51999000111', 'pending', undefined],
        ['', 'skipped', 'Sin teléfono'],
      ]);
    });
  });

  // ─── send: WhatsApp Cloud API ──────────────────────────────────────────────

  describe('send whatsapp cloudapi campaign', () => {
    it('sends personalized message per customer with cloudapi provider', async () => {
      const doc = makeCampaignDoc({
        type: 'whatsapp',
        waProvider: 'cloudapi',
        body: 'Hola {nombre}',
        mediaUrl: 'http://img',
        mediaType: 'image',
      });
      stubFindById(doc);
      stubCustomers([makeCustomer({ name: 'Ana', phone: '+51111' })]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockSettings.sendWhatsApp).toHaveBeenCalledWith(
        '+51111',
        'Hola Ana',
        tenantId,
        'http://img',
        'image',
        'cloudapi',
      );
      expect(doc.status).toBe('sent');
      expect(doc.sentAt).toBeInstanceOf(Date);
    });

    it('skips customers without phone and reports them in errorMessage', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'cloudapi' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: '+51111' }),
        makeCustomer({ phone: undefined }),
      ]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockSettings.sendWhatsApp).toHaveBeenCalledTimes(1);
      expect(doc.recipientCount).toBe(1);
      expect(doc.errorMessage).toBe('1 sin teléfono (omitidos)');
    });

    it('records failures without aborting and includes first error', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'cloudapi' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: '+51111' }),
        makeCustomer({ phone: '+51222' }),
      ]);
      mockSettings.sendWhatsApp
        .mockRejectedValueOnce(new Error('token expired'))
        .mockResolvedValueOnce(undefined);

      await service.send(doc._id.toString(), tenantId);

      expect(mockSettings.sendWhatsApp).toHaveBeenCalledTimes(2);
      expect(doc.status).toBe('sent');
      expect(doc.errorMessage).toContain('1 mensaje(s) fallaron');
      expect(doc.errorMessage).toContain('token expired');
    });

    it('uses template sending when templateName is set, personalizing vars', async () => {
      const doc = makeCampaignDoc({
        type: 'whatsapp',
        waProvider: 'cloudapi',
        templateName: 'promo_julio',
        templateLanguage: undefined,
        templateVars: ['{nombre}', '20%'],
      });
      stubFindById(doc);
      stubCustomers([makeCustomer({ name: 'Ana', phone: '+51111' })]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockSettings.sendWhatsAppTemplate).toHaveBeenCalledWith(
        '+51111',
        'promo_julio',
        'es',
        ['Ana', '20%'],
        tenantId,
        // Plantilla sin cabecera variable: no se manda componente de header.
        undefined,
      );
      expect(mockSettings.sendWhatsApp).not.toHaveBeenCalled();
    });
  });

  // ─── send: WhatsApp WAHA ───────────────────────────────────────────────────

  describe('send whatsapp waha campaign', () => {
    it('marks campaign sent without sending when daily limit is exhausted', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'waha' });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);
      mockSettings.getWaDailyLimit.mockResolvedValue(10);
      // countWaSentToday: previous sent campaigns totaling 10
      campaignModel.find.mockReturnValue(buildQuery([{ recipientCount: 10 }]));

      await service.send(doc._id.toString(), tenantId);

      expect(mockSettings.sendWhatsApp).not.toHaveBeenCalled();
      expect(doc.status).toBe('sent');
      expect(doc.errorMessage).toContain('Límite diario de 10');
    });

    it('returns immediately in sending state and completes queue in background', async () => {
      const doc = makeCampaignDoc({
        type: 'whatsapp',
        waProvider: 'waha',
        body: 'Hola {nombre}',
      });
      stubFindById(doc);
      stubCustomers([makeCustomer({ name: 'Ana', phone: '+51111' })]);
      mockSettings.getWaDailyLimit.mockResolvedValue(50);

      const result = await service.send(doc._id.toString(), tenantId);
      expect(result.status).toBe('sending');

      await flushAsync();

      expect(mockSettings.sendWhatsApp).toHaveBeenCalledWith(
        '+51111',
        'Hola Ana',
        tenantId,
        undefined,
        undefined,
        'waha',
      );
      expect(doc.status).toBe('sent');
      expect(doc.sentAt).toBeInstanceOf(Date);
      expect(doc.errorMessage).toBeUndefined();
    });

    it('slices recipients to the remaining daily quota and reports skipped', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'waha' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: '+51111' }),
        makeCustomer({ phone: '+51222' }),
        makeCustomer({ phone: '+51333' }),
        makeCustomer({ phone: undefined }),
      ]);
      mockSettings.getWaDailyLimit.mockResolvedValue(5);
      campaignModel.find.mockReturnValue(buildQuery([{ recipientCount: 4 }]));

      await service.send(doc._id.toString(), tenantId);
      await flushAsync();

      expect(mockSettings.sendWhatsApp).toHaveBeenCalledTimes(1);
      expect(doc.recipientCount).toBe(1);
      expect(doc.errorMessage).toContain('1 sin teléfono (omitidos)');
      expect(doc.errorMessage).toContain('2 omitidos por límite diario');
    });

    it('records per-recipient failures without aborting the queue', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'waha' });
      stubFindById(doc);
      stubCustomers([makeCustomer({ phone: '+51111' })]);
      mockSettings.sendWhatsApp.mockRejectedValueOnce(new Error('waha down'));

      await service.send(doc._id.toString(), tenantId);
      await flushAsync();

      expect(doc.status).toBe('sent');
      expect(doc.errorMessage).toContain('1 mensaje(s) fallaron');
      expect(doc.errorMessage).toContain('waha down');
    });
  });

  // ─── resend ─────────────────────────────────────────────────────────────────

  describe('resend', () => {
    it('resets a sent campaign and queues it again', async () => {
      const doc = makeCampaignDoc({
        status: 'sent',
        sentAt: new Date('2026-01-01'),
        errorMessage: 'algo falló',
        scheduledAt: new Date('2026-01-01'),
      });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);

      await service.resend(doc._id.toString(), tenantId);

      // Parte de cero: se borran los destinatarios del envío anterior.
      expect(recipientModel.deleteMany).toHaveBeenCalledTimes(1);
      expect(recipientModel.insertMany).toHaveBeenCalledTimes(1);
      expect(doc.status).toBe('sending');
      expect(doc.errorMessage).toBeUndefined();
      expect(doc.sentAt).toBeUndefined();
    });

    it('rejects resend while campaign is sending', async () => {
      stubFindById(makeCampaignDoc({ status: 'sending' }));
      await expect(service.resend('x', tenantId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when campaign not found', async () => {
      stubFindById(null);
      await expect(service.resend('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── estimate ───────────────────────────────────────────────────────────────

  describe('estimate', () => {
    it('computes recipients, minutes and remaining quota for waha whatsapp', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'waha' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: '+51111' }),
        makeCustomer({ phone: '+51222' }),
        makeCustomer({ phone: undefined }), // filtered out for whatsapp
      ]);
      mockSettings.getWaDailyLimit.mockResolvedValue(100);
      campaignModel.find.mockReturnValue(buildQuery([{ recipientCount: 95 }]));

      const result = await service.estimate(doc._id.toString(), tenantId);

      expect(result).toEqual({
        recipientCount: 2,
        estimatedMinutes: 2, // ceil(2 * 45 / 60)
        dailyLimit: 100,
        sentToday: 95,
        remaining: 5,
      });
    });

    it('caps willSend by remaining quota when computing minutes', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'waha' });
      stubFindById(doc);
      stubCustomers(
        Array.from({ length: 10 }, (_, i) =>
          makeCustomer({ phone: `+51${i}` }),
        ),
      );
      mockSettings.getWaDailyLimit.mockResolvedValue(5);
      campaignModel.find.mockReturnValue(buildQuery([{ recipientCount: 3 }]));

      const result = await service.estimate(doc._id.toString(), tenantId);

      expect(result.recipientCount).toBe(10);
      expect(result.remaining).toBe(2);
      expect(result.estimatedMinutes).toBe(2); // ceil(2 * 45 / 60)
    });

    it('returns flat pricing and no daily limit for cloudapi', async () => {
      const doc = makeCampaignDoc({ type: 'whatsapp', waProvider: 'cloudapi' });
      stubFindById(doc);
      stubCustomers([makeCustomer({ phone: '+51111' })]);

      const result = await service.estimate(doc._id.toString(), tenantId);

      expect(result).toEqual({
        recipientCount: 1,
        estimatedMinutes: 0,
        dailyLimit: 0,
        sentToday: 0,
        remaining: 1,
        cloudApiPricePerMsg: 0.0625,
      });
      expect(mockSettings.getWaDailyLimit).not.toHaveBeenCalled();
    });

    it('does not filter by phone nor count quota for email campaigns', async () => {
      const doc = makeCampaignDoc({ type: 'email' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ phone: undefined, email: 'a@test.com' }),
        makeCustomer({ phone: '+51111', email: 'b@test.com' }),
      ]);
      mockSettings.getWaDailyLimit.mockResolvedValue(50);

      const result = await service.estimate(doc._id.toString(), tenantId);

      expect(result.recipientCount).toBe(2);
      expect(result.sentToday).toBe(0);
    });

    it('throws ForbiddenException for wrong tenant', async () => {
      stubFindById(makeCampaignDoc({ tenantId: { toString: () => 'other' } }));
      await expect(service.estimate('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── generateEmail ─────────────────────────────────────────────────────────

  describe('generateEmail', () => {
    it('builds a prompt with topic and tone, and parses the AI JSON response', async () => {
      mockAi.chat.mockResolvedValue('{"subject":"S","body":"B"}');
      mockAi.parseJson.mockReturnValue({ subject: 'S', body: 'B' });

      const result = await service.generateEmail({
        topic: 'Noche de tapas',
        tone: 'exclusivo',
      });

      expect(result).toEqual({ subject: 'S', body: 'B' });
      const prompt = mockAi.chat.mock.calls[0][0];
      expect(prompt).toContain('Noche de tapas');
      expect(prompt).toContain('exclusivo y premium');
      expect(mockAi.chat).toHaveBeenCalledWith(expect.any(String), {
        maxTokens: 700,
      });
      expect(mockAi.parseJson).toHaveBeenCalledWith(
        '{"subject":"S","body":"B"}',
      );
    });

    it('falls back to friendly tone when tone is unknown or missing', async () => {
      mockAi.chat.mockResolvedValue('{}');
      mockAi.parseJson.mockReturnValue({ subject: '', body: '' });

      await service.generateEmail({ topic: 'Promo' });

      expect(mockAi.chat.mock.calls[0][0]).toContain('amigable y cercano');
    });
  });

  // ─── recuperación de campañas huérfanas + cuota en vuelo ───────────────────

  describe('onModuleInit (campañas huérfanas)', () => {
    it("marca como 'failed' las campañas de WhatsApp en 'sending' al arrancar", async () => {
      campaignModel.updateMany = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
      });

      await service.onModuleInit();

      expect(campaignModel.updateMany).toHaveBeenCalledWith(
        // Email y SMS se reanudan solos: no se tocan.
        { status: 'sending', type: 'whatsapp' },
        { $set: expect.objectContaining({ status: 'failed' }) },
      );
    });
  });

  describe('cuota diaria (countWaSentToday)', () => {
    it("cuenta lo enviado hoy y reserva lo que está en 'sending'", async () => {
      campaignModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([{ recipientCount: 10 }, { recipientCount: 5 }]),
      });

      const total = await (service as any).countWaSentToday(
        '64b000000000000000000000',
      );

      expect(total).toBe(15);
      const filter = campaignModel.find.mock.calls[0][0];
      expect(filter.$or).toEqual([
        expect.objectContaining({ status: 'sent' }),
        { status: 'sending' },
      ]);
    });
  });
});
