import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import { PushService } from '../push/push.service';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { UploadService } from '../upload/upload.service';
import { ConversationsGateway } from './conversations.gateway';
import { HandoffService } from './handoff.service';
import { LeadsService } from '../leads/leads.service';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const convOid = new Types.ObjectId();
const customerOid = new Types.ObjectId();

function buildQuery(result: unknown) {
  const q: any = { exec: jest.fn().mockResolvedValue(result) };
  for (const m of ['populate', 'sort', 'limit', 'select'])
    q[m] = jest.fn().mockReturnValue(q);
  return q;
}

function makeConv(overrides: Record<string, unknown> = {}) {
  return {
    _id: convOid,
    tenantId: new Types.ObjectId(tenantId),
    channel: 'whatsapp',
    contact: '51999888777',
    contactName: 'Ana',
    accountId: new Types.ObjectId(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    _id: customerOid,
    name: 'Ana',
    tags: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe('ConversationsService — contacto del CRM', () => {
  let service: ConversationsService;
  let convModel: any;
  let leads: any;
  let gateway: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    convModel = { findOne: jest.fn().mockReturnValue(buildQuery(makeConv())) };
    leads = {
      upsertCustomer: jest.fn().mockResolvedValue(makeCustomer()),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      findCustomer: jest.fn().mockResolvedValue(makeCustomer()),
      findByCustomer: jest.fn().mockResolvedValue([]),
    };
    gateway = { emitConversation: jest.fn(), emitMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: getModelToken(Conversation.name), useValue: convModel },
        { provide: getModelToken(Message.name), useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: InstagramService, useValue: {} },
        { provide: WhatsAppAccountsService, useValue: {} },
        { provide: InstagramAccountsService, useValue: {} },
        { provide: AiAgentsService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ConversationsGateway, useValue: gateway },
        { provide: HandoffService, useValue: {} },
        { provide: LeadsService, useValue: leads },
        { provide: PushService, useValue: { sendToTenant: jest.fn() } },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  it('saves the chat contact using the WhatsApp number and links it to the conversation', async () => {
    const conv = makeConv();
    convModel.findOne.mockReturnValue(buildQuery(conv));

    const res = await service.saveContact(
      String(convOid),
      tenantId,
      userId,
      'MANAGER',
      {},
    );

    expect(leads.upsertCustomer).toHaveBeenCalledWith(
      tenantId,
      userId,
      'MANAGER',
      {
        name: 'Ana',
        email: undefined,
        phone: '51999888777',
        source: 'whatsapp',
      },
    );
    expect(conv.customerId).toBe(customerOid);
    expect(conv.save).toHaveBeenCalled();
    expect(gateway.emitConversation).toHaveBeenCalled();
    expect(res.lead).toBeUndefined();
  });

  it('lets the operator override the name, tags and notes', async () => {
    const customer = makeCustomer({ tags: ['VIP'] });
    leads.upsertCustomer.mockResolvedValue(customer);

    await service.saveContact(String(convOid), tenantId, userId, 'MANAGER', {
      name: 'Ana Torres',
      tags: ['corporativo', 'VIP'],
      notes: 'Pide factura',
    });

    expect(customer.name).toBe('Ana Torres');
    // Las etiquetas se acumulan sin duplicar las que ya tenía.
    expect(customer.tags).toEqual(['VIP', 'corporativo']);
    expect(customer.notes).toBe('Pide factura');
    expect(customer.save).toHaveBeenCalled();
  });

  it('keeps the Instagram id in custom fields and sends no phone', async () => {
    const conv = makeConv({
      channel: 'instagram',
      contact: 'IGSID123',
      contactName: 'ana.ig',
    });
    convModel.findOne.mockReturnValue(buildQuery(conv));
    const customer = makeCustomer();
    leads.upsertCustomer.mockResolvedValue(customer);

    await service.saveContact(String(convOid), tenantId, userId, 'MANAGER', {});

    expect(leads.upsertCustomer.mock.calls[0][3].phone).toBeUndefined();
    expect(customer.customFields).toEqual({ instagramId: 'IGSID123' });
  });

  it('creates the follow-up opportunity when asked to', async () => {
    await service.saveContact(String(convOid), tenantId, userId, 'MANAGER', {
      createLead: true,
      leadValue: 1500,
    });

    expect(leads.create).toHaveBeenCalledWith(tenantId, userId, 'MANAGER', {
      customerId: String(customerOid),
      title: 'Seguimiento de Ana',
      value: 1500,
      source: 'whatsapp',
      conversationId: String(convOid),
    });
  });

  it('returns an empty card while the conversation has no contact saved', async () => {
    convModel.findOne.mockReturnValue(
      buildQuery(makeConv({ customerId: undefined })),
    );
    const card = await service.crmCard(String(convOid), tenantId);
    expect(card).toEqual({ customer: null, leads: [] });
    expect(leads.findCustomer).not.toHaveBeenCalled();
  });

  it('returns the linked contact with its opportunities', async () => {
    convModel.findOne.mockReturnValue(
      buildQuery(makeConv({ customerId: customerOid })),
    );
    leads.findByCustomer.mockResolvedValue([{ title: 'Evento' }]);

    const card = await service.crmCard(String(convOid), tenantId);

    expect(leads.findCustomer).toHaveBeenCalledWith(
      String(customerOid),
      tenantId,
    );
    expect(card.leads).toHaveLength(1);
  });
});
