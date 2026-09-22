import { Types } from 'mongoose';
import { RecoveryWorker } from './recovery-worker.service';
import {
  AnalysisAbortedError,
  NothingToAnalyzeError,
} from './recovery-analysis.service';
import type { RecoveryPlan } from './recovery-plan.schema';

type Update = Record<string, Record<string, unknown>>;

function setup(opts: { claim?: Partial<RecoveryPlan>[] } = {}) {
  const claims = [...(opts.claim ?? [])];
  const updates: { filter: unknown; update: Update; options?: unknown }[] = [];
  const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

  const planModel = {
    findOneAndUpdate: jest.fn((filter: Record<string, unknown>) => {
      // Reescrituras: nunca hay pendientes en estas pruebas.
      if ('segments.rewriteJob.state' in filter) return exec(null);
      return exec(claims.shift() ?? null);
    }),
    updateOne: jest.fn((filter: unknown, update: Update, options?: unknown) => {
      updates.push({ filter, update, options });
      return exec({ matchedCount: 1 });
    }),
    updateMany: jest.fn(() => exec({ modifiedCount: 0 })),
  };
  const analysis = { run: jest.fn(), rewriteMessage: jest.fn() };
  const push = {
    sendToUser: jest.fn().mockResolvedValue(1),
    sendToTenant: jest.fn().mockResolvedValue(1),
  };
  const nativePush = {
    sendToUser: jest.fn().mockResolvedValue(1),
    sendToTenantModule: jest.fn().mockResolvedValue(1),
  };

  const worker = new RecoveryWorker(
    planModel as never,
    analysis as never,
    push as never,
    nativePush as never,
  );
  return { worker, planModel, analysis, push, nativePush, updates };
}

function plan(attempts = 0): Partial<RecoveryPlan> {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(),
    createdBy: new Types.ObjectId(),
    analysisAttempts: attempts,
    segments: [],
  };
}

/** Deja correr las promesas que el worker lanza sin esperar. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('RecoveryWorker', () => {
  it('reclama el plan con candado y avisa al terminar', async () => {
    const p = plan();
    const { worker, planModel, analysis, push, nativePush } = setup({
      claim: [p],
    });
    analysis.run.mockResolvedValue(undefined);

    await worker.kick();
    await flush();

    const claimFilter = planModel.findOneAndUpdate.mock.calls[0][0];
    expect(claimFilter.status).toBe('analyzing');
    expect(analysis.run).toHaveBeenCalledWith(p);
    expect(push.sendToUser).toHaveBeenCalledWith(
      String(p.createdBy),
      expect.objectContaining({ url: `/recuperacion/${String(p._id)}` }),
    );
    expect(nativePush.sendToUser).toHaveBeenCalled();
  });

  it('un error con intentos restantes deja el plan en análisis con espera', async () => {
    const { worker, analysis, updates, push } = setup({ claim: [plan(0)] });
    analysis.run.mockRejectedValue(new Error('timeout de DeepSeek'));

    await worker.kick();
    await flush();

    const { update } = updates.at(-1)!;
    expect(update.$set.status).toBeUndefined();
    expect(update.$set.analysisAttempts).toBe(1);
    expect(update.$set['analysis.error']).toBe('timeout de DeepSeek');
    expect((update.$set.analysisLockedUntil as Date).getTime()).toBeGreaterThan(
      Date.now() + 30_000,
    );
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('agotados los intentos, el plan falla y se avisa', async () => {
    const { worker, analysis, updates, push } = setup({ claim: [plan(2)] });
    analysis.run.mockRejectedValue(new Error('sigue fallando'));

    await worker.kick();
    await flush();

    const { update } = updates.at(-1)!;
    expect(update.$set.status).toBe('failed');
    expect(update.$unset).toEqual({
      analysisLockedUntil: 1,
      analysisCheckpoint: 1,
    });
    expect(push.sendToUser).toHaveBeenCalled();
  });

  it('sin conversaciones falla a la primera, sin reintentar', async () => {
    const { worker, analysis, updates } = setup({ claim: [plan(0)] });
    analysis.run.mockRejectedValue(
      new NothingToAnalyzeError('No hay conversaciones'),
    );

    await worker.kick();
    await flush();

    expect(updates.at(-1)!.update.$set.status).toBe('failed');
  });

  it('si el plan dejó de estar en análisis, no lo toca ni avisa', async () => {
    const { worker, analysis, updates, push } = setup({ claim: [plan(0)] });
    analysis.run.mockRejectedValue(new AnalysisAbortedError());

    await worker.kick();
    await flush();

    expect(updates).toHaveLength(0);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('guarda la reescritura solo para la petición que la originó', async () => {
    const requestedAt = new Date('2026-09-15T10:00:00Z');
    const startedAt = new Date();
    const p = {
      ...plan(),
      segments: [
        {
          key: 'objecion',
          message: 'x',
          recipients: [],
          rewriteJob: {
            state: 'running',
            instruction: 'más corto',
            requestedAt,
            startedAt,
          },
        },
      ],
    } as unknown as RecoveryPlan;
    const { worker, analysis, updates, planModel } = setup();
    planModel.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: () => Promise.resolve(null),
    }));
    analysis.rewriteMessage.mockResolvedValue(
      'Hola {{1}}, te lo resumo en corto. ¿Lo vemos?',
    );

    await (
      worker as unknown as {
        processRewrite(p: RecoveryPlan, k: string): Promise<void>;
      }
    ).processRewrite(p, 'objecion');

    const { update, options } = updates.at(-1)!;
    expect(update.$set['segments.$[s].rewriteJob.state']).toBe('done');
    expect(update.$set['segments.$[s].rewriteJob.result']).toContain('{{1}}');
    expect(options).toEqual({
      arrayFilters: [
        { 's.key': 'objecion', 's.rewriteJob.requestedAt': requestedAt },
      ],
    });
  });

  it('una reescritura que Meta rechazaría queda como fallida', async () => {
    const p = {
      ...plan(),
      segments: [
        {
          key: 'objecion',
          message: 'x',
          recipients: [],
          rewriteJob: {
            state: 'running',
            instruction: '',
            requestedAt: new Date(),
          },
        },
      ],
    } as unknown as RecoveryPlan;
    const { worker, analysis, updates } = setup();
    analysis.rewriteMessage.mockResolvedValue('{{1}} hola');

    await (
      worker as unknown as {
        processRewrite(p: RecoveryPlan, k: string): Promise<void>;
      }
    ).processRewrite(p, 'objecion');

    expect(updates.at(-1)!.update.$set['segments.$[s].rewriteJob.state']).toBe(
      'failed',
    );
  });
});
