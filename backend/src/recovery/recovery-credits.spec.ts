import { RecoveryAnalysisService } from './recovery-analysis.service';

const TID = '507f1f77bcf86cd799439011';

function setup(cfg: Record<string, string>, platform: unknown) {
  const ai = { platformFor: jest.fn().mockResolvedValue(platform) };
  const settings = { get: jest.fn().mockResolvedValue(cfg) };
  const credits = { assertCanSpend: jest.fn().mockResolvedValue(undefined) };
  const m = {} as never;
  const svc = new RecoveryAnalysisService(
    m,
    m,
    m,
    m,
    m,
    ai as never,
    settings as never,
    {} as never,
    credits as never,
  );
  return { svc, ai, credits };
}

describe('Recuperación y créditos con la IA de la plataforma (HU85 C12)', () => {
  it('con la plataforma activa para la empresa no exige créditos', async () => {
    const { svc, ai, credits } = setup({}, { provider: 'claude' });
    await svc.assertCredits(TID);
    expect(ai.platformFor).toHaveBeenCalledWith(
      expect.objectContaining({ deepseek: undefined, openai: undefined }),
    );
    expect(credits.assertCanSpend).not.toHaveBeenCalled();
  });

  it('sin plataforma ni key propia sigue exigiendo créditos', async () => {
    const { svc, credits } = setup({}, null);
    await svc.assertCredits(TID);
    expect(credits.assertCanSpend).toHaveBeenCalledWith(TID, 'recovery');
  });

  it('con una key propia de otro proveedor pasa las keys y la plataforma no aplica', async () => {
    const { svc, ai, credits } = setup({ openaiApiKey: 'propia' }, null);
    await svc.assertCredits(TID);
    expect(ai.platformFor).toHaveBeenCalledWith(
      expect.objectContaining({ openai: 'propia' }),
    );
    expect(credits.assertCanSpend).toHaveBeenCalled();
  });
});
