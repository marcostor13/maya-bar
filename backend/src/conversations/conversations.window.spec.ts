import { CampaignAttributionService } from '../campaign-attribution/campaign-attribution.service';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConversationsService, WINDOW_CLOSED } from './conversations.service';
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
import { ConversationAssignmentService } from './conversation-assignment.service';
import { BlockedContactsService } from './blocked-contacts.service';
import { windowFrom, WINDOW_MS } from './wa-window';

const HOUR = 60 * 60 * 1000;
const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const convOid = new Types.ObjectId();

function buildQuery(result: unknown) {
  const q: any = {
    exec: jest.fn().mockResolvedValue(result),
    lean: jest.fn().mockReturnThis(),
  };
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
    accountId: new Types.ObjectId(),
    autoReply: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function savedMsg(data: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(),
    ...data,
    save: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('windowFrom', () => {
  it('abierta hasta 24 h después del último entrante', () => {
    const now = Date.now();
    const at = new Date(now - 3 * HOUR);
    const w = windowFrom(true, at, now);
    expect(w).toEqual({
      applies: true,
      open: true,
      expiresAt: new Date(at.getTime() + WINDOW_MS),
    });
    expect(windowFrom(true, new Date(now - 25 * HOUR), now).open).toBe(false);
  });

  it('sin entrantes está cerrada; sin ventana siempre se puede escribir', () => {
    expect(windowFrom(true, null)).toEqual({
      applies: true,
      open: false,
      expiresAt: null,
    });
    expect(windowFrom(false, null)).toEqual({
      applies: false,
      open: true,
      expiresAt: null,
    });
  });
});

describe('ConversationsService — ventana de 24 h (HU27)', () => {
  let service: ConversationsService;
  let convModel: any;
  let msgModel: any;
  let wa: any;
  let waAccounts: any;
  let gateway: any;
  let conv: any;
  let lastInbound: { at: Date } | null;

  beforeEach(async () => {
    jest.clearAllMocks();
    conv = makeConv();
    lastInbound = { at: new Date(Date.now() - 3 * HOUR) };
    convModel = { findOne: jest.fn(() => buildQuery(conv)) };
    msgModel = {
      findOne: jest.fn(() => buildQuery(lastInbound)),
      create: jest.fn((d: Record<string, unknown>) =>
        Promise.resolve(savedMsg(d)),
      ),
      findOneAndUpdate: jest.fn(() => buildQuery(null)),
    };
    wa = {
      sendMessage: jest.fn().mockResolvedValue('wamid.text'),
      sendCloudApiTemplate: jest.fn().mockResolvedValue('wamid.tpl'),
    };
    waAccounts = {
      findById: jest
        .fn()
        .mockResolvedValue({ _id: 'acc', active: true, provider: 'cloudapi' }),
      toConfig: jest.fn().mockReturnValue({ provider: 'cloudapi' }),
    };
    gateway = {
      emitConversation: jest.fn(),
      emitMessage: jest.fn(),
      emitMessageUpdated: jest.fn(),
    };

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
        { provide: LeadsService, useValue: {} },
        { provide: PushService, useValue: {} },
        { provide: NativePushService, useValue: {} },
        { provide: EmailAccountsService, useValue: {} },
        { provide: EmailTransportService, useValue: {} },
        {
          provide: ConversationAssignmentService,
          useValue: {
            ensureWriter: jest.fn((c: unknown) => Promise.resolve(c)),
            assertCanControl: jest.fn(),
          },
        },
        { provide: CampaignAttributionService, useValue: {} },
        { provide: SuppressionService, useValue: {} },
        { provide: BlockedContactsService, useValue: {} },
      ],
    }).compile();

    service = module.get(ConversationsService);
  });

  it('C1: Cloud API con entrante hace 3 h → abierta y vence a las 24 h', async () => {
    const w = await service.getWindow(String(convOid), tenantId);
    expect(w.applies).toBe(true);
    expect(w.open).toBe(true);
    expect(w.expiresAt).toEqual(
      new Date(lastInbound!.at.getTime() + WINDOW_MS),
    );
    expect(msgModel.findOne).toHaveBeenCalledWith({
      conversationId: convOid,
      direction: 'in',
    });
  });

  it('C1: entrante hace 25 h → cerrada', async () => {
    lastInbound = { at: new Date(Date.now() - 25 * HOUR) };
    expect((await service.getWindow(String(convOid), tenantId)).open).toBe(
      false,
    );
  });

  it('C1: WhatsApp por QR, Instagram o correo no tienen ventana', async () => {
    waAccounts.findById.mockResolvedValue({ provider: 'evolution' });
    expect(await service.getWindow(String(convOid), tenantId)).toMatchObject({
      applies: false,
      open: true,
    });
    conv = makeConv({ channel: 'instagram' });
    expect((await service.getWindow(String(convOid), tenantId)).applies).toBe(
      false,
    );
    conv = makeConv({ channel: 'email' });
    expect((await service.getWindow(String(convOid), tenantId)).applies).toBe(
      false,
    );
  });

  it('C5: texto libre con la ventana cerrada → 409 sin guardar ni llamar a Meta', async () => {
    lastInbound = { at: new Date(Date.now() - 25 * HOUR) };
    await expect(
      service.sendManual(String(convOid), tenantId, userId, { text: 'hola' }),
    ).rejects.toThrow(new ConflictException(WINDOW_CLOSED));
    expect(msgModel.create).not.toHaveBeenCalled();
    expect(wa.sendMessage).not.toHaveBeenCalled();
  });

  it('C5: con la ventana abierta el texto sale normal', async () => {
    const msg = await service.sendManual(String(convOid), tenantId, userId, {
      text: 'hola',
    });
    expect(wa.sendMessage).toHaveBeenCalled();
    expect(msg.status).toBe('sent');
  });

  it('C5: reintento manual con la ventana cerrada solo acepta plantillas', async () => {
    lastInbound = null;
    await expect(
      service.retryMessage(
        String(convOid),
        String(new Types.ObjectId()),
        tenantId,
        userId,
      ),
    ).rejects.toThrow(new ConflictException(WINDOW_CLOSED));
    const filter = msgModel.findOneAndUpdate.mock.calls[0][0];
    expect(filter['template.name']).toEqual({ $exists: true });
  });

  it('C3: la plantilla se guarda rellenada y sale por la API de plantillas, aunque la ventana esté cerrada', async () => {
    lastInbound = null;
    const send = {
      name: 'seguimiento',
      language: 'es',
      variables: ['Ana'],
    };
    const msg = await service.sendTemplateMessage(
      String(convOid),
      tenantId,
      userId,
      { text: 'Hola Ana, ¿seguimos?', send },
      'client-abc-123',
    );
    expect(msgModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hola Ana, ¿seguimos?',
        template: send,
        clientId: 'client-abc-123',
        author: 'human',
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(wa.sendCloudApiTemplate).toHaveBeenCalledWith(
      '51999888777',
      'seguimiento',
      'es',
      ['Ana'],
      { provider: 'cloudapi' },
      undefined,
    );
    expect(wa.sendMessage).not.toHaveBeenCalled();
    expect(msg.status).toBe('sent');
  });

  it('C7: reenviar un mensaje de plantilla sale como plantilla, no como texto', async () => {
    const msg = savedMsg({
      type: 'text',
      text: 'Hola Ana',
      template: { name: 'seguimiento', language: 'es', variables: ['Ana'] },
    });
    await service.redeliver(conv, msg);
    expect(wa.sendCloudApiTemplate).toHaveBeenCalled();
    expect(wa.sendMessage).not.toHaveBeenCalled();
  });

  it('C6: el agente no envía con la ventana cerrada', async () => {
    lastInbound = { at: new Date(Date.now() - 30 * HOUR) };
    await (service as any).sendFromAgent(conv, { type: 'text', text: 'hola' });
    expect(msgModel.create).not.toHaveBeenCalled();
    expect(wa.sendMessage).not.toHaveBeenCalled();
  });

  it('C6: con la ventana abierta el agente responde', async () => {
    await (service as any).sendFromAgent(conv, { type: 'text', text: 'hola' });
    expect(wa.sendMessage).toHaveBeenCalled();
  });
});
