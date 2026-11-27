import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import type { AiChatProvider } from './providers/ai-provider.interface';
import type { PlatformAiAccount } from './platform-ai/platform-ai.service';

const TID = '507f1f77bcf86cd799439011';
const ACCOUNT: PlatformAiAccount = {
  provider: 'claude',
  model: 'claude-haiku-4-5',
  apiKey: 'plat-key',
};

function setup(
  account: PlatformAiAccount | null = ACCOUNT,
  tenantCfg: Record<string, string> | null = null,
) {
  const provider = {
    chat: jest.fn((req: Parameters<AiChatProvider['chat']>[0]) => {
      req.onUsage?.({ model: req.model, inputTokens: 100, outputTokens: 20 });
      return Promise.resolve('hola');
    }),
    chatWithTools: jest.fn().mockResolvedValue('con herramientas'),
    listModels: jest.fn(),
  };
  const credits = {
    assertCanSpend: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const platform = { active: jest.fn().mockResolvedValue(account) };
  const env: Record<string, string> = { OPENAI_API_KEY: 'srv' };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const tenantConfigs = {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: () => ({ exec: () => Promise.resolve(tenantCfg) }),
      }),
    })),
  };
  const svc = new AiService(
    config,
    provider,
    credits as never,
    platform as never,
    tenantConfigs as never,
  );
  return { svc, provider, credits, platform };
}

describe('AiService con la IA de la plataforma (HU85)', () => {
  it('C3: sin keys de la empresa usa proveedor, modelo y key de la plataforma aunque el agente pida otros', async () => {
    const { svc, provider } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      provider: 'openai',
      model: 'gpt-5',
      apiKeys: { openai: '', claude: undefined },
    });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'claude',
        model: 'claude-haiku-4-5',
        apiKey: 'plat-key',
      }),
    );
  });

  it('C3: también con herramientas', async () => {
    const { svc, provider } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      tools: [{ name: 't', description: 'd', parameters: {} }],
      runTool: jest.fn(),
    });
    expect(provider.chatWithTools).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'claude', apiKey: 'plat-key' }),
    );
  });

  it('C4: chat() simple usa la plataforma', async () => {
    const { svc, provider } = setup();
    await svc.chat('hola', { provider: 'openai' });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'claude',
        model: 'claude-haiku-4-5',
        apiKey: 'plat-key',
        errorLabel: 'Claude',
      }),
    );
  });

  it('C5: no comprueba saldo y anota el consumo como de plataforma', async () => {
    const { svc, credits } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      meter: { tenantId: TID, action: 'agent_reply' },
    });
    await svc.chat('x', { meter: { tenantId: TID, action: 'text' } });
    expect(credits.assertCanSpend).not.toHaveBeenCalled();
    expect(credits.record).toHaveBeenCalledWith(
      TID,
      'agent_reply',
      expect.objectContaining({
        byok: false,
        platform: true,
        provider: 'claude',
        model: 'claude-haiku-4-5',
        inputTokens: 100,
        outputTokens: 20,
      }),
      undefined,
    );
    expect(credits.record).toHaveBeenCalledTimes(2);
  });

  it('C6: con una key propia la empresa elige y no se consulta la plataforma', async () => {
    const { svc, provider, platform, credits } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      provider: 'openai',
      model: 'gpt-5',
      apiKeys: { openai: 'propia' },
      meter: { tenantId: TID, action: 'agent_reply' },
    });
    expect(platform.active).not.toHaveBeenCalled();
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5',
        apiKey: 'propia',
      }),
    );
    expect(credits.record).toHaveBeenCalledWith(
      TID,
      'agent_reply',
      expect.objectContaining({ byok: true, platform: false }),
      undefined,
    );
  });

  it('C6: con la plataforma desactivada vuelve a las keys del servidor y a los créditos', async () => {
    const { svc, provider, credits } = setup(null);
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      meter: { tenantId: TID, action: 'agent_reply' },
    });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'srv' }),
    );
    expect(credits.assertCanSpend).toHaveBeenCalled();
  });

  it('C6: chat() de una empresa con key propia no usa la plataforma (busca sus keys por el tenant)', async () => {
    const { svc, provider, credits } = setup(ACCOUNT, {
      deepseekApiKey: 'propia-ds',
    });
    await svc.chat('x', { meter: { tenantId: TID, action: 'scoring' } });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'srv' }),
    );
    expect(credits.assertCanSpend).toHaveBeenCalled();
  });

  it('hasAnyKey cuenta la plataforma', async () => {
    const env = { get: () => undefined } as unknown as ConfigService;
    const platform = { active: jest.fn().mockResolvedValue(ACCOUNT) };
    const svc = new AiService(env, {} as never, undefined, platform as never);
    await expect(svc.hasAnyKey({})).resolves.toBe(true);
    platform.active.mockResolvedValue(null);
    await expect(svc.hasAnyKey({})).resolves.toBe(false);
  });
});
