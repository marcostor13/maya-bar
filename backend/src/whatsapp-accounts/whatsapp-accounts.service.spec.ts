import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { WhatsAppAccount } from './whatsapp-account.schema';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppOAuthService } from '../whatsapp/whatsapp-oauth.service';

const tenantId = String(new Types.ObjectId());
const accountId = String(new Types.ObjectId());

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const query = <T>(value: T) => ({
  sort: jest.fn().mockReturnValue(exec(value)),
  exec: jest.fn().mockResolvedValue(value),
});

const mockModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

const mockWa = {
  getStatus: jest.fn(),
  registerCloudApiWebhook: jest.fn(),
};

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(accountId),
    tenantId: new Types.ObjectId(tenantId),
    provider: 'cloudapi',
    waPhoneNumberId: '123',
    waAccessToken: 'EAAG',
    waBusinessAccountId: 'WABA1',
    waVerifyToken: 'vt',
    isDefault: false,
    ...overrides,
  } as unknown as WhatsAppAccount;
}

describe('WhatsAppAccountsService', () => {
  let service: WhatsAppAccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const env: Record<string, string> = { PUBLIC_API_URL: 'https://api.test/' };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAccountsService,
        { provide: getModelToken(WhatsAppAccount.name), useValue: mockModel },
        { provide: WhatsAppService, useValue: mockWa },
        { provide: WhatsAppOAuthService, useValue: {} },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    service = module.get(WhatsAppAccountsService);
  });

  it('solo lista cuentas de Cloud API', async () => {
    mockModel.find.mockReturnValue(query([]));
    await service.findAll(tenantId);
    expect(mockModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'cloudapi' }),
    );
  });

  it('una cuenta de otro proveedor no se encuentra', async () => {
    mockModel.findOne.mockReturnValue(exec(null));
    await expect(service.findOne(accountId, tenantId)).rejects.toThrow(
      'no encontrada',
    );
    expect(mockModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'cloudapi' }),
    );
  });

  it('la configuración lleva solo los datos de Cloud API', () => {
    expect(service.toConfig(makeAccount())).toEqual({
      provider: 'cloudapi',
      waPhoneNumberId: '123',
      waAccessToken: 'EAAG',
      waBusinessAccountId: 'WABA1',
    });
  });

  it('registra el webhook con la URL propia de la cuenta', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount()));
    mockWa.registerCloudApiWebhook.mockResolvedValue({ success: true });

    await service.configureWebhook(accountId, tenantId);

    expect(mockWa.registerCloudApiWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: `https://api.test/wa/webhook/cloud/${accountId}`,
      }),
      'vt',
    );
  });

  it('el estado viene del proveedor', async () => {
    mockModel.findOne.mockReturnValue(exec(makeAccount()));
    mockWa.getStatus.mockResolvedValue({
      provider: 'cloudapi',
      configured: true,
      connected: true,
    });
    const status = await service.status(accountId, tenantId);
    expect(status.connected).toBe(true);
  });
});
