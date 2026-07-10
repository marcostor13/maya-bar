import { Test } from '@nestjs/testing';
import { WhatsAppService, WaConfig } from './whatsapp.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

/** Solo cubre los paths de Cloud API (graph.facebook.com) migrados a MetaGraphClient.
 *  Las llamadas a WAHA siguen usando fetch y no se prueban aquí. */
describe('WhatsAppService (Cloud API)', () => {
  let service: WhatsAppService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const config: WaConfig = {
    provider: 'cloudapi',
    waPhoneNumberId: 'phone1',
    waAccessToken: 'tok',
    waBusinessAccountId: 'waba1',
    webhookUrl: 'https://api.test/whatsapp/webhook',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: MetaGraphClient, useValue: graph },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppService);
  });

  describe('sendMessage', () => {
    it('no llama a la API con teléfono inválido', async () => {
      await service.sendMessage('123', 'hola', config);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('envía texto a /{phoneNumberId}/messages con token por header', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage('+51 999 888 777', 'hola', config);
      expect(graph.post).toHaveBeenCalledWith(
        '/phone1/messages',
        expect.objectContaining({
          accessToken: 'tok',
          json: {
            messaging_product: 'whatsapp',
            to: '51999888777',
            type: 'text',
            text: { body: 'hola' },
          },
        }),
      );
    });

    it('envía imagen con caption', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage(
        '51999888777',
        'mira',
        config,
        'https://x/foto.jpg',
        'image',
      );
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.type).toBe('image');
      expect(payload.image).toEqual({
        link: 'https://x/foto.jpg',
        caption: 'mira',
      });
    });

    it('envía audio sin caption', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage(
        '51999888777',
        '',
        config,
        'https://x/nota.ogg',
        'audio',
      );
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.type).toBe('audio');
      expect(payload.audio).toEqual({ link: 'https://x/nota.ogg' });
    });

    it('envía documento con filename derivado de la URL', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage(
        '51999888777',
        'la carta',
        config,
        'https://x/carta.pdf',
        'document',
      );
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.type).toBe('document');
      expect(payload.document).toEqual({
        link: 'https://x/carta.pdf',
        caption: 'la carta',
        filename: 'carta.pdf',
      });
    });

    it('traduce el MetaApiError al Error histórico "CloudAPI <status>: <msg>"', async () => {
      graph.post.mockRejectedValue(new MetaApiError('token expired', 401));
      await expect(
        service.sendMessage('51999888777', 'x', config),
      ).rejects.toThrow('CloudAPI 401: token expired');
    });
  });

  describe('sendCloudApiTemplate', () => {
    it('envía la plantilla con variables de body', async () => {
      graph.post.mockResolvedValue({});
      await service.sendCloudApiTemplate(
        '51999888777',
        'bienvenida',
        'es',
        ['Ana'],
        config,
      );
      expect(graph.post).toHaveBeenCalledWith(
        '/phone1/messages',
        expect.objectContaining({
          accessToken: 'tok',
          json: expect.objectContaining({
            messaging_product: 'whatsapp',
            to: '51999888777',
            type: 'template',
            template: {
              name: 'bienvenida',
              language: { code: 'es' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
              ],
            },
          }),
        }),
      );
    });

    it('sin variables no manda components de body', async () => {
      graph.post.mockResolvedValue({});
      await service.sendCloudApiTemplate(
        '51999888777',
        'bienvenida',
        'es',
        [],
        config,
      );
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.template.components).toEqual([]);
    });

    it('traduce el error con el prefijo de plantillas', async () => {
      graph.post.mockRejectedValue(new MetaApiError('template not found', 404));
      await expect(
        service.sendCloudApiTemplate('51999888777', 'x', 'es', [], config),
      ).rejects.toThrow('CloudAPI template 404: template not found');
    });
  });

  describe('registerCloudApiWebhook', () => {
    it('solo aplica a cuentas Cloud API', async () => {
      const res = await service.registerCloudApiWebhook({ provider: 'waha' });
      expect(res.success).toBe(false);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('suscribe la app al WABA con override_callback_uri', async () => {
      graph.post.mockResolvedValue({ success: true });
      const res = await service.registerCloudApiWebhook(config, 'vtok');
      expect(res).toEqual({
        success: true,
        message: 'Webhook suscripto correctamente',
      });
      expect(graph.post).toHaveBeenCalledWith(
        '/waba1/subscribed_apps',
        expect.objectContaining({
          accessToken: 'tok',
          json: {
            override_callback_uri: config.webhookUrl,
            verify_token: 'vtok',
          },
        }),
      );
    });

    it('devuelve el mensaje de error de Meta sin lanzar', async () => {
      graph.post.mockRejectedValue(new MetaApiError('no permission', 403));
      const res = await service.registerCloudApiWebhook(config);
      expect(res).toEqual({ success: false, message: 'no permission' });
    });
  });

  describe('getStatus (cloudapi)', () => {
    it('reporta no configurado si faltan credenciales', async () => {
      const res = await service.getStatus({ provider: 'cloudapi' });
      expect(res).toMatchObject({ configured: false, connected: false });
      expect(graph.get).not.toHaveBeenCalled();
    });

    it('conectado con número y nombre verificado', async () => {
      graph.get.mockResolvedValue({
        display_phone_number: '+51 999',
        verified_name: 'Mi Bar',
      });
      const res = await service.getStatus(config);
      expect(res).toEqual({
        provider: 'cloudapi',
        configured: true,
        connected: true,
        phoneNumber: '+51 999',
        state: 'Mi Bar',
      });
      expect(graph.get).toHaveBeenCalledWith(
        '/phone1',
        expect.objectContaining({
          accessToken: 'tok',
          params: { fields: 'display_phone_number,verified_name' },
        }),
      );
    });

    it('desconectado con el mensaje de error de Meta', async () => {
      graph.get.mockRejectedValue(
        new MetaApiError('Unsupported get request', 400),
      );
      const res = await service.getStatus(config);
      expect(res).toEqual({
        provider: 'cloudapi',
        configured: true,
        connected: false,
        error: 'Unsupported get request',
      });
    });
  });
});
