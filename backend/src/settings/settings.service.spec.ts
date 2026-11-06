import { Types } from 'mongoose';
import { SettingsService } from './settings.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();

function buildQuery(result: unknown) {
  return { exec: jest.fn().mockResolvedValue(result) };
}

const accountConfig = () => ({
  provider: 'cloud_api',
  waPhoneNumberId: 'pn-1',
  waAccessToken: 'token-cuenta',
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('SettingsService', () => {
  let service: SettingsService;
  let configModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let wa: Record<string, jest.Mock>;
  let accounts: {
    getDefault: jest.Mock;
    findOne: jest.Mock;
    toConfig: jest.Mock;
  };
  let templateModel: { find: jest.Mock };

  beforeEach(() => {
    configModel = {
      findOne: jest.fn().mockReturnValue(buildQuery(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(buildQuery(null)),
    };
    // Ningún envío sale de verdad: el servicio de WhatsApp es un doble.
    wa = {
      getStatus: jest.fn().mockResolvedValue({ connected: true }),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendCloudApiTemplate: jest.fn().mockResolvedValue(undefined),
      formatPhone: jest.fn((phone: string) => {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 8 ? digits : '';
      }),
    };
    accounts = {
      getDefault: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockRejectedValue(new Error('no encontrada')),
      toConfig: jest.fn(),
    };
    templateModel = { find: jest.fn().mockReturnValue(buildQuery([])) };
    service = new SettingsService(
      configModel as never,
      wa as never,
      accounts as never,
      templateModel as never,
    );
  });

  function stubLegacyConfig(doc: unknown) {
    configModel.findOne.mockReturnValue(buildQuery(doc));
  }

  function stubDefaultAccount() {
    const account = { _id: new Types.ObjectId(), name: 'Principal' };
    accounts.getDefault.mockResolvedValue(account);
    accounts.toConfig.mockImplementation(() => accountConfig());
    return account;
  }

  // ─── get / save ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('busca la configuración de esa empresa', async () => {
      const doc = { whatsappProvider: 'cloudapi' };
      stubLegacyConfig(doc);

      const result = await service.get(tenantId);

      const filter = configModel.findOne.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(result).toBe(doc);
    });
  });

  describe('save', () => {
    it('hace upsert de los campos enviados sobre la empresa del usuario', async () => {
      const saved = { whatsappProvider: 'cloudapi' };
      configModel.findOneAndUpdate.mockReturnValue(buildQuery(saved));

      const result = await service.save(tenantId, {
        whatsappProvider: 'cloudapi',
      });

      const [filter, change, options] =
        configModel.findOneAndUpdate.mock.calls[0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(change.$set.tenantId.toString()).toBe(tenantId);
      expect(change.$set).toMatchObject({ whatsappProvider: 'cloudapi' });
      expect(options).toEqual({ upsert: true, new: true });
      expect(result).toBe(saved);
    });
  });

  // ─── resolución de la configuración de WhatsApp ───────────────────────────

  describe('configuración de WhatsApp', () => {
    it('usa la cuenta predeterminada de la empresa cuando existe', async () => {
      const account = stubDefaultAccount();

      await service.getWaStatus(tenantId);

      expect(accounts.getDefault).toHaveBeenCalledWith(tenantId);
      expect(accounts.toConfig).toHaveBeenCalledWith(account);
      expect(wa.getStatus).toHaveBeenCalledWith(accountConfig());
      // Con cuenta no hace falta leer la configuración heredada.
      expect(configModel.findOne).not.toHaveBeenCalled();
    });

    it('sin cuenta cae a la configuración heredada de la empresa', async () => {
      stubLegacyConfig({
        whatsappProvider: 'cloudapi',
        waPhoneNumberId: 'pn-9',
        waAccessToken: 'token-viejo',
      });

      await service.getWaStatus(tenantId);

      expect(configModel.findOne.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );
      expect(wa.getStatus).toHaveBeenCalledWith({
        provider: 'cloudapi',
        waPhoneNumberId: 'pn-9',
        waAccessToken: 'token-viejo',
      });
    });

    it('un proveedor heredado que no es Cloud API queda sin proveedor', async () => {
      stubLegacyConfig({ whatsappProvider: 'legacy' });

      await service.getWaStatus(tenantId);

      expect(wa.getStatus.mock.calls[0][0].provider).toBe('none');
    });

    it('sin cuenta ni configuración no hay proveedor', async () => {
      await service.getWaStatus(tenantId);

      expect(wa.getStatus).toHaveBeenCalledWith({
        provider: 'none',
        waPhoneNumberId: undefined,
        waAccessToken: undefined,
      });
    });
  });

  // ─── envíos ─────────────────────────────────────────────────────────────────

  describe('sendWhatsApp', () => {
    it('envía con la configuración de la empresa y el adjunto', async () => {
      stubDefaultAccount();

      await service.sendWhatsApp(
        '51999888777',
        'Hola',
        tenantId,
        'https://cdn.test/a.jpg',
        'image',
      );

      expect(accounts.getDefault).toHaveBeenCalledWith(tenantId);
      expect(wa.sendMessage).toHaveBeenCalledWith(
        '51999888777',
        'Hola',
        accountConfig(),
        'https://cdn.test/a.jpg',
        'image',
      );
    });

    it('si el proveedor falla, el error llega a quien envía', async () => {
      wa.sendMessage.mockRejectedValue(new Error('Meta caído'));

      await expect(
        service.sendWhatsApp('51999888777', 'Hola', tenantId),
      ).rejects.toThrow('Meta caído');
    });
  });

  describe('sendWhatsAppTemplate', () => {
    it('envía la plantilla con sus variables y la configuración de la empresa', async () => {
      stubDefaultAccount();
      const header = { type: 'image', url: 'https://cdn.test/a.jpg' };

      await service.sendWhatsAppTemplate(
        '51999888777',
        'bienvenida',
        'es',
        ['Ana', 'Maya'],
        tenantId,
        header as never,
      );

      expect(accounts.getDefault).toHaveBeenCalledWith(tenantId);
      expect(wa.sendCloudApiTemplate).toHaveBeenCalledWith(
        '51999888777',
        'bienvenida',
        'es',
        ['Ana', 'Maya'],
        accountConfig(),
        header,
      );
    });

    it('sale desde la cuenta dueña de la plantilla aunque la predeterminada sea otra', async () => {
      const other = { _id: new Types.ObjectId(), provider: 'cloudapi' };
      const cloud = {
        _id: new Types.ObjectId(),
        provider: 'cloudapi',
        active: true,
      };
      accounts.getDefault.mockResolvedValue(other);
      accounts.findOne.mockResolvedValue(cloud);
      accounts.toConfig.mockImplementation((a: { _id: Types.ObjectId }) =>
        a === cloud ? accountConfig() : { provider: 'cloudapi' },
      );
      templateModel.find.mockReturnValue(
        buildQuery([{ accountId: cloud._id, language: 'es' }]),
      );

      await service.sendWhatsAppTemplate(
        '51999888777',
        'bienvenida',
        'es',
        [],
        tenantId,
      );

      expect(accounts.findOne).toHaveBeenCalledWith(
        String(cloud._id),
        tenantId,
      );
      expect(wa.sendCloudApiTemplate).toHaveBeenCalledWith(
        '51999888777',
        'bienvenida',
        'es',
        [],
        accountConfig(),
        undefined,
      );
    });

    it('usa la predeterminada si también tiene la plantilla', async () => {
      const account = stubDefaultAccount() as Record<string, unknown>;
      account.provider = 'cloudapi';
      templateModel.find.mockReturnValue(
        buildQuery([
          { accountId: new Types.ObjectId(), language: 'es' },
          { accountId: account._id, language: 'es' },
        ]),
      );

      await service.sendWhatsAppTemplate(
        '51999888777',
        'bienvenida',
        'es',
        [],
        tenantId,
      );

      expect(accounts.findOne).not.toHaveBeenCalled();
      expect(accounts.toConfig).toHaveBeenCalledWith(account);
    });
  });
});
