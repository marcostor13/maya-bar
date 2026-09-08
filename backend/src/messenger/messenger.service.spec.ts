import { Test } from '@nestjs/testing';
import { MessengerService, MsConfig } from './messenger.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

describe('MessengerService', () => {
  let service: MessengerService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const config: MsConfig = {
    pageId: '102030405060708',
    pageAccessToken: 'EAAG...',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessengerService,
        { provide: MetaGraphClient, useValue: graph },
      ],
    }).compile();
    service = moduleRef.get(MessengerService);
  });

  describe('sendMessage', () => {
    it('no llama a la API sin destinatario', async () => {
      await service.sendMessage('', 'hola', config);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('modo mock: no llama a la API si falta token o Page ID', async () => {
      await service.sendMessage('123', 'hola', {});
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('envía texto al endpoint de messages de la página', async () => {
      graph.post.mockResolvedValue({ message_id: 'mid.1' });
      const id = await service.sendMessage('PSID1', 'hola', config);
      expect(id).toBe('mid.1');
      expect(graph.post).toHaveBeenCalledWith(
        `/${config.pageId}/messages`,
        expect.objectContaining({
          accessToken: config.pageAccessToken,
          json: expect.objectContaining({
            recipient: { id: 'PSID1' },
            message: { text: 'hola' },
          }),
        }),
      );
    });

    it('mapea document → file en attachments', async () => {
      graph.post.mockResolvedValue({});
      await service.sendMessage(
        'PSID1',
        '',
        config,
        'https://x/y.pdf',
        'document',
      );
      const payload = (
        graph.post.mock.calls[0] as [string, { json: { message: any } }]
      )[1].json;
      expect(payload.message.attachment.type).toBe('file');
      expect(payload.message.attachment.payload.url).toBe('https://x/y.pdf');
    });

    it('propaga el error de Meta', async () => {
      graph.post.mockRejectedValue(new MetaApiError('token expired', 401));
      await expect(service.sendMessage('PSID1', 'x', config)).rejects.toThrow(
        'token expired',
      );
    });
  });

  describe('setTyping / markSeen', () => {
    it('manda sender_action typing_on', async () => {
      graph.post.mockResolvedValue({});
      await service.setTyping(config, 'PSID1', true);
      const payload = (graph.post.mock.calls[0] as [string, { json: any }])[1]
        .json;
      expect(payload.sender_action).toBe('typing_on');
    });

    it('no rompe si Meta falla', async () => {
      graph.post.mockRejectedValue(new MetaApiError('x', 400));
      await expect(service.markSeen(config, 'PSID1')).resolves.toBeUndefined();
    });
  });

  describe('subscribeWebhook', () => {
    it('falla sin token', async () => {
      const res = await service.subscribeWebhook({});
      expect(res.success).toBe(false);
      expect(graph.post).not.toHaveBeenCalled();
    });

    it('suscribe la página a los campos de mensajería', async () => {
      graph.post.mockResolvedValue({ success: true });
      const res = await service.subscribeWebhook(config);
      expect(res.success).toBe(true);
      expect(graph.post).toHaveBeenCalledWith(
        `/${config.pageId}/subscribed_apps`,
        expect.objectContaining({
          params: {
            subscribed_fields:
              'messages,messaging_postbacks,message_echoes,messaging_seen',
          },
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

    it('conectado con el nombre de la página', async () => {
      graph.get.mockResolvedValue({ name: 'Mi Bar' });
      const res = await service.getStatus(config);
      expect(res).toEqual({
        configured: true,
        connected: true,
        name: 'Mi Bar',
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

  describe('fetchContactProfile', () => {
    it('arma el nombre a partir de first/last name', async () => {
      graph.get.mockResolvedValue({
        first_name: 'Ana',
        last_name: 'Pérez',
        profile_pic: 'https://x/p.jpg',
      });
      const res = await service.fetchContactProfile('PSID1', config);
      expect(res).toEqual({ name: 'Ana Pérez', avatar: 'https://x/p.jpg' });
    });

    it('devuelve vacío si Meta no da el perfil', async () => {
      graph.get.mockRejectedValue(new MetaApiError('no access', 403));
      const res = await service.fetchContactProfile('PSID1', config);
      expect(res).toEqual({});
    });
  });
});
