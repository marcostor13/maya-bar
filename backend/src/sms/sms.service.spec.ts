import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SmsService } from './sms.service';
import { SmsConfig } from './sms-config.schema';
import { SaveSmsConfigDto } from './dto/sms.dto';
import { SecretBox } from '../shared/secret-box';
import * as network from '../shared/network';

const SECRET = 'clave-de-pruebas';
const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('SmsService', () => {
  const tenantId = new Types.ObjectId().toString();
  let service: SmsService;
  let model: Record<string, jest.Mock>;
  let fetchMock: jest.Mock;
  const box = new SecretBox(SECRET);

  const dto = (over: Partial<SaveSmsConfigDto> = {}): SaveSmsConfigDto => ({
    enabled: true,
    name: 'Proveedor',
    url: 'https://api.proveedor.com/sms',
    method: 'POST',
    headers: [{ key: 'Authorization', value: 'Bearer {secret:api_key}' }],
    bodyType: 'json',
    body: '{"to":"{to}","text":"{message}"}',
    from: 'MAYA',
    secrets: [{ name: 'API_KEY', value: 'k-123' }],
    ...over,
  });

  const stored = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    name: 'Proveedor',
    url: 'https://api.proveedor.com/sms',
    method: 'POST',
    headers: [{ key: 'Authorization', value: 'Bearer {secret:api_key}' }],
    bodyType: 'json',
    body: '{"to":"{to}","from":"{from}","text":"{message}"}',
    from: 'MAYA',
    secrets: [{ name: 'api_key', sealed: box.encrypt('k-123') }],
    successPath: '',
    successValue: '',
    idPath: 'id',
    defaultCountryCode: '51',
    ratePerMinute: 60,
    ...over,
  });

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () =>
        Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(network, 'assertPublicHost').mockResolvedValue(undefined);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    model = {
      findOne: jest.fn(() => exec(null)),
      findOneAndUpdate: jest.fn(
        (_f, update: { $set: Record<string, unknown> }) =>
          exec({ ...update.$set }),
      ),
    };
    const mod = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: getModelToken(SmsConfig.name), useValue: model },
        {
          provide: ConfigService,
          useValue: { get: () => undefined, getOrThrow: () => SECRET },
        },
      ],
    }).compile();
    service = mod.get(SmsService);
  });

  describe('saveConfig', () => {
    it('cifra las credenciales y nunca las devuelve', async () => {
      const view = await service.saveConfig(tenantId, dto());

      const [filter, update] = model.findOneAndUpdate.mock.calls[0];
      expect(filter.tenantId.toString()).toBe(tenantId);
      const [secret] = update.$set.secrets;
      expect(secret.name).toBe('api_key');
      expect(secret.sealed).not.toContain('k-123');
      expect(box.decrypt(secret.sealed)).toBe('k-123');

      expect(view.secrets).toEqual([{ name: 'api_key', hasValue: true }]);
      expect(JSON.stringify(view)).not.toContain('k-123');
      expect(view.missingSecrets).toEqual([]);
    });

    it('una credencial enviada vacía conserva la que ya estaba', async () => {
      const sealed = box.encrypt('anterior');
      model.findOne.mockReturnValue(
        exec({ secrets: [{ name: 'api_key', sealed }] }),
      );

      await service.saveConfig(
        tenantId,
        dto({ secrets: [{ name: 'api_key' }] }),
      );

      expect(model.findOneAndUpdate.mock.calls[0][1].$set.secrets).toEqual([
        { name: 'api_key', sealed },
      ]);
    });

    it('avisa de las credenciales que la petición usa y aún no tienen valor', async () => {
      const view = await service.saveConfig(tenantId, dto({ secrets: [] }));
      expect(view.missingSecrets).toEqual(['api_key']);
    });

    it('rechaza una URL que no es https o que apunta a la red interna', async () => {
      await expect(
        service.saveConfig(
          tenantId,
          dto({ url: 'http://api.proveedor.com/sms' }),
        ),
      ).rejects.toThrow(/https/);

      jest
        .spyOn(network, 'assertPublicHost')
        .mockRejectedValue(new Error('privada'));
      await expect(
        service.saveConfig(
          tenantId,
          dto({ url: 'https://169.254.169.254/latest' }),
        ),
      ).rejects.toThrow(/dirección pública/);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rechaza un cuerpo JSON mal formado', async () => {
      await expect(
        service.saveConfig(tenantId, dto({ body: '{"to":"{to}",}' })),
      ).rejects.toThrow(/JSON válido/);
    });
  });

  describe('envío', () => {
    it('sin proveedor activo no se puede enviar', async () => {
      await expect(service.requireConfig(tenantId)).rejects.toThrow(
        BadRequestException,
      );
      model.findOne.mockReturnValue(exec(stored({ enabled: false })));
      await expect(service.requireConfig(tenantId)).rejects.toThrow(
        /proveedor de SMS/,
      );
      expect(await service.status(tenantId)).toMatchObject({
        configured: false,
      });
    });

    it('arma la petición con el secreto descifrado y devuelve el id del proveedor', async () => {
      respond(200, { id: 'msg-9' });

      const result = await service.dispatch(
        stored() as never,
        '999 888 777',
        'Hola "Ana"',
      );

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.proveedor.com/sms');
      expect(init.headers.Authorization).toBe('Bearer k-123');
      expect(JSON.parse(init.body)).toEqual({
        to: '+51999888777',
        from: 'MAYA',
        text: 'Hola "Ana"',
      });
      // Una redirección podría esquivar la comprobación de red interna.
      expect(init.redirect).toBe('error');
      expect(result).toMatchObject({ id: 'msg-9', status: 200 });
    });

    it('un código de error del proveedor es un fallo con su respuesta', async () => {
      respond(401, 'credenciales inválidas');
      await expect(
        service.dispatch(stored() as never, '+51999888777', 'x'),
      ).rejects.toThrow('El proveedor respondió 401: credenciales inválidas');
    });

    it('con campo de confirmación, un 200 que no confirma también es un fallo', async () => {
      const cfg = stored({
        successPath: 'messages.0.status',
        successValue: '0',
      });
      respond(200, { messages: [{ status: '4' }] });
      await expect(
        service.dispatch(cfg as never, '+51999888777', 'x'),
      ).rejects.toThrow(/no confirmó/);

      respond(200, { messages: [{ status: '0' }] });
      await expect(
        service.dispatch(cfg as never, '+51999888777', 'x'),
      ).resolves.toMatchObject({ status: 200 });
    });

    it('un teléfono inválido no llega a salir', async () => {
      await expect(
        service.dispatch(stored() as never, 'abc', 'x'),
      ).rejects.toThrow('Teléfono inválido');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('la prueba exige haber guardado antes y traduce el error del proveedor', async () => {
      await expect(service.test(tenantId, '+51999888777', 'x')).rejects.toThrow(
        /Guarda primero/,
      );
      model.findOne.mockReturnValue(exec(stored({ enabled: false })));
      respond(500, 'caído');
      await expect(service.test(tenantId, '+51999888777', 'x')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
