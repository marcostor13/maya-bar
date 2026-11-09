import { BadRequestException } from '@nestjs/common';
import { MetaApiError } from '../shared/meta-graph.client';
import { CallsMetaService } from './calls-meta.service';

describe('CallsMetaService — peticiones a la Calling API', () => {
  const cfg = {
    provider: 'cloudapi',
    waPhoneNumberId: 'PNID',
    waAccessToken: 'tok',
  };
  let graph: { get: jest.Mock; post: jest.Mock };
  let service: CallsMetaService;

  beforeEach(() => {
    graph = {
      get: jest.fn().mockResolvedValue({}),
      post: jest.fn().mockResolvedValue({ success: true }),
    };
    service = new CallsMetaService(
      graph as never,
      { get: () => undefined } as never,
    );
  });

  it('accept lleva la respuesta SDP y la versión de Graph de llamadas', async () => {
    await service.action(cfg, 'wacid.1', 'accept', 'v=0');
    expect(graph.post).toHaveBeenCalledWith('/PNID/calls', {
      accessToken: 'tok',
      version: 'v24.0',
      json: {
        messaging_product: 'whatsapp',
        call_id: 'wacid.1',
        action: 'accept',
        session: { sdp_type: 'answer', sdp: 'v=0' },
      },
    });
  });

  it('reject no lleva sesión', async () => {
    await service.action(cfg, 'wacid.1', 'reject');
    const [, opts] = graph.post.mock.calls[0] as [
      string,
      { json: Record<string, unknown> },
    ];
    expect(opts.json).toEqual({
      messaging_product: 'whatsapp',
      call_id: 'wacid.1',
      action: 'reject',
    });
  });

  it('connect a un teléfono usa `to`; a un BSUID, `recipient`', async () => {
    graph.post.mockResolvedValue({ calls: [{ id: 'wacid.out' }] });
    expect(await service.connect(cfg, '51987654321', 'v=0', 'ref1')).toBe(
      'wacid.out',
    );
    expect(
      (graph.post.mock.calls[0][1] as { json: object }).json,
    ).toMatchObject({
      to: '51987654321',
      action: 'connect',
      session: { sdp_type: 'offer', sdp: 'v=0' },
      biz_opaque_callback_data: 'ref1',
    });
    await service.connect(cfg, 'PE.1502576394655843', 'v=0', 'ref2');
    expect(
      (graph.post.mock.calls[1][1] as { json: object }).json,
    ).toMatchObject({ recipient: 'PE.1502576394655843' });
  });

  it('settings y permisos van a sus rutas', async () => {
    graph.get.mockResolvedValue({ calling: { status: 'ENABLED' } });
    expect(await service.getSettings(cfg)).toEqual({ status: 'ENABLED' });
    await service.updateSettings(cfg, { status: 'DISABLED' });
    expect(graph.post).toHaveBeenCalledWith(
      '/PNID/settings',
      expect.objectContaining({ json: { calling: { status: 'DISABLED' } } }),
    );
    await service.permission(cfg, '51987654321');
    expect(graph.get).toHaveBeenLastCalledWith(
      '/PNID/call_permissions',
      expect.objectContaining({ params: { user_wa_id: '51987654321' } }),
    );
    await service.requestPermission(cfg, '51987654321', 'Hola');
    expect(
      (graph.post.mock.calls.at(-1)![1] as { json: object }).json,
    ).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        action: { name: 'call_permission_request' },
        body: { text: 'Hola' },
      },
    });
  });

  it('el error de Meta llega al usuario con su detalle y código', async () => {
    graph.post.mockRejectedValue(
      new MetaApiError('Calling disabled', 400, {
        error: {
          code: 138015,
          error_data: { details: 'Calling cannot be enabled for this number' },
        },
      }),
    );
    await expect(
      service.updateSettings(cfg, { status: 'ENABLED' }),
    ).rejects.toThrow(
      new BadRequestException(
        'WhatsApp: Calling cannot be enabled for this number (código 138015)',
      ),
    );
  });
});
