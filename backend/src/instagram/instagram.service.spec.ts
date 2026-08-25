import { Test } from '@nestjs/testing';
import { InstagramService, IgConfig } from './instagram.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

describe('InstagramService', () => {
  let service: InstagramService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const config: IgConfig = {
    igBusinessAccountId: '17841400000000000',
    pageAccessToken: 'IGAAT...',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstagramService,
        { provide: MetaGraphClient, useValue: graph },
      ],
    }).compile();
    service = moduleRef.get(InstagramService);
  });

  describe('sendMessage', () => {
    it('no llama a la API sin destinatario', async () => {
      await service.sendMessage('', 'hola', config);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('modo mock: no llama a la API si falta token o IG ID', async () => {
      await service.sendMessage('123', 'hola', {});
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('envía texto al endpoint de messages de la cuenta', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage('IGSID1', 'hola', config);
      expect(graph.post).toHaveBeenCalledWith(
        `/${config.igBusinessAccountId}/messages`,
        expect.objectContaining({
          host: 'https://graph.instagram.com',
          accessToken: config.pageAccessToken,
          json: expect.objectContaining({
            recipient: { id: 'IGSID1' },
            message: { text: 'hola' },
          }),
        }),
      );
    });

    it('mapea document → file en attachments', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage(
        'IGSID1',
        '',
        config,
        'https://x/y.pdf',
        'document',
      );
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.message.attachment.type).toBe('file');
      expect(payload.message.attachment.payload.url).toBe('https://x/y.pdf');
    });

    it('propaga el error de Meta', async () => {
      graph.post.mockRejectedValue(new MetaApiError('token expired', 401));
      await expect(service.sendMessage('IGSID1', 'x', config)).rejects.toThrow(
        'token expired',
      );
    });
  });

  describe('subscribeWebhook', () => {
    it('falla sin token', async () => {
      const res = await service.subscribeWebhook({});
      expect(res.success).toBe(false);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('suscribe messages con éxito', async () => {
      graph.post.mockResolvedValue({ success: true });
      const res = await service.subscribeWebhook(config);
      expect(res.success).toBe(true);
      expect(graph.post).toHaveBeenCalledWith(
        '/me/subscribed_apps',
        expect.objectContaining({
          params: { subscribed_fields: 'messages' },
        }),
      );
    });

    it('devuelve el mensaje de error de Meta sin lanzar', async () => {
      graph.post.mockRejectedValue(new MetaApiError('no permission', 403));
      const res = await service.subscribeWebhook(config);
      expect(res).toEqual({ success: false, message: 'no permission' });
    });
  });

  describe('getStatus', () => {
    it('reporta no configurado si faltan credenciales', async () => {
      const res = await service.getStatus({});
      expect(res).toMatchObject({ configured: false, connected: false });
    });

    it('conectado con username', async () => {
      graph.get.mockResolvedValue({ username: 'mibar' });
      const res = await service.getStatus(config);
      expect(res).toEqual({
        configured: true,
        connected: true,
        username: 'mibar',
      });
    });

    it('desconectado con el mensaje de error de Meta', async () => {
      graph.get.mockRejectedValue(
        new MetaApiError('Unsupported get request', 400),
      );
      const res = await service.getStatus(config);
      expect(res).toEqual({
        configured: true,
        connected: false,
        error: 'Unsupported get request',
      });
    });
  });
});
