import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import type { Resend } from 'resend';
import { ResendService } from './resend.service';
import { ResendConfig } from './resend-config.schema';
import { SaveResendConfigDto } from './dto/resend.dto';
import { SecretBox } from '../shared/secret-box';

const SECRET = 'clave-de-pruebas';
const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('ResendService', () => {
  const tenantId = new Types.ObjectId().toString();
  const box = new SecretBox(SECRET);
  let model: Record<string, jest.Mock>;
  let service: ResendService;
  const api = {
    domains: { list: jest.fn() },
    emails: { send: jest.fn() },
  };
  let usedKeys: string[];

  const dto = (
    over: Partial<SaveResendConfigDto> = {},
  ): SaveResendConfigDto => ({
    enabled: true,
    apiKey: 're_abcdefgh1234',
    fromEmail: 'Hola@MiEmpresa.com',
    fromName: 'Mi Empresa',
    ...over,
  });

  const stored = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    sealedKey: box.encrypt('re_abcdefgh1234'),
    keyHint: '1234',
    fromEmail: 'hola@miempresa.com',
    fromName: 'Mi "Empresa"',
    replyTo: 'soporte@miempresa.com',
    ratePerMinute: 120,
    domains: [{ name: 'miempresa.com', status: 'verified' }],
    ...over,
  });

  const domains = (...list: [string, string][]) =>
    api.domains.list.mockResolvedValue({
      data: { data: list.map(([name, status]) => ({ name, status })) },
      error: null,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    usedKeys = [];
    model = {
      findOne: jest.fn(() => exec(null)),
      findOneAndUpdate: jest.fn(
        (_f: unknown, update: { $set: Record<string, unknown> }) =>
          exec({ ...update.$set }),
      ),
      deleteOne: jest.fn(() => exec({})),
    };
    class TestService extends ResendService {
      protected client(apiKey: string): Resend {
        usedKeys.push(apiKey);
        return api as unknown as Resend;
      }
    }
    service = new TestService(
      model as unknown as Model<ResendConfig>,
      {
        get: () => undefined,
        getOrThrow: () => SECRET,
      } as unknown as ConfigService,
    );
    domains(['miempresa.com', 'verified']);
    api.emails.send.mockResolvedValue({ data: { id: 're-1' }, error: null });
  });

  describe('saveConfig', () => {
    it('valida la key contra Resend, la cifra y nunca la devuelve', async () => {
      const view = await service.saveConfig(tenantId, dto());

      expect(usedKeys).toEqual(['re_abcdefgh1234']);
      const [filter, update] = model.findOneAndUpdate.mock.calls[0] as [
        { tenantId: Types.ObjectId },
        { $set: Record<string, string> },
      ];
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(update.$set.sealedKey).not.toContain('re_abcdefgh1234');
      expect(box.decrypt(update.$set.sealedKey)).toBe('re_abcdefgh1234');
      expect(update.$set.fromEmail).toBe('hola@miempresa.com');

      expect(view).toMatchObject({
        hasKey: true,
        keyHint: '1234',
        fromVerified: true,
      });
      expect(JSON.stringify(view)).not.toContain('re_abcdefgh1234');
    });

    it('sin key nueva conserva la guardada', async () => {
      model.findOne.mockReturnValue(exec(stored()));
      await service.saveConfig(tenantId, dto({ apiKey: '' }));
      expect(usedKeys).toEqual(['re_abcdefgh1234']);
    });

    it('sin ninguna key no guarda', async () => {
      await expect(
        service.saveConfig(tenantId, dto({ apiKey: undefined })),
      ).rejects.toThrow(/Pega la API key/);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('no deja activar un remitente cuyo dominio no está verificado', async () => {
      domains(['miempresa.com', 'pending']);
      await expect(service.saveConfig(tenantId, dto())).rejects.toThrow(
        /no está verificado/,
      );

      domains(['otra.com', 'verified']);
      await expect(service.saveConfig(tenantId, dto())).rejects.toThrow(
        /no está en tu cuenta de Resend.*otra\.com/,
      );
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('una key que Resend no reconoce se rechaza con un mensaje claro', async () => {
      api.domains.list.mockResolvedValue({
        data: null,
        error: { name: 'validation_error', message: 'API key is invalid' },
      });
      await expect(service.saveConfig(tenantId, dto())).rejects.toThrow(
        /no reconoce esa API key/,
      );
    });

    it('una key solo de envío se acepta aunque no pueda listar dominios', async () => {
      api.domains.list.mockResolvedValue({
        data: null,
        error: { name: 'restricted_api_key', message: 'restricted' },
      });
      const view = await service.saveConfig(tenantId, dto());
      expect(view.hasKey).toBe(true);
      // No se pudo comprobar el dominio: no se afirma ni que sí ni que no.
      expect(view.fromVerified).toBeNull();
    });
  });

  describe('envío', () => {
    it('sin cuenta activa no hay remitente propio', async () => {
      expect(await service.mailer(tenantId)).toBeNull();
      model.findOne.mockReturnValue(exec(stored({ enabled: false })));
      expect(await service.mailer(tenantId)).toBeNull();
      expect(await service.status(tenantId)).toMatchObject({
        configured: false,
      });
    });

    it('envía con la key, el remitente y el reply-to de la empresa', async () => {
      model.findOne.mockReturnValue(exec(stored()));
      const mailer = await service.mailer(tenantId);

      const id = await mailer!.send({
        to: 'ana@test.com',
        subject: 'Hola',
        html: '<p>x</p>',
        headers: { 'List-Unsubscribe': '<https://x>' },
      });

      expect(id).toBe('re-1');
      expect(usedKeys).toEqual(['re_abcdefgh1234']);
      expect(mailer!.ratePerMinute).toBe(120);
      expect(api.emails.send).toHaveBeenCalledWith({
        // Las comillas del nombre no llegan a la cabecera.
        from: 'Mi Empresa <hola@miempresa.com>',
        to: 'ana@test.com',
        subject: 'Hola',
        html: '<p>x</p>',
        replyTo: 'soporte@miempresa.com',
        headers: { 'List-Unsubscribe': '<https://x>' },
      });
    });

    it('un rechazo de Resend es un error con su código (para decidir el reintento)', async () => {
      model.findOne.mockReturnValue(exec(stored()));
      api.emails.send.mockResolvedValue({
        data: null,
        error: { statusCode: 429, message: 'Too many requests' },
      });
      const mailer = await service.mailer(tenantId);
      await expect(
        mailer!.send({ to: 'a@b.com', subject: 's', html: 'h' }),
      ).rejects.toThrow('Resend respondió 429: Too many requests');
    });

    it('la prueba exige haber guardado y devuelve el error de Resend legible', async () => {
      await expect(service.test(tenantId, 'yo@test.com')).rejects.toThrow(
        /Guarda primero/,
      );
      model.findOne.mockReturnValue(exec(stored({ enabled: false })));
      await expect(service.test(tenantId, 'yo@test.com')).resolves.toEqual({
        id: 're-1',
      });
      api.emails.send.mockResolvedValue({
        data: null,
        error: { statusCode: 403, message: 'domain not verified' },
      });
      await expect(service.test(tenantId, 'yo@test.com')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
