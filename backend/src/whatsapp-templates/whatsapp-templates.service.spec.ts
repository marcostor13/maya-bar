import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { WaTemplate } from './wa-template.schema';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

const tenantId = new Types.ObjectId().toString();
const accountId = new Types.ObjectId().toString();

const cloudAccount = {
  _id: accountId,
  label: 'Línea Reservas',
  provider: 'cloudapi',
  waAccessToken: 'tok',
  waBusinessAccountId: 'waba1',
  active: true,
};

function query(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

describe('WhatsAppTemplatesService', () => {
  let service: WhatsAppTemplatesService;
  let graph: {
    get: jest.Mock;
    post: jest.Mock;
    delete: jest.Mock;
    postBinary: jest.Mock;
  };
  let model: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
    create: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };
  let accounts: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    graph = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      postBinary: jest.fn(),
    };
    model = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteMany: jest.fn().mockReturnValue(query(null)),
      create: jest.fn().mockImplementation((doc: unknown) => doc),
      findByIdAndDelete: jest.fn().mockReturnValue(query(null)),
    };
    accounts = {
      findAll: jest.fn().mockResolvedValue([cloudAccount]),
      findOne: jest.fn().mockResolvedValue(cloudAccount),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppTemplatesService,
        { provide: getModelToken(WaTemplate.name), useValue: model },
        { provide: WhatsAppAccountsService, useValue: accounts },
        { provide: MetaGraphClient, useValue: graph },
        { provide: ConfigService, useValue: { get: () => 'app-123' } },
      ],
    }).compile();

    service = moduleRef.get(WhatsAppTemplatesService);
  });

  // ── Cuentas ──

  describe('listAccounts', () => {
    it('marca ready=false cuando falta el token o el WABA', async () => {
      accounts.findAll.mockResolvedValue([
        cloudAccount,
        { ...cloudAccount, _id: 'x', label: 'Sin token', waAccessToken: '' },
        { ...cloudAccount, _id: 'y', label: 'WAHA', provider: 'waha' },
      ]);
      const list = await service.listAccounts(tenantId);
      expect(list).toHaveLength(2); // la de WAHA se descarta
      expect(list[0].ready).toBe(true);
      expect(list[1].ready).toBe(false);
    });
  });

  describe('resolución de cuenta', () => {
    it('rechaza cuentas WAHA', async () => {
      accounts.findOne.mockResolvedValue({ ...cloudAccount, provider: 'waha' });
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Hola',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('avisa cuando la cuenta no tiene credenciales de Cloud API', async () => {
      accounts.findOne.mockResolvedValue({
        ...cloudAccount,
        waAccessToken: '',
      });
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Hola',
        }),
      ).rejects.toThrow(/Access Token o WABA ID/);
    });
  });

  // ── Componentes ──

  describe('create', () => {
    beforeEach(() => graph.post.mockResolvedValue({ id: 'meta-1' }));

    it('manda los componentes con los ejemplos del cuerpo', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'promo_verano',
        category: 'MARKETING',
        language: 'es',
        body: 'Hola {{1}}, tienes {{2}} de descuento',
        bodyExamples: ['Marcos', '20%'],
        footer: 'Responde BAJA para salir',
      });

      const json = graph.post.mock.calls[0][1].json as {
        components: Record<string, unknown>[];
        allow_category_change: boolean;
      };
      expect(graph.post.mock.calls[0][0]).toBe('/waba1/message_templates');
      expect(json.components).toEqual([
        {
          type: 'BODY',
          text: 'Hola {{1}}, tienes {{2}} de descuento',
          example: { body_text: [['Marcos', '20%']] },
        },
        { type: 'FOOTER', text: 'Responde BAJA para salir' },
      ]);
      expect(json.allow_category_change).toBe(true);
    });

    it('exige un ejemplo por cada variable del cuerpo', async () => {
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Hola {{1}} y {{2}}',
          bodyExamples: ['Marcos'],
        }),
      ).rejects.toThrow(/2 variable/);
    });

    it('construye la cabecera de texto con su ejemplo', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'UTILITY',
        language: 'es',
        body: 'Cuerpo',
        header: { format: 'TEXT', text: 'Hola {{1}}', example: 'Marcos' },
      });
      const json = graph.post.mock.calls[0][1].json as {
        components: Record<string, unknown>[];
      };
      expect(json.components[0]).toEqual({
        type: 'HEADER',
        format: 'TEXT',
        text: 'Hola {{1}}',
        example: { header_text: ['Marcos'] },
      });
    });

    it('rechaza cabeceras de texto con más de una variable', async () => {
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'UTILITY',
          language: 'es',
          body: 'Cuerpo',
          header: { format: 'TEXT', text: '{{1}} y {{2}}', example: 'x' },
        }),
      ).rejects.toThrow(/una variable/);
    });

    it('sube el archivo de la cabecera multimedia y usa el handle', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => 'image/png' },
      });
      graph.post
        .mockResolvedValueOnce({ id: 'upload:1' }) // sesión de subida
        .mockResolvedValueOnce({ id: 'meta-1' }); // creación de la plantilla
      graph.postBinary.mockResolvedValue({ h: 'handle-abc' });

      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'MARKETING',
        language: 'es',
        body: 'Cuerpo',
        header: { format: 'IMAGE', mediaUrl: 'https://s3/x.png' },
      });

      expect(graph.post.mock.calls[0][0]).toBe('/app-123/uploads');
      const json = graph.post.mock.calls[1][1].json as {
        components: Record<string, unknown>[];
      };
      expect(json.components[0]).toEqual({
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: ['handle-abc'] },
      });
    });

    it('exige archivo en las cabeceras multimedia', async () => {
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Cuerpo',
          header: { format: 'IMAGE' },
        }),
      ).rejects.toThrow(/archivo de ejemplo/);
    });

    it('traduce cada tipo de botón al formato de Meta', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'MARKETING',
        language: 'es',
        body: 'Cuerpo',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Quiero saber más' },
          {
            type: 'URL',
            text: 'Ver oferta',
            url: 'https://bar.com/{{1}}',
            urlExample: 'promo',
          },
          { type: 'PHONE_NUMBER', text: 'Llamar', phoneNumber: '+51999' },
          { type: 'COPY_CODE', example: 'PROMO25' },
        ],
      });
      const json = graph.post.mock.calls[0][1].json as {
        components: { type: string; buttons?: unknown[] }[];
      };
      const buttons = json.components.find(
        (c) => c.type === 'BUTTONS',
      )!.buttons;
      expect(buttons).toEqual([
        { type: 'QUICK_REPLY', text: 'Quiero saber más' },
        {
          type: 'URL',
          text: 'Ver oferta',
          url: 'https://bar.com/{{1}}',
          example: ['promo'],
        },
        { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+51999' },
        { type: 'COPY_CODE', example: 'PROMO25' },
      ]);
    });

    it('exige ejemplo en los botones de URL con variable', async () => {
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Cuerpo',
          buttons: [{ type: 'URL', text: 'Ver', url: 'https://bar.com/{{1}}' }],
        }),
      ).rejects.toThrow(/variable de la URL/);
    });

    it('guarda la plantilla local ligada a la cuenta', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'MARKETING',
        language: 'es',
        body: 'Cuerpo',
      });
      const doc = model.create.mock.calls[0][0] as {
        accountId: Types.ObjectId;
        metaId: string;
        status: string;
      };
      expect(String(doc.accountId)).toBe(accountId);
      expect(doc.metaId).toBe('meta-1');
      expect(doc.status).toBe('PENDING');
    });

    it('traduce los errores de Meta a BadRequest', async () => {
      graph.post.mockRejectedValue(new MetaApiError('nombre repetido', 400));
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Cuerpo',
        }),
      ).rejects.toThrow(/Meta API 400: nombre repetido/);
    });
  });

  describe('plantillas de autenticación', () => {
    beforeEach(() => graph.post.mockResolvedValue({ id: 'meta-auth' }));

    it('construye los componentes que pide Meta, sin cuerpo libre', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'codigo_verificacion',
        category: 'AUTHENTICATION',
        language: 'es',
        authentication: {
          otpType: 'COPY_CODE',
          addSecurityRecommendation: true,
          codeExpirationMinutes: 10,
          buttonText: 'Copiar código',
        },
      });

      const json = graph.post.mock.calls[0][1].json as {
        components: Record<string, unknown>[];
      };
      expect(json.components).toEqual([
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 10 },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' },
          ],
        },
      ]);
    });

    it('el autorrelleno exige paquete y hash de firma', async () => {
      await expect(
        service.create(tenantId, {
          accountId,
          name: 'codigo',
          category: 'AUTHENTICATION',
          language: 'es',
          authentication: { otpType: 'ONE_TAP' },
        }),
      ).rejects.toThrow(/paquete Android/);
    });

    it('manda los datos de la app en ONE_TAP', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'codigo',
        category: 'AUTHENTICATION',
        language: 'es',
        authentication: {
          otpType: 'ONE_TAP',
          packageName: 'com.bar.app',
          signatureHash: 'K8a',
          autofillText: 'Autorrellenar',
        },
      });
      const json = graph.post.mock.calls[0][1].json as {
        components: { type: string; buttons?: Record<string, unknown>[] }[];
      };
      expect(json.components[1].buttons![0]).toEqual({
        type: 'OTP',
        otp_type: 'ONE_TAP',
        package_name: 'com.bar.app',
        signature_hash: 'K8a',
        autofill_text: 'Autorrellenar',
      });
    });
  });

  describe('cabeceras multimedia', () => {
    beforeEach(() => graph.post.mockResolvedValue({ id: 'meta-1' }));

    it('acepta video y documento además de imagen', async () => {
      for (const [format, mime] of [
        ['VIDEO', 'video/mp4'],
        ['DOCUMENT', 'application/pdf'],
      ] as const) {
        graph.post.mockClear();
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => new ArrayBuffer(4),
          headers: { get: () => mime },
        });
        graph.post
          .mockResolvedValueOnce({ id: 'upload:1' })
          .mockResolvedValueOnce({ id: 'meta-1' });
        graph.postBinary.mockResolvedValue({ h: `handle-${format}` });

        await service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Cuerpo',
          header: { format, mediaUrl: 'https://s3/x' },
        });

        const json = graph.post.mock.calls[1][1].json as {
          components: Record<string, unknown>[];
        };
        expect(json.components[0]).toEqual({
          type: 'HEADER',
          format,
          example: { header_handle: [`handle-${format}`] },
        });
      }
    });

    it('rechaza un tipo que Meta no admite en esa cabecera', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => new ArrayBuffer(4),
        headers: { get: () => 'image/webp' },
      });
      graph.post.mockResolvedValueOnce({ id: 'upload:1' });

      await expect(
        service.create(tenantId, {
          accountId,
          name: 'promo',
          category: 'MARKETING',
          language: 'es',
          body: 'Cuerpo',
          header: { format: 'IMAGE', mediaUrl: 'https://s3/x.webp' },
        }),
      ).rejects.toThrow(/no admite "image\/webp"/);
    });

    it('la cabecera de ubicación no lleva ejemplo', async () => {
      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'UTILITY',
        language: 'es',
        body: 'Te esperamos',
        header: { format: 'LOCATION' },
      });
      const json = graph.post.mock.calls[0][1].json as {
        components: Record<string, unknown>[];
      };
      expect(json.components[0]).toEqual({
        type: 'HEADER',
        format: 'LOCATION',
      });
    });

    it('guarda la URL del archivo para la vista previa', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => new ArrayBuffer(4),
        headers: { get: () => 'image/png' },
      });
      graph.post
        .mockResolvedValueOnce({ id: 'upload:1' })
        .mockResolvedValueOnce({ id: 'meta-1' });
      graph.postBinary.mockResolvedValue({ h: 'handle-abc' });

      await service.create(tenantId, {
        accountId,
        name: 'promo',
        category: 'MARKETING',
        language: 'es',
        body: 'Cuerpo',
        header: { format: 'IMAGE', mediaUrl: 'https://s3/x.png' },
      });

      const doc = model.create.mock.calls[0][0] as { headerMediaUrl: string };
      expect(doc.headerMediaUrl).toBe('https://s3/x.png');
    });
  });

  // ── Sincronización ──

  describe('sync', () => {
    it('refresca el espejo local y borra lo que ya no está en Meta', async () => {
      graph.get.mockResolvedValue({
        data: [
          {
            id: 'meta-1',
            name: 'promo',
            category: 'MARKETING',
            language: 'es',
            status: 'APPROVED',
            components: [
              { type: 'BODY', text: 'Hola' },
              { type: 'FOOTER', text: 'Pie' },
            ],
          },
        ],
      });
      model.findOneAndUpdate.mockReturnValue(
        query({ name: 'promo', body: 'Hola' }),
      );

      const result = await service.sync(tenantId, accountId);

      expect(result).toHaveLength(1);
      const update = model.findOneAndUpdate.mock.calls[0][1] as {
        body: string;
        footer: string;
        status: string;
      };
      expect(update.body).toBe('Hola');
      expect(update.footer).toBe('Pie');
      expect(update.status).toBe('APPROVED');
      expect(model.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ metaId: { $nin: ['meta-1'] } }),
      );
    });
  });

  // ── Edición y borrado ──

  describe('update', () => {
    it('no cambia la categoría de una plantilla aprobada', async () => {
      const template = {
        _id: 'tpl-1',
        accountId,
        metaId: 'meta-1',
        name: 'promo',
        status: 'APPROVED',
        category: 'MARKETING',
        save: jest.fn().mockImplementation(function (this: unknown) {
          return this;
        }),
      };
      model.findOne.mockReturnValue(query(template));
      graph.post.mockResolvedValue({ success: true });

      await service.update(tenantId, new Types.ObjectId().toString(), {
        category: 'UTILITY',
        body: 'Nuevo cuerpo',
      });

      const json = graph.post.mock.calls[0][1].json as Record<string, unknown>;
      expect(json.category).toBeUndefined();
      expect(template.category).toBe('MARKETING');
      expect(template.status).toBe('PENDING'); // vuelve a revisión
    });

    it('404 si la plantilla no es del tenant', async () => {
      model.findOne.mockReturnValue(query(null));
      await expect(
        service.update(tenantId, new Types.ObjectId().toString(), {
          body: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('borra en Meta por hsm_id y luego en local', async () => {
      const template = {
        _id: 'tpl-1',
        accountId,
        metaId: 'meta-1',
        name: 'promo',
      };
      model.findOne.mockReturnValue(query(template));
      graph.delete.mockResolvedValue({ success: true });

      await service.remove(tenantId, new Types.ObjectId().toString());

      expect(graph.delete).toHaveBeenCalledWith(
        '/waba1/message_templates',
        expect.objectContaining({
          params: { hsm_id: 'meta-1', name: 'promo' },
        }),
      );
      expect(model.findByIdAndDelete).toHaveBeenCalledWith('tpl-1');
    });

    it('limpia el espejo local aunque Meta falle', async () => {
      model.findOne.mockReturnValue(
        query({ _id: 'tpl-1', accountId, metaId: 'meta-1', name: 'promo' }),
      );
      graph.delete.mockRejectedValue(new MetaApiError('no existe', 404));

      await service.remove(tenantId, new Types.ObjectId().toString());

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('tpl-1');
    });
  });
});
