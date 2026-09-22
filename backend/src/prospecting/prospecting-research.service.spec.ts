import { Types } from 'mongoose';
import {
  ProspectingResearchService,
  fallbackQueries,
  keepContactLinks,
} from './prospecting-research.service';
import * as sources from './prospecting-sources';
import type { Prospect } from './prospect.schema';
import type { ProspectSearch } from './prospect-search.schema';

jest.mock('./prospecting-sources', () => {
  const actual = jest.requireActual<typeof sources>('./prospecting-sources');
  return {
    ...actual,
    placesTextSearch: jest.fn(),
    serperPlaces: jest.fn(),
    serperSearch: jest.fn(),
    placeDetails: jest.fn(),
    scrapeWebsite: jest.fn(),
    runPageSpeed: jest.fn(),
    hunterDomainSearch: jest.fn(),
  };
});
const src = sources as jest.Mocked<typeof sources>;

const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

function setup(opts: {
  keys?: Record<string, string>;
  ai?: ((prompt: string) => unknown)[];
  known?: { placeId?: string; domain?: string; name: string }[];
  count?: number;
}) {
  const aiReplies = [...(opts.ai ?? [])];
  const searchUpdates: Record<string, unknown>[] = [];
  const prospectUpdates: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];

  const searchModel = {
    updateOne: jest.fn((_f: unknown, u: Record<string, unknown>) => {
      searchUpdates.push(u);
      return exec({});
    }),
    findById: jest.fn(() => ({
      lean: () => exec({ services: 'Webs y agentes de IA' }),
    })),
  };
  const prospectModel = {
    find: jest.fn(() => ({ lean: () => exec(opts.known ?? []) })),
    insertMany: jest.fn((docs: Record<string, unknown>[]) => {
      inserted.push(...docs);
      return Promise.resolve(docs);
    }),
    countDocuments: jest.fn(() => exec(opts.count ?? inserted.length)),
    updateOne: jest.fn((_f: unknown, u: { $set: Record<string, unknown> }) => {
      prospectUpdates.push(u.$set);
      return exec({});
    }),
  };
  const ai = {
    chatMessages: jest.fn((messages: { content: string }[]) => {
      const next = aiReplies.shift();
      if (!next) return Promise.reject(new Error('sin respuesta'));
      return Promise.resolve(JSON.stringify(next(messages[1].content)));
    }),
    parseJson: (text: string) => JSON.parse(text) as unknown,
    hasAnyKey: jest.fn(() => true),
  };
  const settings = {
    get: jest.fn(() => Promise.resolve({ deepseekApiKey: 'ds', ...opts.keys })),
  };
  const service = new ProspectingResearchService(
    searchModel as never,
    prospectModel as never,
    ai as never,
    settings as never,
  );
  return { service, searchUpdates, prospectUpdates, inserted, ai };
}

function search(extra: Partial<ProspectSearch> = {}): ProspectSearch {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(),
    createdBy: new Types.ObjectId(),
    services: 'Webs y agentes de IA',
    idealCustomer: '',
    location: 'Lima',
    industries: ['clínicas dentales'],
    maxResults: 2,
    ...extra,
  } as unknown as ProspectSearch;
}

beforeEach(() => jest.clearAllMocks());

describe('fallbackQueries', () => {
  it('usa los sectores o el cliente ideal con la zona', () => {
    expect(
      fallbackQueries({
        industries: ['gimnasios', 'spas'],
        idealCustomer: '',
        location: 'Lima',
      }),
    ).toEqual(['gimnasios en Lima', 'spas en Lima']);
    expect(
      fallbackQueries({
        industries: [],
        idealCustomer: 'Hoteles boutique, con web vieja',
        location: '',
      }),
    ).toEqual(['Hoteles boutique']);
  });
});

describe('keepContactLinks', () => {
  it('conserva el contacto de las personas ya convertidas', () => {
    const res = keepContactLinks(
      [{ name: 'Ana Ruiz', role: 'CEO' }, { name: 'Luis' }],
      [
        { name: 'ana ruiz', customerId: 'c1' },
        { name: 'Eva', customerId: 'c2' },
        { name: 'Sin contacto' },
      ],
    );
    expect(res).toEqual([
      { name: 'Ana Ruiz', role: 'CEO', customerId: 'c1' },
      { name: 'Luis' },
      { name: 'Eva', customerId: 'c2' },
    ]);
  });
});

