import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerOAuthService } from './messenger-oauth.service';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

describe('MessengerOAuthService', () => {
  let service: MessengerOAuthService;
  let graph: { get: jest.Mock; post: jest.Mock };

  const env: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    FACEBOOK_APP_ID: 'app1',
    FACEBOOK_APP_SECRET: 'shh',
    PUBLIC_API_URL: 'https://api.test',
  };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessengerOAuthService,
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
    service = moduleRef.get(MessengerOAuthService);
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
      expect(
        service.verifyState(`${tampered}.${state.split('.')[1]}`),
      ).toBeNull();
      expect(service.verifyState(`${payload}.firmafalsa`)).toBeNull();
      expect(service.verifyState('basura')).toBeNull();
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('pide los permisos de páginas y mensajería', () => {
      const url = new URL(service.buildAuthorizeUrl('st1'));
      expect(url.origin + url.pathname).toBe(
        'https://www.facebook.com/v21.0/dialog/oauth',
      );
      expect(url.searchParams.get('client_id')).toBe('app1');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://api.test/messenger-accounts/oauth/callback',
      );
      expect(url.searchParams.get('scope')).toContain('pages_messaging');
      expect(url.searchParams.get('state')).toBe('st1');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('canjea el code por un token de usuario corto', async () => {
      graph.get.mockResolvedValue({ access_token: 't1' });
      const res = await service.exchangeCodeForToken('code123');
      expect(res).toEqual({ accessToken: 't1' });
      expect(graph.get).toHaveBeenCalledWith(
        '/oauth/access_token',
        expect.objectContaining({
          params: expect.objectContaining({
            code: 'code123',
            client_id: 'app1',
            redirect_uri: 'https://api.test/messenger-accounts/oauth/callback',
          }),
        }),
      );
    });

    it('traduce el error de Meta a BadRequest con su mensaje', async () => {
      graph.get.mockRejectedValue(
        new MetaApiError('Invalid authorization code', 400),
      );
      await expect(service.exchangeCodeForToken('bad')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('exchangeForLongLivedToken', () => {
    it('usa fb_exchange_token y aplica el default de 60 días', async () => {
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

    it('falla si Meta no devuelve token', async () => {
      graph.get.mockResolvedValue({});
      await expect(service.exchangeForLongLivedToken('short1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listPages', () => {
    it('devuelve solo las páginas con token', async () => {
      graph.get.mockResolvedValue({
        data: [
          { id: '1', name: 'Bar', username: 'bar', access_token: 'pt1' },
          { id: '2', name: 'Sin token' },
        ],
      });
      const pages = await service.listPages('user-token');
      expect(pages).toEqual([
        { id: '1', name: 'Bar', username: 'bar', accessToken: 'pt1' },
      ]);
      expect(graph.get).toHaveBeenCalledWith(
        '/me/accounts',
        expect.objectContaining({ accessToken: 'user-token' }),
      );
    });

    it('devuelve lista vacía si el usuario no autorizó ninguna', async () => {
      graph.get.mockResolvedValue({});
      await expect(service.listPages('user-token')).resolves.toEqual([]);
    });
  });
});
