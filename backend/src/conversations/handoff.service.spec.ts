import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { HandoffService } from './handoff.service';
import { Conversation } from './conversation.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';

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

const mockEmailAccounts = {
  findById: jest.fn(),
  findAll: jest.fn(),
  smtpConfig: jest.fn(),
  fromHeader: jest.fn(),
};
const mockTransport = { send: jest.fn() };
const mockMail = { sendHtml: jest.fn() };
const mockSms = { requireConfig: jest.fn(), dispatch: jest.fn() };

function makeConv(overrides: Record<string, unknown> = {}): Conversation {
  return {
    _id: convOid,
    tenantId: tenantOid,
    accountId: accountOid,
    channel: 'whatsapp',
    contact: '51999888777',
    contactName: 'Ana',
    ...overrides,
  } as unknown as Conversation;
}

function makeAgent(overrides: Record<string, unknown> = {}): AiAgent {
  return {
    handoffEnabled: true,
    handoffNumbers: ['51911111111'],
    handoffTemplateLang: 'es',
    ...overrides,
  } as unknown as AiAgent;
}

describe('HandoffService', () => {
  let service: HandoffService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAccounts.findById.mockResolvedValue({ _id: accountOid });
    mockAccounts.getDefault.mockResolvedValue(null);
    mockAccounts.toConfig.mockReturnValue({ provider: 'waha' });
    mockWa.sendMessage.mockResolvedValue('wamid.1');
    mockEmailAccounts.findById.mockResolvedValue(null);
    mockEmailAccounts.findAll.mockResolvedValue([]);
    mockEmailAccounts.smtpConfig.mockResolvedValue({ host: 'smtp.test' });
    mockEmailAccounts.fromHeader.mockReturnValue('"Ventas" <ventas@x.pe>');
    mockTransport.send.mockResolvedValue('<id@x.pe>');
    mockMail.sendHtml.mockResolvedValue('re_1');
    mockSms.requireConfig.mockResolvedValue({ url: 'https://sms.test' });
    mockSms.dispatch.mockResolvedValue({ status: 200, response: 'ok' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoffService,
        { provide: WhatsAppService, useValue: mockWa },
        { provide: WhatsAppAccountsService, useValue: mockAccounts },
        { provide: EmailAccountsService, useValue: mockEmailAccounts },
        { provide: EmailTransportService, useValue: mockTransport },
        { provide: MailService, useValue: mockMail },
        { provide: SmsService, useValue: mockSms },
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

    expect(result.notified).toEqual([
      'WhatsApp +51911111111',
      'WhatsApp +51922222222',
    ]);
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

    expect(result.notified).toEqual(['WhatsApp +51922222222']);
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
    expect(result.error).toContain('destinatarios de aviso');
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
    expect(result.notified).toEqual(['WhatsApp +51911111111']);
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

  describe('otros canales', () => {
    const emailOid = new Types.ObjectId();
    const mailbox = (overrides: Record<string, unknown> = {}) => ({
      _id: emailOid,
      tenantId: tenantOid,
      active: true,
      isDefault: true,
      ...overrides,
    });
    const link = `https://app.test/inbox?c=${String(convOid)}`;

    it('avisa por correo desde el buzón elegido, sin formato de WhatsApp', async () => {
      mockEmailAccounts.findById.mockResolvedValue(mailbox());

      const result = await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: [],
          handoffTargets: [
            { channel: 'email', to: 'jefa@x.pe', accountId: String(emailOid) },
          ],
        }),
        'reclamo',
        'Quiero hablar con alguien',
      );

      expect(result).toEqual({
        notified: ['correo jefa@x.pe'],
        error: undefined,
      });
      expect(mockEmailAccounts.findById).toHaveBeenCalledWith(String(emailOid));
      const [smtp, mail] = mockTransport.send.mock.calls[0];
      expect(smtp).toEqual({ host: 'smtp.test' });
      expect(mail.to).toBe('jefa@x.pe');
      expect(mail.from).toBe('"Ventas" <ventas@x.pe>');
      expect(mail.subject).toContain('Ana');
      expect(mail.text).toContain('Motivo: reclamo');
      expect(mail.text).not.toContain('*');
      expect(mail.text).toContain(link);
      expect(mail.headers).toEqual({ 'Auto-Submitted': 'auto-generated' });
      expect(mockWa.sendMessage).not.toHaveBeenCalled();
    });

    it('no usa un buzón de otra empresa: cae al predeterminado de la propia', async () => {
      const foreign = mailbox({ tenantId: new Types.ObjectId() });
      const own = mailbox({ _id: new Types.ObjectId() });
      mockEmailAccounts.findById
        .mockResolvedValueOnce(foreign)
        .mockResolvedValueOnce(own);
      mockEmailAccounts.findAll.mockResolvedValue([own]);

      await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: [],
          handoffTargets: [
            { channel: 'email', to: 'a@x.pe', accountId: String(emailOid) },
          ],
        }),
        undefined,
        'hola',
      );

      expect(mockEmailAccounts.findAll).toHaveBeenCalledWith(String(tenantOid));
      expect(mockEmailAccounts.smtpConfig).toHaveBeenCalledWith(own);
    });

    it('sin buzones conectados el correo sale con el remitente de la plataforma', async () => {
      const result = await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: [],
          handoffTargets: [{ channel: 'email', to: 'a@x.pe' }],
        }),
        undefined,
        'hola',
      );

      expect(result.notified).toEqual(['correo a@x.pe']);
      expect(mockTransport.send).not.toHaveBeenCalled();
      expect(mockMail.sendHtml).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@x.pe' }),
      );
    });

    it('avisa por SMS con el proveedor de la empresa y un texto corto', async () => {
      const result = await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: [],
          handoffTargets: [{ channel: 'sms', to: '51933333333' }],
        }),
        'pide descuento',
        'hola',
      );

      expect(result.notified).toEqual(['SMS +51933333333']);
      expect(mockSms.requireConfig).toHaveBeenCalledWith(String(tenantOid));
      const [, to, text] = mockSms.dispatch.mock.calls[0];
      expect(to).toBe('+51933333333');
      expect(text).toContain('Ana (+51999888777)');
      expect(text).toContain('pide descuento');
      expect(text).toContain(link);
    });

    it('un canal caído no impide avisar por los demás', async () => {
      mockSms.requireConfig.mockRejectedValue(
        new Error('No hay un proveedor de SMS activo'),
      );

      const result = await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: [],
          handoffTargets: [
            { channel: 'sms', to: '51933333333' },
            { channel: 'email', to: 'a@x.pe' },
            { channel: 'whatsapp', to: '51911111111' },
          ],
        }),
        undefined,
        'hola',
      );

      expect(result.notified).toEqual([
        'correo a@x.pe',
        'WhatsApp +51911111111',
      ]);
      expect(result.error).toBe(
        'SMS +51933333333: No hay un proveedor de SMS activo',
      );
    });

    it('cada destinatario de WhatsApp puede salir por su propia cuenta', async () => {
      const other = new Types.ObjectId();
      mockAccounts.findById.mockImplementation((id: string) =>
        Promise.resolve({ _id: id, tenantId: tenantOid }),
      );
      mockAccounts.toConfig.mockImplementation((a: { _id: string }) => ({
        provider: 'waha',
        session: a._id,
      }));

      await service.notify(
        makeConv(),
        makeAgent({
          handoffNumbers: ['51911111111'],
          handoffTargets: [
            {
              channel: 'whatsapp',
              to: '51922222222',
              accountId: String(other),
            },
            // Repetido en la lista antigua: se avisa una sola vez.
            { channel: 'whatsapp', to: '51911111111' },
          ],
        }),
        undefined,
        'hola',
      );

      expect(mockWa.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockWa.sendMessage.mock.calls[0][2]).toEqual({
        provider: 'waha',
        session: String(other),
      });
      expect(mockWa.sendMessage.mock.calls[1][2]).toEqual({
        provider: 'waha',
        session: String(accountOid),
      });
    });
  });
});