describe('ProspectingResearchService.runSearch', () => {
  it('busca en Places, descarta las ya conocidas, puntúa y guarda las mejores', async () => {
    src.placesTextSearch.mockResolvedValue([
      {
        placeId: 'a',
        name: 'Alfa',
        website: 'https://alfa.pe',
        source: 'google_places',
      },
      { placeId: 'b', name: 'Beta', source: 'google_places' },
      { placeId: 'c', name: 'Gamma', source: 'google_places' },
      { placeId: 'old', name: 'Vieja', source: 'google_places' },
    ]);
    const { service, inserted, searchUpdates } = setup({
      keys: { googlePlacesApiKey: 'gp' },
      known: [{ placeId: 'old', name: 'Vieja' }],
      ai: [
        () => ({ idealProfile: 'Clínicas', queries: ['dentistas en Lima'] }),
        () => ({
          scores: [
            { i: 0, score: 40 },
            { i: 1, score: 90, reason: 'sin web' },
            { i: 2, score: 70 },
          ],
        }),
      ],
    });

    await service.runSearch(search());

    expect(src.placesTextSearch).toHaveBeenCalledWith(
      'dentistas en Lima',
      'gp',
    );
    expect(inserted.map((p) => [p.name, p.fitScore])).toEqual([
      ['Beta', 90],
      ['Gamma', 70],
    ]);
    expect(inserted[0].fitReason).toBe('sin web');
    const final = searchUpdates.at(-1)?.$set as Record<string, unknown>;
    expect(final).toMatchObject({
      status: 'done',
      found: 2,
      sources: ['google_places'],
    });
  });

  it('arma búsquedas propias si la IA no propone ninguna', async () => {
    src.placesTextSearch.mockResolvedValue([
      { placeId: 'a', name: 'Alfa', source: 'google_places' },
    ]);
    const { service } = setup({
      keys: { googlePlacesApiKey: 'gp' },
      ai: [() => ({ queries: [] }), () => ({ scores: [{ i: 0, score: 80 }] })],
    });
    await service.runSearch(search());
    expect(src.placesTextSearch).toHaveBeenCalledWith(
      'clínicas dentales en Lima',
      'gp',
    );
  });

  it('falla con un mensaje claro si todas las fuentes fallan', async () => {
    src.placesTextSearch.mockRejectedValue(
      new Error('Google Places 403: key inválida'),
    );
    const { service } = setup({
      keys: { googlePlacesApiKey: 'gp' },
      ai: [() => ({ queries: ['a', 'b'] })],
    });
    await expect(service.runSearch(search())).rejects.toThrow(
      'Las fuentes de búsqueda fallaron: Google Places 403',
    );
  });

  it('sin fuentes pide empresas a la IA y deja nota neutra si la puntuación falla', async () => {
    const { service, inserted } = setup({
      ai: [
        () => ({ queries: ['x'] }),
        () => ({ companies: [{ name: 'Delta', website: 'delta.pe' }] }),
        // la puntuación no responde: se usa 50
      ],
    });
    await service.runSearch(search());
    expect(src.placesTextSearch).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      expect.objectContaining({
        name: 'Delta',
        website: 'https://delta.pe/',
        domain: 'delta.pe',
        source: 'ai',
        fitScore: 50,
      }),
    ]);
  });
});

describe('ProspectingResearchService.runResearch', () => {
  function prospect(extra: Partial<Prospect> = {}): Prospect {
    return {
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(),
      searchId: new Types.ObjectId(),
      name: 'Alfa',
      research: {
        state: 'running',
        people: [{ name: 'Ana Ruiz', customerId: 'c1' }],
      },
      material: { state: 'idle' },
      ...extra,
    } as unknown as Prospect;
  }

  it('omite las fuentes sin key, investiga la web y combina personas', async () => {
    src.scrapeWebsite.mockResolvedValue({
      reachable: true,
      finalUrl: 'https://alfa.pe/',
      pagesVisited: ['https://alfa.pe/'],
      technologies: ['WordPress'],
      emails: ['hola@alfa.pe'],
      phones: ['+51999'],
      social: [{ network: 'instagram', url: 'https://instagram.com/alfa' }],
      excerpt: 'texto',
    } as unknown as sources.WebsiteReport);
    src.runPageSpeed.mockResolvedValue({
      strategy: 'mobile',
      performance: 40,
      metrics: {},
      opportunities: [],
    });
    const { service, prospectUpdates } = setup({
      ai: [
        () => ({
          summary: 'Clínica',
          fitScore: 81.6,
          industry: 'Salud',
          people: [
            { name: 'ana ruiz', role: 'CEO' },
            { name: 'Luis Paz', role: 'Gerente' },
          ],
        }),
      ],
    });

    await service.runResearch(prospect({ website: 'https://alfa.pe' }));

    const final = prospectUpdates.at(-1) as Record<string, unknown>;
    const steps = final['research.steps'] as { key: string; status: string }[];
    expect(Object.fromEntries(steps.map((s) => [s.key, s.status]))).toEqual({
      place: 'skipped',
      search: 'skipped',
      people_search: 'skipped',
      website: 'ok',
      pagespeed: 'ok',
      hunter: 'skipped',
      ai: 'ok',
    });
    expect(final['research.state']).toBe('done');
    expect(final['research.people']).toEqual([
      {
        name: 'ana ruiz',
        role: 'CEO',
        linkedin: undefined,
        email: undefined,
        source: 'ia',
        notes: undefined,
        customerId: 'c1',
      },
      {
        name: 'Luis Paz',
        role: 'Gerente',
        linkedin: undefined,
        email: undefined,
        source: 'ia',
        notes: undefined,
      },
    ]);
    expect(final).toMatchObject({
      email: 'hola@alfa.pe',
      phone: '+51999',
      industry: 'Salud',
      fitScore: 82,
    });
    expect(
      (final['research.ai'] as Record<string, unknown>).people,
    ).toBeUndefined();
  });

  it('trata una página de Facebook como red y no como web propia', async () => {
    const { service, prospectUpdates } = setup({
      ai: [() => ({ summary: 'x' })],
    });
    await service.runResearch(
      prospect({ website: 'https://facebook.com/alfa' }),
    );
    expect(src.scrapeWebsite).not.toHaveBeenCalled();
    const final = prospectUpdates.at(-1) as Record<string, unknown>;
    expect(final['research.social']).toEqual([
      { network: 'facebook', url: 'https://facebook.com/alfa' },
    ]);
  });

  it('falla si la IA no devuelve la síntesis, para que el worker reintente', async () => {
    const { service } = setup({ ai: [] });
    await expect(service.runResearch(prospect())).rejects.toThrow(
      'sin respuesta',
    );
  });
});
