import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import type { AiChatProvider } from './providers/ai-provider.interface';
import { AiCreditsException } from '../billing/ai-credits.service';

const TID = '507f1f77bcf86cd799439011';

function setup(env: Record<string, string> = { OPENAI_API_KEY: 'srv' }) {
  const provider = {
    chat: jest.fn((req: Parameters<AiChatProvider['chat']>[0]) => {
      req.onUsage?.({
        model: 'gpt-4o-mini',
        inputTokens: 120,
        outputTokens: 30,
      });
      return Promise.resolve('hola');
    }),
    chatWithTools: jest.fn(),
  };
  const credits = {
    assertCanSpend: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const svc = new AiService(config, provider as never, credits as never);
  return { svc, provider, credits };
}

describe('AiService con medición de créditos (HU43)', () => {
  it('C1: anota 1 crédito de respuesta del agente con tokens y modelo', async () => {
    const { svc, credits } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      meter: { tenantId: TID, action: 'agent_reply' },
    });
    expect(credits.assertCanSpend).toHaveBeenCalledWith(
      TID,
      'agent_reply',
      undefined,
    );
    expect(credits.record).toHaveBeenCalledWith(
      TID,
      'agent_reply',
      expect.objectContaining({
        byok: false,
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 120,
        outputTokens: 30,
      }),
      undefined,
    );
  });

  it('C2: con la key propia de la empresa no comprueba saldo y anota byok', async () => {
    const { svc, credits } = setup();
    await svc.chatMessages([{ role: 'user', content: 'x' }], {
      apiKeys: { openai: 'propia' },
      meter: { tenantId: TID, action: 'agent_reply' },
    });
    expect(credits.assertCanSpend).not.toHaveBeenCalled();
    expect(credits.record).toHaveBeenCalledWith(
      TID,
      'agent_reply',
      expect.objectContaining({ byok: true }),
      undefined,
    );
  });

  it('sin saldo no llama al proveedor', async () => {
    const { svc, provider, credits } = setup();
    credits.assertCanSpend.mockRejectedValue(new AiCreditsException());
    await expect(
      svc.chatMessages([{ role: 'user', content: 'x' }], {
        meter: { tenantId: TID, action: 'agent_reply' },
      }),
    ).rejects.toMatchObject({ status: 402, response: { code: 'AI_CREDITS' } });
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('sin meter no mide nada', async () => {
    const { svc, credits } = setup();
    await svc.chat('hola');
    expect(credits.record).not.toHaveBeenCalled();
  });
});
