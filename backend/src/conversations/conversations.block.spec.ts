import { CampaignAttributionService } from '../campaign-attribution/campaign-attribution.service';
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
import { ConversationAssignmentService } from './conversation-assignment.service';
import { BlockedContactsService } from './blocked-contacts.service';

/** Asignación simulada: escribir le da el chat a quien escribe. */
const fakeAssignment = {
  ensureWriter: jest.fn(
    (
      conv: { autoReply: boolean; takenOverBy?: unknown },
      actor: { userId: string },
    ) => {
      conv.autoReply = false;
      conv.takenOverBy = new Types.ObjectId(actor.userId);
      return Promise.resolve(conv);
    },
  ),
  assertCanControl: jest.fn(),
  take: jest.fn(),
  note: jest.fn().mockResolvedValue(undefined),
  nameOf: jest.fn().mockResolvedValue('Ana'),
};

const tenantId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const convOid = new Types.ObjectId();

function buildQuery(result: unknown) {
  const q: any = {
    exec: jest.fn().mockResolvedValue(result),
    lean: jest.fn().mockResolvedValue(result),
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
  let blocks: any;
  let leads: any;
  let emailAccounts: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    convModel = {
      findOne: jest.fn().mockReturnValue(buildQuery(makeConv())),
      find: jest.fn().mockReturnValue(buildQuery([])),
    };
    msgModel = { create: jest.fn() };
    wa = { setContactBlocked: jest.fn().mockResolvedValue(undefined) };
    waAccounts = {
      findById: jest.fn().mockResolvedValue({ _id: 'acc', active: true }),
      toConfig: jest.fn().mockReturnValue({ provider: 'cloudapi' }),
    };
    suppression = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      add: jest.fn(),
      removeByContact: jest.fn(),
    };
    gateway = { emitConversation: jest.fn(), emitMessage: jest.fn() };
    blocks = {
      isBlocked: jest.fn().mockResolvedValue(false),
      block: jest.fn((_t: string, targets: unknown[]) =>
        Promise.resolve(targets.map(() => ({}))),
      ),
      unblock: jest.fn().mockResolvedValue(null),
      removeById: jest.fn().mockResolvedValue(null),
    };
    leads = { findCustomer: jest.fn().mockResolvedValue(null) };
    emailAccounts = { findOne: jest.fn() };

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
        { provide: LeadsService, useValue: leads },
        { provide: PushService, useValue: { sendToTenant: jest.fn() } },
        {
          provide: NativePushService,
          useValue: { sendToTenantModule: jest.fn() },
        },
        { provide: EmailAccountsService, useValue: emailAccounts },
        { provide: EmailTransportService, useValue: {} },
        { provide: ConversationAssignmentService, useValue: fakeAssignment },
        {
          provide: CampaignAttributionService,
          useValue: { lookup: jest.fn().mockResolvedValue(null) },
        },
        { provide: SuppressionService, useValue: suppression },
        { provide: BlockedContactsService, useValue: blocks },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  it('bloquea al contacto (no solo al chat), en WhatsApp y lo pasa a no contactar', async () => {
    const conv = makeConv({ chatId: '51999888777@c.us' });
    convModel.findOne.mockReturnValue(buildQuery(conv));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
      'Spam',
      { userName: 'Ana' },
    );

    expect(wa.setContactBlocked).toHaveBeenCalledWith(
      { provider: 'cloudapi' },
      '51999888777@c.us',
      true,
    );
    expect(blocks.block).toHaveBeenCalledWith(
      tenantId,
      [{ channel: 'whatsapp', contact: '51999888777' }],
      expect.objectContaining({
        reason: 'Spam',
        source: 'inbox',
        userId,
        userName: 'Ana',
      }),
      { accountId: String(conv.accountId), onChannel: true },
    );
    expect(suppression.add).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ phone: '51999888777', reason: 'Spam' }),
    );
    expect(res).toMatchObject({
      blocked: true,
      channelBlocked: true,
      doNotContact: true,
      blockedCount: 1,
    });
    expect(gateway.emitConversation).toHaveBeenCalledWith(tenantId, conv);
  });

  it('si WhatsApp rechaza el bloqueo, queda bloqueado en la plataforma y devuelve el motivo', async () => {
    wa.setContactBlocked.mockRejectedValue(new Error('Cloud API 500: caído'));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
    );

    expect(blocks.block).toHaveBeenCalledWith(
      tenantId,
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ onChannel: false }),
    );
    expect(res).toMatchObject({
      blocked: true,
      channelBlocked: false,
      channelError: 'Cloud API 500: caído',
    });
  });

  it('en Instagram bloquea solo en la plataforma', async () => {
    convModel.findOne.mockReturnValue(
      buildQuery(makeConv({ channel: 'instagram', contact: 'ig-123' })),
    );

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
    );

    expect(wa.setContactBlocked).not.toHaveBeenCalled();
    expect(suppression.add).not.toHaveBeenCalled();
    expect(blocks.block.mock.calls[0][1]).toEqual([
      { channel: 'instagram', contact: 'ig-123' },
    ]);
    expect(res.channelBlocked).toBe(false);
  });

  it('con "todos los canales" bloquea el teléfono, el email y los otros chats del cliente', async () => {
    const customerId = new Types.ObjectId();
    convModel.findOne.mockReturnValue(buildQuery(makeConv({ customerId })));
    leads.findCustomer.mockResolvedValue({
      name: 'Ana Pérez',
      phone: '+51 988 777 666',
      email: 'ana@correo.com',
    });
    convModel.find
      .mockReturnValueOnce(
        buildQuery([{ channel: 'instagram', contact: 'ig-9' }]),
      )
      .mockReturnValue(buildQuery([]));

    const res = await service.setBlocked(
      String(convOid),
      tenantId,
      userId,
      true,
      undefined,
      { allChannels: true },
    );

    expect(blocks.block.mock.calls[0][1]).toEqual([
      { channel: 'whatsapp', contact: '51999888777' },
      { channel: 'whatsapp', contact: '+51 988 777 666' },
      { channel: 'email', contact: 'ana@correo.com' },
      { channel: 'instagram', contact: 'ig-9' },
    ]);
    expect(convModel.find.mock.calls[0][0]).toMatchObject({ customerId });
    expect(res.blockedCount).toBe(4);
  });

  it('sin "todos los canales" no toca los otros chats del cliente', async () => {
    convModel.findOne.mockReturnValue(
      buildQuery(makeConv({ customerId: new Types.ObjectId() })),
    );
    leads.findCustomer.mockResolvedValue({ phone: '+51 988 777 666' });

    await service.setBlocked(String(convOid), tenantId, userId, true);

    expect(blocks.block.mock.calls[0][1]).toHaveLength(1);
  });

  it('desbloquea al contacto sin sacarlo de la lista de no contactar', async () => {
    await service.setBlocked(String(convOid), tenantId, userId, false);

    expect(wa.setContactBlocked).toHaveBeenCalledWith(
      { provider: 'cloudapi' },
      '51999888777',
      false,
    );
    expect(blocks.unblock).toHaveBeenCalledWith(
      tenantId,
      'whatsapp',
      '51999888777',
    );
    expect(blocks.block).not.toHaveBeenCalled();
    expect(suppression.removeByContact).not.toHaveBeenCalled();
  });

  it('no deja escribir a un contacto bloqueado', async () => {
    convModel.findOne.mockReturnValue(buildQuery(makeConv({ blocked: true })));

    await expect(
      service.sendManual(String(convOid), tenantId, userId, { text: 'hola' }),
    ).rejects.toThrow(/bloqueado/);
    expect(msgModel.create).not.toHaveBeenCalled();
  });

  it('no deja redactar un correo nuevo a un contacto bloqueado', async () => {
    blocks.isBlocked.mockResolvedValue(true);

    await expect(
      service.composeEmail(tenantId, userId, {
        accountId: String(new Types.ObjectId()),
        to: 'Spam@Correo.com',
        subject: 'Hola',
        text: 'hola',
      }),
    ).rejects.toThrow(/bloqueado/);
    expect(blocks.isBlocked).toHaveBeenCalledWith(
      tenantId,
      'email',
      'Spam@Correo.com',
    );
    expect(emailAccounts.findOne).not.toHaveBeenCalled();
  });

  it('descarta lo que llega de un contacto bloqueado antes de crear o tocar el chat', async () => {
    blocks.isBlocked.mockResolvedValue(true);
    const account = { _id: new Types.ObjectId(), tenantId };

    await service.handleWhatsAppInbound(account as any, {
      contact: '51999888777',
      type: 'text',
      text: 'hola',
    });

    expect(blocks.isBlocked).toHaveBeenCalledWith(
      tenantId,
      'whatsapp',
      '51999888777',
    );
    // Ni siquiera se busca la conversación: aunque se haya eliminado, no vuelve.
    expect(convModel.findOne).not.toHaveBeenCalled();
    expect(msgModel.create).not.toHaveBeenCalled();
    expect(gateway.emitMessage).not.toHaveBeenCalled();
  });

  it('bloqueo a mano: normaliza el número y lo pasa a no contactar', async () => {
    await service.blockManual(tenantId, userId, {
      channel: 'whatsapp',
      contact: '999 888 777',
      reason: 'Acoso',
    });

    expect(blocks.block).toHaveBeenCalledWith(
      tenantId,
      [{ channel: 'whatsapp', contact: '51999888777' }],
      expect.objectContaining({ source: 'manual', reason: 'Acoso' }),
    );
    expect(suppression.add).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ phone: '51999888777' }),
    );
  });

  it('bloqueo a mano: rechaza un número que no sirve', async () => {
    await expect(
      service.blockManual(tenantId, userId, {
        channel: 'whatsapp',
        contact: '12',
      }),
    ).rejects.toThrow(/no es válido/);
    expect(blocks.block).not.toHaveBeenCalled();
  });

  it('desbloquear desde la lista: 404 si el bloqueo no es de la empresa', async () => {
    await expect(
      service.unblockEntry(tenantId, String(new Types.ObjectId())),
    ).rejects.toThrow(/no encontrado/);
  });

  it('desbloquear desde la lista: quita también el bloqueo de WhatsApp', async () => {
    blocks.removeById.mockResolvedValue({
      _id: new Types.ObjectId(),
      channel: 'whatsapp',
      identifier: '51999888777',
      onChannel: true,
      accountId: new Types.ObjectId(),
    });

    const res = await service.unblockEntry(
      tenantId,
      String(new Types.ObjectId()),
    );

    expect(wa.setContactBlocked).toHaveBeenCalledWith(
      { provider: 'cloudapi' },
      '51999888777',
      false,
    );
    expect(res).toEqual({ removed: true });
  });
});
