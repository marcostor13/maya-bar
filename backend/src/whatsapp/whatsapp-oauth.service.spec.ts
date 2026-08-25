import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOAuthService } from './whatsapp-oauth.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

describe('WhatsAppOAuthService', () => {
  let service: WhatsAppOAuthService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const env: Record<string, string> = {
    FACEBOOK_APP_ID: 'app1',
    FACEBOOK_APP_SECRET: 'shh',
    FACEBOOK_LOGIN_CONFIG_ID: 'cfg1',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppOAuthService,
        { provide: MetaGraphClient, useValue: graph },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppOAuthService);
  });

  describe('exchangeCodeForToken', () => {
    it('canjea el code por token corto vía /oauth/access_token', async () => {
      graph.get.mockResolvedValue({ access_token: 't1' });
      const res = await service.exchangeCodeForToken('code123');
      expect(res).toEqual({ accessToken: 't1' });
      expect(graph.get).toHaveBeenCalledWith(
        '/oauth/access_token',
        expect.objectContaining({
          params: {
            client_id: 'app1',
            client_secret: 'shh',
            code: 'code123',
          },
        }),
      );
    });

    it('traduce el error de Meta a BadRequest con su mensaje', async () => {
      graph.get.mockRejectedValue(
        new MetaApiError('Invalid verification code format', 400),
      );
      await expect(service.exchangeCodeForToken('bad')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.exchangeCodeForToken('bad')).rejects.toThrow(
        'Invalid verification code format',
      );
    });

    it('falla si la respuesta no trae token', async () => {
      graph.get.mockResolvedValue({});
      await expect(service.exchangeCodeForToken('x')).rejects.toThrow(
        'No se pudo canjear el código de autorización',
      );
    });
  });

  describe('exchangeForLongLivedToken', () => {
    it('extiende el token con fb_exchange_token y usa 60 días por defecto', async () => {
      graph.get.mockResolvedValue({ access_token: 'long1' });
      const res = await service.exchangeForLongLivedToken('short1');
      expect(res).toEqual({ accessToken: 'long1', expiresIn: 5184000 });
      expect(graph.get).toHaveBeenCalledWith(
        '/oauth/access_token',
        expect.objectContaining({
          params: expect.objectContaining({
            grant_type: 'fb_exchange_token',
            fb_exchange_token: 'short1',
          }),
        }),
      );
    });

    it('respeta el expires_in de Meta', async () => {
      graph.get.mockResolvedValue({ access_token: 'long2', expires_in: 999 });
      const res = await service.exchangeForLongLivedToken('short1');
      expect(res).toEqual({ accessToken: 'long2', expiresIn: 999 });
    });

    it('traduce el error de Meta a BadRequest', async () => {
      graph.get.mockRejectedValue(new MetaApiError('token expired', 401));
      await expect(service.exchangeForLongLivedToken('x')).rejects.toThrow(
        'token expired',
      );
    });
  });

  describe('registerPhoneNumber', () => {
    it('registra el número con el PIN interno y token por header', async () => {
      graph.post.mockResolvedValue({ success: true });
      const res = await service.registerPhoneNumber('123456', 'tok');
      expect(res).toEqual({ success: true });
      expect(graph.post).toHaveBeenCalledWith(
        '/123456/register',
        expect.objectContaining({
          accessToken: 'tok',
          json: { messaging_product: 'whatsapp', pin: '112233' },
        }),
      );
    });

    it('devuelve el mensaje de error de Meta sin lanzar', async () => {
      graph.post.mockRejectedValue(new MetaApiError('pin mismatch', 400));
      const res = await service.registerPhoneNumber('123456', 'tok');
      expect(res).toEqual({ success: false, message: 'pin mismatch' });
    });
  });

  describe('fetchPhoneNumberInfo', () => {
    it('devuelve nombre y número verificados', async () => {
      graph.get.mockResolvedValue({
        display_phone_number: '+51 999',
        verified_name: 'Mi Bar',
      });
      const res = await service.fetchPhoneNumberInfo('123456', 'tok');
      expect(res).toEqual({
        displayPhoneNumber: '+51 999',
        verifiedName: 'Mi Bar',
      });
      expect(graph.get).toHaveBeenCalledWith(
        '/123456',
        expect.objectContaining({
          accessToken: 'tok',
          params: { fields: 'display_phone_number,verified_name' },
        }),
      );
    });

    it('devuelve vacío si Meta falla (el caller decide el fallback)', async () => {
      graph.get.mockRejectedValue(new MetaApiError('nope', 400));
      expect(await service.fetchPhoneNumberInfo('123456', 'tok')).toEqual({});
    });
  });
});
