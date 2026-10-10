import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const userId = new Types.ObjectId().toString();

type Filter = Record<string, any>;
type Stage = Record<string, any>;

function createMockModel() {
  return {
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  };
}

/** Responde a cada conteo según el campo que lo distingue del resto. */
function countBy(
  model: ReturnType<typeof createMockModel>,
  answer: (filter: Filter) => number,
) {
  model.countDocuments.mockImplementation((filter: Filter) =>
    Promise.resolve(answer(filter)),
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let customerModel: ReturnType<typeof createMockModel>;
  let convModel: ReturnType<typeof createMockModel>;
  let msgModel: ReturnType<typeof createMockModel>;
  let agentModel: ReturnType<typeof createMockModel>;
  let leads: { stats: jest.Mock };

  beforeEach(() => {
    // Jueves 19 de marzo de 2026, 10:30 hora local.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 19, 10, 30, 0));

    customerModel = createMockModel();
    convModel = createMockModel();
    msgModel = createMockModel();
    agentModel = createMockModel();
    leads = { stats: jest.fn().mockResolvedValue({ total: 0 }) };
    service = new DashboardService(
      customerModel as never,
      convModel as never,
      msgModel as never,
      agentModel as never,
      leads as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('aislamiento por empresa', () => {
    it('todos los conteos llevan el tenantId de la empresa', async () => {
      await service.crm(tenantId, userId, 'MANAGER');

      const models = [customerModel, convModel, msgModel, agentModel];
      const filters: Filter[] = models.flatMap((m) =>
        m.countDocuments.mock.calls.map((c: unknown[]) => c[0] as Filter),
      );
      expect(filters).toHaveLength(12);
      for (const filter of filters) {
        expect(filter.tenantId).toBeInstanceOf(Types.ObjectId);
        expect(filter.tenantId.toString()).toBe(tenantId);
      }
    });

    it('todas las agregaciones empiezan filtrando por la empresa', async () => {
      await service.crm(tenantId, userId, 'MANAGER');

      const pipelines: Stage[][] = [customerModel, convModel].flatMap((m) =>
        m.aggregate.mock.calls.map((c: unknown[]) => c[0] as Stage[]),
      );
      expect(pipelines).toHaveLength(4);
      for (const pipeline of pipelines) {
        const first = pipeline[0];
        expect(Object.keys(first)).toEqual(['$match']);
        expect(first.$match.tenantId.toString()).toBe(tenantId);
      }
    });

    it('pide el seguimiento con la empresa, el usuario y el rol de quien consulta', async () => {
      const seguimiento = { total: 7, porEtapa: [] };
      leads.stats.mockResolvedValue(seguimiento);

      const result = await service.crm(tenantId, userId, 'IMPULSADOR');

      expect(leads.stats).toHaveBeenCalledWith(tenantId, userId, 'IMPULSADOR');
      expect(result.seguimiento).toBe(seguimiento);
    });
  });

  describe('contactos', () => {
    it('separa total, altas del mes, del mes anterior y con etiquetas', async () => {
      countBy(customerModel, (f) => {
        if (f['tags.0']) return 40;
        if (f.createdAt?.$lt) return 15;
        if (f.createdAt) return 22;
        return 300;
      });

      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.contactos).toEqual({
        total: 300,
        nuevosEsteMes: 22,
        nuevosMesAnterior: 15,
        conEtiquetas: 40,
      });
    });

    it('el mes actual arranca el día 1 y el anterior es el mes completo previo', async () => {
      await service.crm(tenantId, userId, 'MANAGER');

      const ranges = customerModel.countDocuments.mock.calls
        .map((c: unknown[]) => (c[0] as Filter).createdAt)
        .filter(Boolean);
      expect(ranges).toEqual([
        { $gte: new Date(2026, 2, 1) },
        { $gte: new Date(2026, 1, 1), $lt: new Date(2026, 2, 1) },
      ]);
    });

    it('etiqueta los canales conocidos y deja la clave en los desconocidos', async () => {
      customerModel.aggregate.mockImplementation((pipeline: Stage[]) =>
        Promise.resolve(
          pipeline.some((s) => s.$unwind)
            ? []
            : [
                { _id: 'whatsapp', count: 9 },
                { _id: 'form', count: 4 },
                { _id: 'tiktok', count: 1 },
                { _id: null, count: 3 },
                { _id: '', count: 2 },
              ],
        ),
      );

      const result = await service.crm(tenantId, userId, 'MANAGER');

      // Los contactos sin canal no forman una fila propia.
      expect(result.contactosPorCanal).toEqual([
        { key: 'whatsapp', label: 'WhatsApp', count: 9 },
        { key: 'form', label: 'Formulario', count: 4 },
        { key: 'tiktok', label: 'tiktok', count: 1 },
      ]);
    });

    it('agrupa los contactos por origen, de mayor a menor', async () => {
      await service.crm(tenantId, userId, 'MANAGER');

      const pipeline = customerModel.aggregate.mock.calls
        .map((c: unknown[]) => c[0] as Stage[])
        .find((p: Stage[]) => !p.some((s) => s.$unwind));
      expect(pipeline?.slice(1)).toEqual([
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
    });

    it('la nube de etiquetas despliega el array y se limita a 12', async () => {
      customerModel.aggregate.mockImplementation((pipeline: Stage[]) =>
        Promise.resolve(
          pipeline.some((s) => s.$unwind)
            ? [
                { _id: 'vip', count: 8 },
                { _id: 'evento', count: 5 },
              ]
            : [],
        ),
      );

      const result = await service.crm(tenantId, userId, 'MANAGER');

      const pipeline = customerModel.aggregate.mock.calls
        .map((c: unknown[]) => c[0] as Stage[])
        .find((p: Stage[]) => p.some((s) => s.$unwind));
      expect(pipeline?.slice(1)).toEqual([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]);
      expect(result.contactosPorEtiqueta).toEqual([
        { key: 'vip', label: 'vip', count: 8 },
        { key: 'evento', label: 'evento', count: 5 },
      ]);
    });
  });

  describe('conversaciones', () => {
    it('cuenta abiertas, sin leer, atendidas por IA y activas hoy', async () => {
      countBy(convModel, (f) => {
        if (f.status === 'open') return 11;
        if (f.unreadCount) return 6;
        if (f.autoReply === true) return 4;
        if (f.lastMessageAt) return 9;
        return -1;
      });
      convModel.aggregate.mockImplementation((pipeline: Stage[]) =>
        Promise.resolve(
          pipeline[1].$group._id === null
            ? [{ total: 27 }]
            : [
                { _id: 'instagram', count: 3 },
                { _id: 'email', count: 2 },
              ],
        ),
      );

      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.conversaciones).toEqual({
        abiertas: 11,
        sinLeer: 6,
        mensajesSinLeer: 27,
        atendidasPorIa: 4,
        activasHoy: 9,
      });
      expect(result.conversacionesPorCanal).toEqual([
        { key: 'instagram', label: 'Instagram', count: 3 },
        { key: 'email', label: 'email', count: 2 },
      ]);
    });

    it('"activas hoy" cuenta desde la medianoche local', async () => {
      await service.crm(tenantId, userId, 'MANAGER');

      const today = convModel.countDocuments.mock.calls
        .map((c: unknown[]) => c[0] as Filter)
        .find((f: Filter) => f.lastMessageAt);
      expect(today?.lastMessageAt).toEqual({ $gte: new Date(2026, 2, 19) });
    });

    it('sin conversaciones los mensajes sin leer son 0, no undefined', async () => {
      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.conversaciones.mensajesSinLeer).toBe(0);
    });
  });

  describe('agentes', () => {
    function stubAnswers(ia: number, human: number) {
      countBy(msgModel, (f) => (f.author === 'agent' ? ia : human));
    }

    it('calcula la autonomía como porcentaje redondeado de respuestas de la IA', async () => {
      stubAnswers(2, 1);
      countBy(agentModel, (f) => (f.published ? 3 : 5));

      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.agentes).toEqual({
        publicados: 3,
        total: 5,
        respuestasIa: 2,
        respuestasHumanas: 1,
        autonomia: 67,
      });
    });

    it('sin respuestas salientes la autonomía es 0, no NaN', async () => {
      stubAnswers(0, 0);

      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.agentes.autonomia).toBe(0);
    });

    it('si todo lo respondió la IA la autonomía es 100', async () => {
      stubAnswers(14, 0);

      const result = await service.crm(tenantId, userId, 'MANAGER');

      expect(result.agentes.autonomia).toBe(100);
    });
  });
});
