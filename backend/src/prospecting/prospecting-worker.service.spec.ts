import { Types } from 'mongoose';
import { ProspectingWorker, MAX_ATTEMPTS } from './prospecting-worker.service';

type Update = { $set: Record<string, unknown> };
const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(claims: {
  search?: object[];
  research?: object[];
  material?: object[];
}) {
  const queues = {
    search: [...(claims.search ?? [])],
    research: [...(claims.research ?? [])],
    material: [...(claims.material ?? [])],
  };
  const searchUpdates: { filter: unknown; update: Update }[] = [];
  const prospectUpdates: { filter: unknown; update: Update }[] = [];
  const searchModel = {
    findOneAndUpdate: jest.fn(() => exec(queues.search.shift() ?? null)),
    updateOne: jest.fn((filter: unknown, update: Update) => {
      searchUpdates.push({ filter, update });
      return exec({});
    }),
  };
  const prospectModel = {
    findOneAndUpdate: jest.fn((filter: Record<string, unknown>) =>
      exec(
        ('research.state' in filter
          ? queues.research
          : queues.material
        ).shift() ?? null,
      ),
    ),
    updateOne: jest.fn((filter: unknown, update: Update) => {
      prospectUpdates.push({ filter, update });
      return exec({});
    }),
  };
  const research = {
    runSearch: jest.fn(),
    runResearch: jest.fn(),
    runMaterial: jest.fn(),
  };
  const worker = new ProspectingWorker(
    searchModel as never,
    prospectModel as never,
    research as never,
  );
  return {
    worker,
    research,
    searchModel,
    prospectModel,
    searchUpdates,
    prospectUpdates,
  };
}

const doc = (extra: object = {}) => ({
  _id: new Types.ObjectId(),
  tenantId: new Types.ObjectId(),
  ...extra,
});

describe('ProspectingWorker', () => {
  it('reclama y procesa búsquedas, investigaciones y materiales', async () => {
    const s = doc();
    const r1 = doc({ research: { state: 'queued' } });
    const r2 = doc({ research: { state: 'queued' } });
    const m = doc({ material: { state: 'queued' } });
    const { worker, research, prospectModel } = setup({
      search: [s],
      research: [r1, r2],
      material: [m],
    });

    await worker.kick();
    await flush();

    expect(research.runSearch).toHaveBeenCalledWith(s);
    expect(research.runResearch).toHaveBeenCalledTimes(2);
    expect(research.runMaterial).toHaveBeenCalledWith(m);
    const claim = prospectModel.findOneAndUpdate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Update,
    ];
    expect(claim[0]['research.state']).toEqual({ $in: ['queued', 'running'] });
    expect(claim[1].$set['research.state']).toBe('running');
  });

  it('reintenta una investigación fallida con espera y la da por fallida al agotar intentos', async () => {
    const first = doc({ research: { state: 'queued', attempts: 0 } });
    const last = doc({
      research: { state: 'running', attempts: MAX_ATTEMPTS - 1 },
    });
    const { worker, research, prospectUpdates } = setup({
      research: [first, last],
    });
    research.runResearch.mockRejectedValue(new Error('IA caída'));

    await worker.kick();
    await flush();

    const [retry, final] = prospectUpdates.map((u) => u.update.$set);
    expect(retry['research.attempts']).toBe(1);
    expect(retry['research.state']).toBeUndefined();
    expect((retry['research.lockedUntil'] as Date).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(final).toMatchObject({
      'research.state': 'failed',
      'research.error': 'IA caída',
      'research.lockedUntil': null,
    });
    expect(prospectUpdates[0].filter).toMatchObject({
      'research.state': 'running',
    });
  });

  it('marca la búsqueda como fallida al agotar intentos', async () => {
    const s = doc({ attempts: MAX_ATTEMPTS - 1 });
    const { worker, research, searchUpdates } = setup({ search: [s] });
    research.runSearch.mockRejectedValue(new Error('Places 403'));

    await worker.kick();
    await flush();

    expect(searchUpdates[0].update.$set).toMatchObject({
      status: 'failed',
      error: 'Places 403',
      lockedUntil: null,
    });
  });

  it('no arranca dos pasadas a la vez', async () => {
    const { worker, searchModel } = setup({});
    await Promise.all([worker.kick(), worker.kick()]);
    expect(searchModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
