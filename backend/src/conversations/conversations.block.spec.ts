import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';
import { MediaUnderstandingService } from '../ai/media-understanding.service';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { SuppressionService } from '../suppression/suppression.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { MessengerService } from '../messenger/messenger.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { MessengerAccountsService } from '../messenger-accounts/messenger-accounts.service';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { UploadService } from '../upload/upload.service';
import { ConversationsGateway } from './conversations.gateway';
import { HandoffService } from './handoff.service';
import { LeadsService } from '../leads/leads.service';

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const convOid = new Types.ObjectId();

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

describe('ConversationsService — bloquear contacto', () => {
  let service: ConversationsService;
  let convModel: any;
  let msgModel: any;
  let wa: any;
  let waAccounts: any;
  let suppression: any;
  let gateway: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    convModel = {
      findOne: jest.fn().mockReturnValue(buildQuery(makeConv())),
    };
    msgModel = { create: jest.fn() };
    wa = { setContactBlocked: jest.fn().mockResolvedValue(undefined) };
    waAccounts = {
      findById: jest.fn().mockResolvedValue({ _id: 'acc', active: true }),
      toConfig: jest.fn().mockReturnValue({ provider: 'waha' }),
    };
    suppression = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      add: jest.fn(),
      removeByContact: jest.fn(),
    };
    gateway = { emitConversation: jest.fn(), emitMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: getModelToken(Conversation.name), useValue: convModel },
        { provide: getModelToken(Message.name), useValue: msgModel },
        { provide: WhatsAppService, useValue: wa },
        { provide: InstagramService, useValue: {} },
        { provide: MessengerService, useValue: {} },
        { provide: WhatsAppAccountsService, useValue: waAccounts },
        { provide: InstagramAccountsService, useValue: {} },
        { provide: MessengerAccountsService, useValue: {} },
        { provide: AiAgentsService, useValue: {} },
        { provide: MediaUnderstandingService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ConversationsGateway, useValue: gateway },
        { provide: HandoffService, useValue: {} },
        {
          provide: LeadsService,
          useValue: { findCustomer: jest.fn().mockResolvedValue(null) },
        },
        { provide: PushService, useValue: { sendToTenant: jest.fn() } },
        {
          provide: NativePushService,
          useValue: { sendToTenantModule: jest.fn() },
        },
        { provide: EmailAccountsService, useValue: {} },
        { provide: EmailTransportService, useValue: {} },
        { provide: SuppressionService, useValue: suppression },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  it('bloquea en la plataforma, en WhatsApp y lo pasa a no contactar', async () => {
    const conv = makeConv({
      chatId: '51999888777@c.us',
      autoReply: true,
      unreadCount: 3,
    });
    convModel.findOne.mockReturnValue(buildQuery(conv));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
      'Spam',
    );

    expect(wa.setContactBlocked).toHaveBeenCalledWith(
      { provider: 'waha' },
      '51999888777@c.us',
      true,
    );
    expect(conv).toMatchObject({
      blocked: true,
      blockedReason: 'Spam',
      blockedOnChannel: true,
      autoReply: false,
      unreadCount: 0,
    });
    expect(String(conv.blockedBy)).toBe(userId);
    expect(conv.save).toHaveBeenCalled();
    expect(suppression.add).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ phone: '51999888777', reason: 'Spam' }),
    );
    expect(res).toMatchObject({
      blocked: true,
      channelBlocked: true,
      doNotContact: true,
    });
    expect(gateway.emitConversation).toHaveBeenCalledWith(tenantId, conv);
  });

  it('si WhatsApp rechaza el bloqueo, queda bloqueado en la plataforma y devuelve el motivo', async () => {
    const conv = makeConv();
    convModel.findOne.mockReturnValue(buildQuery(conv));
    wa.setContactBlocked.mockRejectedValue(new Error('WAHA 500: caído'));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
    );

    expect(conv.blocked).toBe(true);
    expect(conv.blockedOnChannel).toBe(false);
    expect(res).toMatchObject({
      channelBlocked: false,
      channelError: 'WAHA 500: caído',
    });
  });

  it('en Instagram bloquea solo en la plataforma', async () => {
    const conv = makeConv({ channel: 'instagram', contact: 'ig-123' });
    convModel.findOne.mockReturnValue(buildQuery(conv));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
    );

    expect(wa.setContactBlocked).not.toHaveBeenCalled();
    expect(suppression.add).not.toHaveBeenCalled();
    expect(conv.blocked).toBe(true);
    expect(res.channelBlocked).toBe(false);
  });

  it('desbloquea sin sacarlo de la lista de no contactar', async () => {
    const conv = makeConv({
      blocked: true,
      blockedAt: new Date(),
      blockedReason: 'Spam',
    });
    convModel.findOne.mockReturnValue(buildQuery(conv));

    await service.setBlocked(String(convOid), tenantId, userId, false);

    expect(wa.setContactBlocked).toHaveBeenCalledWith(
      { provider: 'waha' },
      '51999888777',
      false,
    );
    expect(conv.blocked).toBe(false);
    expect(conv.blockedAt).toBeUndefined();
    expect(conv.blockedReason).toBeUndefined();
    expect(suppression.removeByContact).not.toHaveBeenCalled();
  });

  it('no deja escribir a un contacto bloqueado', async () => {
    convModel.findOne.mockReturnValue(buildQuery(makeConv({ blocked: true })));

    await expect(
      service.sendManual(String(convOid), tenantId, userId, { text: 'hola' }),
    ).rejects.toThrow(/bloqueado/);
    expect(msgModel.create).not.toHaveBeenCalled();
  });

  it('descarta lo que llega de un contacto bloqueado sin crear nada', async () => {
    convModel.findOne.mockReturnValue(buildQuery(makeConv({ blocked: true })));
    const account = { _id: new Types.ObjectId(), tenantId };

    await service.handleWhatsAppInbound(account as any, {
      contact: '51999888777',
      type: 'text',
      text: 'hola',
    });

    expect(msgModel.create).not.toHaveBeenCalled();
    expect(gateway.emitMessage).not.toHaveBeenCalled();
  });
});
