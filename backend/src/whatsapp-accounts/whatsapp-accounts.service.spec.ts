import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { WhatsAppAccount } from './whatsapp-account.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOAuthService } from '../whatsapp/whatsapp-oauth.service';

const tenantId = String(new Types.ObjectId());
const accountId = String(new Types.ObjectId());

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const mockModel = {
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
};

const mockWa = {
  getStatus: jest.fn(),
  getQr: jest.fn(),
  deleteWahaSession: jest.fn(),
};

let env: Record<string, string | undefined>;

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(accountId),
    tenantId: new Types.ObjectId(tenantId),
    provider: 'waha',
    managed: true,
    wahaSession: 'maya_abc',
    isDefault: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WhatsAppAccount & { save: jest.Mock };
}

describe('WhatsAppAccountsService · cuentas por QR', () => {
  let service: WhatsAppAccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    env = {
      WAHA_API_URL: 'https://waha.plataforma.test/',
      WAHA_API_KEY: 'clave-del-servidor',
      PUBLIC_API_URL: 'https://api.test',
    };
    mockModel.countDocuments.mockReturnValue(exec(0));
    mockModel.create.mockImplementation((doc: unknown) => Promise.resolve(doc));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAccountsService,
        { provide: getModelToken(WhatsAppAccount.name), useValue: mockModel },
        { provide: WhatsAppService, useValue: mockWa },
        { provide: WhatsAppOAuthService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    service = module.get(WhatsAppAccountsService);
  });

  it('informa si el servidor tiene WAHA para conectar por QR', () => {
    expect(service.qrConnectConfig()).toEqual({ available: true });
    env.WAHA_API_URL = ' ';
    expect(service.qrConnectConfig()).toEqual({ available: false });
  });

  it('crea la cuenta con sesión propia y sin guardar la URL ni la clave', async () => {
    const created = (await service.connectViaQr(
      tenantId,
      '  Ventas  ',
    )) as unknown as Record<string, unknown>;

    expect(created).toMatchObject({
      label: 'Ventas',
      provider: 'waha',
      managed: true,
      active: true,
      isDefault: true,
    });
    expect(created.wahaSession).toMatch(/^maya_[0-9a-f]{16}$/);
    expect(created).not.toHaveProperty('wahaApiUrl');
    expect(created).not.toHaveProperty('wahaApiKey');
  });

  it('dos cuentas nunca comparten sesión', async () => {
    const a = (await service.connectViaQr(tenantId)) as unknown as {
      wahaSession: string;
      label: string;
    };
    const b = (await service.connectViaQr(tenantId)) as unknown as {
      wahaSession: string;
    };
    expect(a.label).toBe('WhatsApp (QR)');
    expect(a.wahaSession).not.toBe(b.wahaSession);
  });

  it('sin WAHA en el servidor no deja crear la cuenta', async () => {
    env.WAHA_API_URL = undefined;
    await expect(service.connectViaQr(tenantId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it('limita las cuentas por QR de una empresa', async () => {
    mockModel.countDocuments.mockReturnValue(exec(5));
    await expect(service.connectViaQr(tenantId)).rejects.toThrow(
      'cuentas conectadas por QR',
    );
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it('la configuración de una cuenta por QR sale del servidor', () => {
    expect(service.toConfig(makeAccount())).toMatchObject({
      provider: 'waha',
      wahaApiUrl: 'https://waha.plataforma.test',
      wahaApiKey: 'clave-del-servidor',
      wahaSession: 'maya_abc',
    });
  });

  it('una cuenta manual sigue usando su propio WAHA', () => {
    const config = service.toConfig(
      makeAccount({
        managed: false,
        wahaApiUrl: 'https://waha.cliente.test',
        wahaApiKey: 'clave-del-cliente',
      }),
    );
    expect(config.wahaApiUrl).toBe('https://waha.cliente.test');
    expect(config.wahaApiKey).toBe('clave-del-cliente');
  });

  it('al editar una cuenta por QR no se puede cambiar la sesión ni el servidor', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount()));
    mockModel.findOneAndUpdate.mockReturnValue(exec(makeAccount()));

    await service.update(accountId, tenantId, {
      label: 'Nuevo nombre',
      provider: 'cloudapi',
      wahaSession: 'sesion-de-otra-empresa',
      wahaApiUrl: 'https://otro.test',
      wahaApiKey: 'x',
    });

    expect(mockModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { label: 'Nuevo nombre' },
    });
  });

  it('una cuenta manual sí puede cambiar su sesión', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount({ managed: false })));
    mockModel.findOneAndUpdate.mockReturnValue(exec(makeAccount()));

    await service.update(accountId, tenantId, { wahaSession: 'otra' });

    expect(mockModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { wahaSession: 'otra' },
    });
  });

  it('al eliminar una cuenta por QR cierra su sesión en WAHA', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount()));
    mockModel.deleteOne.mockReturnValue(exec({ deletedCount: 1 }));

    await service.remove(accountId, tenantId);

    expect(mockWa.deleteWahaSession).toHaveBeenCalledWith(
      expect.objectContaining({
        wahaApiUrl: 'https://waha.plataforma.test',
        wahaSession: 'maya_abc',
      }),
    );
    expect(mockModel.deleteOne).toHaveBeenCalled();
  });

  it('al eliminar una cuenta manual no toca el WAHA del cliente', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount({ managed: false })));
    mockModel.deleteOne.mockReturnValue(exec({ deletedCount: 1 }));

    await service.remove(accountId, tenantId);

    expect(mockWa.deleteWahaSession).not.toHaveBeenCalled();
  });

  it('guarda el número cuando el QR ya fue escaneado', async () => {
    const account = makeAccount();
    mockModel.findOne.mockReturnValue(exec(account));
    mockWa.getStatus.mockResolvedValue({
      provider: 'waha',
      configured: true,
      connected: true,
      phoneNumber: '51999888777',
    });

    const status = await service.status(accountId, tenantId);

    expect(status.connected).toBe(true);
    expect(account.phoneNumber).toBe('51999888777');
    expect(account.save).toHaveBeenCalledTimes(1);
  });

  it('mientras no esté conectada no guarda nada', async () => {
    const account = makeAccount();
    mockModel.findOne.mockReturnValue(exec(account));
    mockWa.getStatus.mockResolvedValue({
      provider: 'waha',
      configured: true,
      connected: false,
      state: 'SCAN_QR_CODE',
    });

    await service.status(accountId, tenantId);

    expect(account.save).not.toHaveBeenCalled();
  });

  it('pide el QR con el webhook de la cuenta', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount()));
    mockWa.getQr.mockResolvedValue({ qrcode: 'data:image/png;base64,AAA' });

    const qr = await service.qr(accountId, tenantId);

    expect(qr).toEqual({ qrcode: 'data:image/png;base64,AAA' });
    expect(mockWa.getQr).toHaveBeenCalledWith(
      expect.objectContaining({
        wahaApiUrl: 'https://waha.plataforma.test',
        wahaApiKey: 'clave-del-servidor',
        wahaSession: 'maya_abc',
        webhookUrl: `https://api.test/wa/webhook/waha/${accountId}`,
      }),
    );
  });
});
