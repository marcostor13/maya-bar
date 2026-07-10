import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './campaign.schema';
import { Customer } from '../customers/customer.schema';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { ListsService } from '../lists/lists.service';
import { AiService } from '../ai/ai.service';

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

  const mockMail = { sendCampaign: jest.fn() };
  const mockSettings = {
    getWaDailyLimit: jest.fn(),
    sendWhatsApp: jest.fn(),
    sendWhatsAppTemplate: jest.fn(),
  };
  const mockLists = { resolveCustomers: jest.fn() };
  const mockAi = { chat: jest.fn(), parseJson: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    campaignModel = createMockModel();
    customerModel = createMockModel();

    mockMail.sendCampaign.mockResolvedValue(undefined);
    mockSettings.getWaDailyLimit.mockResolvedValue(50);
    mockSettings.sendWhatsApp.mockResolvedValue(undefined);
    mockSettings.sendWhatsAppTemplate.mockResolvedValue(undefined);
    mockLists.resolveCustomers.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getModelToken(Campaign.name), useValue: campaignModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: MailService, useValue: mockMail },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ListsService, useValue: mockLists },
        { provide: AiService, useValue: mockAi },
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

      expect(campaignModel.find).toHaveBeenCalledWith({
        tenantId: expect.any(Types.ObjectId),
      });
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

  describe('previewCount', () => {
    it('filters by tags with $in when tags are provided', async () => {
      customerModel.countDocuments.mockResolvedValue(7);

      const result = await service.previewCount(tenantId, ['vip', 'frecuente']);

      expect(result).toEqual({ count: 7 });
      const filter = customerModel.countDocuments.mock.calls[0][0];
      expect(filter.tags).toEqual({ $in: ['vip', 'frecuente'] });
    });

    it('counts all tenant customers when no tags', async () => {
      customerModel.countDocuments.mockResolvedValue(20);

      const result = await service.previewCount(tenantId, []);

      expect(result.count).toBe(20);
      const filter = customerModel.countDocuments.mock.calls[0][0];
      expect(filter.tags).toBeUndefined();
      expect(filter.tenantId.toString()).toBe(tenantId);
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

      await service.send(doc._id.toString(), tenantId);

      expect(mockLists.resolveCustomers).not.toHaveBeenCalled();
      expect(customerModel.find).toHaveBeenCalled();
    });

    it('targeting=all queries every customer of the tenant', async () => {
      const doc = makeCampaignDoc({ targeting: 'all' });
      stubFindById(doc);
      stubCustomers([]);

      await service.send(doc._id.toString(), tenantId);

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

      await service.send(doc._id.toString(), tenantId);

      const filter = customerModel.find.mock.calls[0][0];
      expect(filter.tags).toEqual({ $in: ['vip'] });
    });

    it('targeting=tags without tags targets all tenant customers', async () => {
      const doc = makeCampaignDoc({ targeting: 'tags', recipientTags: [] });
      stubFindById(doc);
      stubCustomers([]);

      await service.send(doc._id.toString(), tenantId);

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

  describe('send email campaign', () => {
    it('sends personalized email to each customer and marks campaign sent', async () => {
      const doc = makeCampaignDoc({
        type: 'email',
        subject: 'Oferta',
        body: 'Hola {nombre}!',
      });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ name: 'Ana', email: 'ana@test.com' }),
        makeCustomer({ name: 'Luis', email: 'luis@test.com' }),
      ]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockMail.sendCampaign).toHaveBeenCalledTimes(2);
      expect(mockMail.sendCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ana@test.com',
          name: 'Ana',
          subject: 'Oferta',
          body: 'Hola Ana!',
        }),
      );
      expect(doc.status).toBe('sent');
      expect(doc.recipientCount).toBe(2);
      expect(doc.sentAt).toBeInstanceOf(Date);
      expect(doc.errorMessage).toBeUndefined();
    });

    it('uses campaign name as subject fallback', async () => {
      const doc = makeCampaignDoc({ subject: undefined, name: 'Mi Campaña' });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);

      await service.send(doc._id.toString(), tenantId);

      expect(mockMail.sendCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Mi Campaña' }),
      );
    });

    it('does not abort the batch on per-recipient failure and records error count', async () => {
      const doc = makeCampaignDoc({ type: 'email' });
      stubFindById(doc);
      stubCustomers([
        makeCustomer({ email: 'ok@test.com' }),
        makeCustomer({ email: 'bad@test.com' }),
        makeCustomer({ email: 'bad2@test.com' }),
      ]);
      mockMail.sendCampaign
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('smtp down'))
        .mockRejectedValueOnce(new Error('smtp down'));

      await service.send(doc._id.toString(), tenantId);

      expect(mockMail.sendCampaign).toHaveBeenCalledTimes(3);
      expect(doc.status).toBe('sent');
      expect(doc.errorMessage).toBe('2 email(s) no se pudieron enviar');
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
    it('resets a sent campaign and sends again', async () => {
      const doc = makeCampaignDoc({
        status: 'sent',
        sentAt: new Date('2026-01-01'),
        errorMessage: 'algo falló',
      });
      stubFindById(doc);
      stubCustomers([makeCustomer()]);

      await service.resend(doc._id.toString(), tenantId);

      expect(mockMail.sendCampaign).toHaveBeenCalledTimes(1);
      expect(doc.status).toBe('sent');
      expect(doc.errorMessage).toBeUndefined();
      expect(doc.sentAt).toBeInstanceOf(Date);
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
        makeCustomer({ phone: undefined }),
        makeCustomer({ phone: '+51111' }),
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
});
