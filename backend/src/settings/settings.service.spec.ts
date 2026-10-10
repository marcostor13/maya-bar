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
  let accounts: { getDefault: jest.Mock; toConfig: jest.Mock };

  beforeEach(() => {
    configModel = {
      findOne: jest.fn().mockReturnValue(buildQuery(null)),
      findOneAndUpdate: jest.fn().mockReturnValue(buildQuery(null)),
    };
    // Ningún envío sale de verdad: el servicio de WhatsApp es un doble.
    wa = {
      getStatus: jest.fn().mockResolvedValue({ connected: true }),
      getQr: jest.fn().mockResolvedValue({ qrcode: 'data:image/png;base64,x' }),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendCloudApiTemplate: jest.fn().mockResolvedValue(undefined),
      formatPhone: jest.fn((phone: string) => {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 8 ? digits : '';
      }),
    };
    accounts = {
      getDefault: jest.fn().mockResolvedValue(null),
      toConfig: jest.fn(),
    };
    service = new SettingsService(
      configModel as never,
      wa as never,
      accounts as never,
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
      const doc = { waDailyLimit: 80 };
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
      const saved = { waDailyLimit: 120 };
      configModel.findOneAndUpdate.mockReturnValue(buildQuery(saved));

      const result = await service.save(tenantId, {
        waDailyLimit: 120,
        whatsappProvider: 'waha',
      });

      const [filter, change, options] =
        configModel.findOneAndUpdate.mock.calls[0];
      expect(Object.keys(filter)).toEqual(['tenantId']);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(change.$set.tenantId.toString()).toBe(tenantId);
      expect(change.$set).toMatchObject({
        waDailyLimit: 120,
        whatsappProvider: 'waha',
      });
      expect(options).toEqual({ upsert: true, new: true });
      expect(result).toBe(saved);
    });
  });

  // ─── getWaDailyLimit ───────────────────────────────────────────────────────

  describe('getWaDailyLimit', () => {
    it('sin configuración usa 50 mensajes al día', async () => {
      await expect(service.getWaDailyLimit(tenantId)).resolves.toBe(50);
    });

    it('con configuración pero sin límite también usa 50', async () => {
      stubLegacyConfig({ whatsappProvider: 'waha' });

      await expect(service.getWaDailyLimit(tenantId)).resolves.toBe(50);
    });

    it('respeta el límite de la empresa, incluido 0', async () => {
      stubLegacyConfig({ waDailyLimit: 200 });
      await expect(service.getWaDailyLimit(tenantId)).resolves.toBe(200);

      stubLegacyConfig({ waDailyLimit: 0 });
      await expect(service.getWaDailyLimit(tenantId)).resolves.toBe(0);
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
        whatsappProvider: 'waha',
        wahaApiUrl: 'https://waha.test',
        wahaApiKey: 'clave',
        wahaSession: 'ventas',
        waPhoneNumberId: 'pn-9',
        waAccessToken: 'token-viejo',
      });

      await service.getWaQr(tenantId);

      expect(configModel.findOne.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );
      expect(wa.getQr).toHaveBeenCalledWith({
        provider: 'waha',
        wahaApiUrl: 'https://waha.test',
        wahaApiKey: 'clave',
        wahaSession: 'ventas',
        waPhoneNumberId: 'pn-9',
        waAccessToken: 'token-viejo',
      });
    });

    it('sin cuenta ni configuración no hay proveedor', async () => {
      await service.getWaStatus(tenantId);

      expect(wa.getStatus).toHaveBeenCalledWith({
        provider: 'none',
        wahaApiUrl: undefined,
        wahaApiKey: undefined,
        wahaSession: 'default',
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

    it('forceProvider cambia el proveedor solo para ese envío', async () => {
      stubDefaultAccount();

      await service.sendWhatsApp(
        '51999888777',
        'Hola',
        tenantId,
        undefined,
        undefined,
        'waha',
      );

      expect(wa.sendMessage.mock.calls[0][2]).toEqual({
        ...accountConfig(),
        provider: 'waha',
      });
    });

    it('si el proveedor falla, el error llega a quien envía', async () => {
      wa.sendMessage.mockRejectedValue(new Error('WAHA caído'));

      await expect(
        service.sendWhatsApp('51999888777', 'Hola', tenantId),
      ).rejects.toThrow('WAHA caído');
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
  });

  // ─── testWaha ───────────────────────────────────────────────────────────────

  describe('testWaha', () => {
    const waha = {
      whatsappProvider: 'cloud_api',
      wahaApiUrl: 'https://waha.test',
      wahaSession: 'ventas',
    };

    it('número inválido: informa del error y no envía', async () => {
      stubLegacyConfig(waha);

      const result = await service.testWaha(tenantId, '12345');

      expect(result).toEqual({
        success: false,
        provider: 'waha',
        wahaApiUrl: 'https://waha.test',
        wahaSession: 'ventas',
        formattedPhone: '12345',
        error: 'Número inválido (< 8 dígitos)',
      });
      expect(wa.sendMessage).not.toHaveBeenCalled();
    });

    it('sin URL de WAHA configurada no intenta enviar', async () => {
      const result = await service.testWaha(tenantId, '999 888 777');

      expect(result.success).toBe(false);
      expect(result.formattedPhone).toBe('999888777');
      expect(result.error).toContain('URL de WAHA no configurada');
      expect(wa.sendMessage).not.toHaveBeenCalled();
    });

    it('envía el mensaje de prueba forzando WAHA aunque el proveedor sea otro', async () => {
      stubLegacyConfig(waha);

      const result = await service.testWaha(tenantId, '+51 999 888 777');

      const [to, body, config] = wa.sendMessage.mock.calls[0];
      expect(to).toBe('51999888777');
      expect(body).toContain('Mensaje de prueba');
      expect(config).toMatchObject({
        provider: 'waha',
        wahaApiUrl: 'https://waha.test',
        wahaSession: 'ventas',
      });
      expect(result).toEqual({
        success: true,
        provider: 'waha',
        wahaApiUrl: 'https://waha.test',
        wahaSession: 'ventas',
        formattedPhone: '51999888777',
      });
    });

    it('si WAHA falla devuelve el error en vez de lanzarlo', async () => {
      stubLegacyConfig(waha);
      wa.sendMessage.mockRejectedValue(new Error('401 Unauthorized'));

      const result = await service.testWaha(tenantId, '999888777');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error: 401 Unauthorized');
      expect(result.formattedPhone).toBe('999888777');
    });
  });
});
