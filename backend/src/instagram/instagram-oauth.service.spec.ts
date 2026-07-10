import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramOAuthService } from './instagram-oauth.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

describe('InstagramOAuthService', () => {
  let service: InstagramOAuthService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const env: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    INSTAGRAM_APP_ID: 'app1',
    INSTAGRAM_APP_SECRET: 'shh',
    PUBLIC_API_URL: 'https://api.test',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InstagramOAuthService,
        { provide: MetaGraphClient, useValue: graph },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => env[k],
            getOrThrow: (k: string) => {
              if (!env[k]) throw new Error(`missing ${k}`);
              return env[k];
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(InstagramOAuthService);
  });

  describe('state HMAC', () => {
    it('firma y verifica el tenant del flujo', () => {
      const state = service.signState('tenant1');
      expect(service.verifyState(state)).toEqual({ tenantId: 'tenant1' });
    });

    it('rechaza un state adulterado', () => {
      const state = service.signState('tenant1');
      const [payload] = state.split('.');
      const tampered = Buffer.from(
        JSON.stringify({ tenantId: 'otro', exp: Date.now() + 60000 }),
      ).toString('base64url');
      expect(service.verifyState(`${tampered}.${state.split('.')[1]}`)).toBeNull();
      expect(service.verifyState(`${payload}.firmafalsa`)).toBeNull();
      expect(service.verifyState('basura')).toBeNull();
    });
  });

  describe('exchangeCodeForToken', () => {
    it('canjea el code por token corto (form, sin versión)', async () => {
      graph.post.mockResolvedValue({ access_token: 't1', user_id: 99 });
      const res = await service.exchangeCodeForToken('code123');
      expect(res).toEqual({ accessToken: 't1', userId: '99' });
      expect(graph.post).toHaveBeenCalledWith(
        '/oauth/access_token',
        expect.objectContaining({
          host: 'https://api.instagram.com',
          unversioned: true,
          form: expect.objectContaining({
            code: 'code123',
            grant_type: 'authorization_code',
            redirect_uri: 'https://api.test/instagram-accounts/oauth/callback',
          }),
        }),
      );
    });

    it('traduce el error de Meta a BadRequest con su mensaje', async () => {
      graph.post.mockRejectedValue(
        new MetaApiError('Invalid authorization code', 400),
      );
      await expect(service.exchangeCodeForToken('bad')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.exchangeCodeForToken('bad')).rejects.toThrow(
        'Invalid authorization code',
      );
    });

    it('falla si la respuesta no trae token', async () => {
      graph.post.mockResolvedValue({});
      await expect(service.exchangeCodeForToken('x')).rejects.toThrow(
        'No se pudo canjear el código de autorización',
      );
    });
  });

  describe('tokens de larga duración', () => {
    it('canjea y usa 60 días por defecto si Meta no manda expires_in', async () => {
      graph.get.mockResolvedValue({ access_token: 'long1' });
      const res = await service.exchangeForLongLivedToken('short1');
      expect(res).toEqual({ accessToken: 'long1', expiresIn: 5184000 });
    });

    it('refresca el token vigente', async () => {
      graph.get.mockResolvedValue({ access_token: 'long2', expires_in: 1000 });
      const res = await service.refreshLongLivedToken('long1');
      expect(res).toEqual({ accessToken: 'long2', expiresIn: 1000 });
      expect(graph.get).toHaveBeenCalledWith(
        '/refresh_access_token',
        expect.objectContaining({
          params: expect.objectContaining({ grant_type: 'ig_refresh_token' }),
        }),
      );
    });
  });

  describe('fetchProfile', () => {
    it('devuelve el user_id real (de /me) como string', async () => {
      graph.get.mockResolvedValue({ user_id: 17841400000000000, username: 'bar' });
      const res = await service.fetchProfile('tok');
      expect(res).toEqual({ userId: '17841400000000000', username: 'bar' });
      expect(graph.get).toHaveBeenCalledWith(
        '/me',
        expect.objectContaining({
          accessToken: 'tok',
          params: { fields: 'user_id,username' },
        }),
      );
    });

    it('devuelve vacío si Meta falla (el caller decide el fallback)', async () => {
      graph.get.mockRejectedValue(new MetaApiError('nope', 400));
      expect(await service.fetchProfile('tok')).toEqual({});
    });
  });
});
