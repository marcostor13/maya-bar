import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformAiService } from './platform-ai.service';
import { PlatformAiController } from './platform-ai.controller';
import type { AuthReq } from '../../auth/permissions';

type Doc = Record<string, unknown> | null;

function setup(initial: Doc = null) {
  let doc: Doc = initial;
  const model = {
    findOne: jest.fn(() => ({ exec: () => Promise.resolve(doc) })),
    updateOne: jest.fn(
      (
        _q: unknown,
        u: { $set: Record<string, unknown>; $unset?: Record<string, 1> },
      ) => {
        const next: Record<string, unknown> = { ...(doc ?? {}), ...u.$set };
        for (const k of Object.keys(u.$unset ?? {})) delete next[k];
        doc = next;
        return { exec: () => Promise.resolve({}) };
      },
    ),
  };
  const provider = {
    chat: jest.fn().mockResolvedValue('ok'),
    chatWithTools: jest.fn(),
    listModels: jest.fn().mockResolvedValue(['gpt-5-mini', 'whisper-1']),
  };
  const config = {
    get: () => undefined,
    getOrThrow: () => 'secreto-de-prueba',
  } as unknown as ConfigService;
  const svc = new PlatformAiService(model as never, provider, config);
  return { svc, model, provider, stored: () => doc };
}

const KEY = 'sk-plataforma-1234';

describe('PlatformAiService (HU85)', () => {
  it('C1: guarda la key cifrada y la vista solo muestra los últimos 4', async () => {
    const { svc, stored } = setup();
    const view = await svc.save(
      { enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: KEY },
      'admin1',
    );
    const doc = stored()!;
    expect(doc.apiKeyEnc).toBeDefined();
    expect(String(doc.apiKeyEnc)).not.toContain(KEY);
    expect(view).toEqual(
      expect.objectContaining({
        enabled: true,
        provider: 'openai',
        model: 'gpt-5-mini',
        hasKey: true,
        keyHint: '••••1234',
      }),
    );
    expect(JSON.stringify(view)).not.toContain(KEY);
    await expect(svc.active()).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      apiKey: KEY,
    });
  });

  it('C7: no activa sin key, sin modelo o sin proveedor', async () => {
    const { svc } = setup();
    await expect(
      svc.save({ enabled: true, provider: 'openai', model: 'x' }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.save({ enabled: true, provider: 'openai', apiKey: KEY }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.save({ enabled: true, model: 'x', apiKey: KEY }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conserva la key guardada si no se escribe otra; al cambiar de proveedor exige una nueva', async () => {
    const { svc, stored } = setup();
    await svc.save(
      { enabled: true, provider: 'openai', model: 'gpt-5-mini', apiKey: KEY },
      'a',
    );
    const enc = stored()!.apiKeyEnc;
    await svc.save({ enabled: true, provider: 'openai', model: 'gpt-5' }, 'a');
    expect(stored()!.apiKeyEnc).toBe(enc);
    await expect(
      svc.save({ enabled: true, provider: 'claude', model: 'claude-x' }, 'a'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desactivada o incompleta no hay cuenta activa', async () => {
    const { svc } = setup();
    await expect(svc.active()).resolves.toBeNull();
    await svc.save(
      { enabled: false, provider: 'openai', model: 'm', apiKey: KEY },
      'a',
    );
    await expect(svc.active()).resolves.toBeNull();
  });

  it('C9: cachea la lectura 30 s y guardar la invalida', async () => {
    const { svc, model } = setup();
    await svc.active(1000);
    await svc.active(2000);
    expect(model.findOne).toHaveBeenCalledTimes(1);
    await svc.active(40_000);
    expect(model.findOne).toHaveBeenCalledTimes(2);
    await svc.save(
      { enabled: true, provider: 'openai', model: 'm', apiKey: KEY },
      'a',
    );
    await expect(svc.active(40_500)).resolves.not.toBeNull();
  });

  it('C8: lista modelos con la key escrita o la guardada; sin ninguna, 400', async () => {
    const { svc, provider } = setup();
    await expect(svc.listModels({ provider: 'openai' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const r = await svc.listModels({ provider: 'openai', apiKey: 'sk-otra' });
    expect(provider.listModels).toHaveBeenCalledWith('openai', 'sk-otra');
    expect(r.source).toBe('live');
    expect(r.models.map((m) => m.id)).toEqual(['gpt-5-mini']);

    await svc.save(
      { enabled: true, provider: 'openai', model: 'm', apiKey: KEY },
      'a',
    );
    await svc.listModels({ provider: 'openai' });
    expect(provider.listModels).toHaveBeenLastCalledWith('openai', KEY);
  });

  it('C8: probar llama al proveedor con el modelo y oculta la key en el error', async () => {
    const { svc, provider } = setup();
    await expect(
      svc.test({ provider: 'claude', model: 'claude-haiku-4-5', apiKey: KEY }),
    ).resolves.toEqual({ ok: true, reply: 'ok' });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'claude',
        model: 'claude-haiku-4-5',
        apiKey: KEY,
      }),
    );
    provider.chat.mockRejectedValueOnce(new Error(`401 key ${KEY} inválida`));
    const err = await svc
      .test({ provider: 'claude', model: 'm', apiKey: KEY })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).not.toContain(KEY);
  });
});

describe('PlatformAiController (HU85)', () => {
  const req = (role: string) =>
    ({ user: { role, userId: 'u1', tenantId: 't1' } }) as unknown as AuthReq;

  it('C2: solo el SUPERADMIN entra', () => {
    const service = {
      view: jest.fn(),
      save: jest.fn(),
      listModels: jest.fn(),
      test: jest.fn(),
    };
    const ctrl = new PlatformAiController(service as never);
    for (const role of ['ADMIN', 'MANAGER', 'AGENT']) {
      expect(() => ctrl.get(req(role))).toThrow(ForbiddenException);
      expect(() => ctrl.save(req(role), { enabled: false })).toThrow(
        ForbiddenException,
      );
      expect(() => ctrl.models(req(role), { provider: 'openai' })).toThrow(
        ForbiddenException,
      );
      expect(() =>
        ctrl.test(req(role), { provider: 'openai', model: 'm' }),
      ).toThrow(ForbiddenException);
    }
    expect(service.view).not.toHaveBeenCalled();
    void ctrl.get(req('SUPERADMIN'));
    void ctrl.save(req('SUPERADMIN'), { enabled: false });
    expect(service.view).toHaveBeenCalled();
    expect(service.save).toHaveBeenCalledWith({ enabled: false }, 'u1');
  });
});
