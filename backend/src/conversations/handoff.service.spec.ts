import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { HandoffService } from './handoff.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

const convOid = new Types.ObjectId();
const accountOid = new Types.ObjectId();
const tenantOid = new Types.ObjectId();

const mockWa = {
  sendMessage: jest.fn(),
  sendCloudApiTemplate: jest.fn(),
};

const mockAccounts = {
  findById: jest.fn(),
  getDefault: jest.fn(),
  toConfig: jest.fn(),
};

function makeConv(overrides: Record<string, unknown> = {}) {
  return {
    _id: convOid,
    tenantId: tenantOid,
    accountId: accountOid,
    channel: 'whatsapp',
    contact: '51999888777',
    contactName: 'Ana',
    ...overrides,
  } as any;
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    handoffEnabled: true,
    handoffNumbers: ['51911111111'],
    handoffTemplateLang: 'es',
    ...overrides,
  } as any;
}

describe('HandoffService', () => {
  let service: HandoffService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAccounts.findById.mockResolvedValue({ _id: accountOid });
    mockAccounts.getDefault.mockResolvedValue(null);
    mockAccounts.toConfig.mockReturnValue({ provider: 'waha' });
    mockWa.sendMessage.mockResolvedValue('wamid.1');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffService,
        { provide: WhatsAppService, useValue: mockWa },
        { provide: WhatsAppAccountsService, useValue: mockAccounts },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://app.test/' },
        },
      ],
    }).compile();

    service = module.get<HandoffService>(HandoffService);
  });

  it('notifies every configured number with the chat link', async () => {
    const agent = makeAgent({
      handoffNumbers: ['51911111111', '51922222222'],
    });

    const result = await service.notify(
      makeConv(),
      agent,
      'el cliente pide un humano',
      'Quiero hablar con una persona',
    );

    expect(result.notified).toEqual(['51911111111', '51922222222']);
    expect(result.error).toBeUndefined();
    expect(mockWa.sendMessage).toHaveBeenCalledTimes(2);

    const body = mockWa.sendMessage.mock.calls[0][1];
    expect(body).toContain('Ana (+51999888777)');
    expect(body).toContain('el cliente pide un humano');
    expect(body).toContain('Quiero hablar con una persona');
    expect(body).toContain(`https://app.test/inbox?c=${String(convOid)}`);
  });

  it('keeps going when one number fails and reports the error', async () => {
    mockWa.sendMessage
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('wamid.2');

    const result = await service.notify(
      makeConv(),
      makeAgent({ handoffNumbers: ['51911111111', '51922222222'] }),
      undefined,
      'hola',
    );

    expect(result.notified).toEqual(['51922222222']);
    expect(result.error).toContain('51911111111');
  });

  it('does not send anything when no numbers are configured', async () => {
    const result = await service.notify(
      makeConv(),
      makeAgent({ handoffNumbers: [] }),
      undefined,
      'hola',
    );

    expect(result.notified).toEqual([]);
    expect(result.error).toContain('números de aviso');
    expect(mockWa.sendMessage).not.toHaveBeenCalled();
  });

  it('uses a Cloud API template when one is configured', async () => {
    mockAccounts.toConfig.mockReturnValue({ provider: 'cloudapi' });

    await service.notify(
      makeConv(),
      makeAgent({ handoffTemplateName: 'aviso_handoff' }),
      'reclamo',
      'hola',
    );

    expect(mockWa.sendMessage).not.toHaveBeenCalled();
    expect(mockWa.sendCloudApiTemplate).toHaveBeenCalledWith(
      '51911111111',
      'aviso_handoff',
      'es',
      ['Ana', 'reclamo', `https://app.test/inbox?c=${String(convOid)}`],
      { provider: 'cloudapi' },
    );
  });

  it('falls back to the tenant default account for Instagram chats', async () => {
    mockAccounts.findById.mockResolvedValue(null);
    mockAccounts.getDefault.mockResolvedValue({ _id: accountOid });

    const result = await service.notify(
      makeConv({ channel: 'instagram', contact: 'IGSID123' }),
      makeAgent(),
      undefined,
      'hola',
    );

    expect(mockAccounts.getDefault).toHaveBeenCalledWith(String(tenantOid));
    expect(result.notified).toEqual(['51911111111']);
    expect(mockWa.sendMessage.mock.calls[0][1]).toContain(
      'Instagram · IGSID123',
    );
  });

  it('reports when there is no WhatsApp account to send from', async () => {
    mockAccounts.findById.mockResolvedValue(null);
    mockAccounts.getDefault.mockResolvedValue(null);

    const result = await service.notify(
      makeConv(),
      makeAgent(),
      undefined,
      'x',
    );

    expect(result.notified).toEqual([]);
    expect(result.error).toContain('cuenta de WhatsApp');
  });
});
