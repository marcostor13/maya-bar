import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LeadStagesService, stageKeyFor } from './lead-stages.service';
import { LEAD_STAGES } from './lead-stages.catalog';

const tenantId = new Types.ObjectId().toString();

function buildQuery(result: unknown) {
  const q: any = { exec: jest.fn().mockResolvedValue(result) };
  for (const m of ['sort', 'lean', 'select', 'limit'])
    q[m] = jest.fn().mockReturnValue(q);
  return q;
}

/**
 * Modelo de etapas en memoria: suficiente para comprobar las reglas del
 * embudo sin Mongo (find ordenado, create, updateOne, deleteOne, bulkWrite).
 */
function memoryStageModel(initial = LEAD_STAGES.map((s) => ({ ...s }))) {
  let rows: any[] = initial.map((r) => ({ ...r }));
  const model: any = {
    rows: () => rows,
    find: jest.fn(() =>
      buildQuery([...rows].sort((a, b) => a.order - b.order)),
    ),
    insertMany: jest.fn((docs: any[]) => {
      rows.push(...docs.map((d) => ({ ...d })));
      return Promise.resolve(docs);
    }),
    create: jest.fn((doc: any) => {
      rows.push({ ...doc });
      return Promise.resolve(doc);
    }),
    updateOne: jest.fn((filter: any, update: any) => {
      const row = rows.find((r) => r.key === filter.key);
      if (row) Object.assign(row, update.$set);
      return buildQuery({ modifiedCount: row ? 1 : 0 });
    }),
    deleteOne: jest.fn((filter: any) => {
      rows = rows.filter((r) => r.key !== filter.key);
      return buildQuery({ deletedCount: 1 });
    }),
    bulkWrite: jest.fn((ops: any[]) => {
      for (const op of ops) {
        const row = rows.find((r) => r.key === op.updateOne.filter.key);
        if (row) Object.assign(row, op.updateOne.update.$set);
      }
      return Promise.resolve({});
    }),
  };
  return model;
}

describe('LeadStagesService', () => {
  let stageModel: any;
  let leadModel: any;
  let service: LeadStagesService;

  beforeEach(() => {
    stageModel = memoryStageModel();
    leadModel = {
      countDocuments: jest.fn().mockReturnValue(buildQuery(0)),
      updateMany: jest.fn().mockReturnValue(buildQuery({ modifiedCount: 0 })),
    };
    service = new LeadStagesService(stageModel, leadModel);
  });

  it('genera claves estables: slug + sufijo', () => {
    expect(stageKeyFor('Cita agendada')).toMatch(/^cita-agendada-[0-9a-f]{4}$/);
    expect(stageKeyFor('Negociación ÑU')).toMatch(
      /^negociacion-nu-[0-9a-f]{4}$/,
    );
    expect(stageKeyFor('***')).toMatch(/^etapa-[0-9a-f]{4}$/);
  });

  it('siembra una sola vez y cachea la lectura', async () => {
    stageModel = memoryStageModel([]);
    service = new LeadStagesService(stageModel, leadModel);

    const stages = await service.list(tenantId);
    await service.list(tenantId);

    expect(stages.map((s) => s.key)).toEqual(LEAD_STAGES.map((s) => s.key));
    expect(stageModel.insertMany).toHaveBeenCalledTimes(1);
    expect(stageModel.find).toHaveBeenCalledTimes(2); // vacía + tras sembrar
  });

  it('añade una etapa abierta antes de ganado/perdido', async () => {
    const created = await service.create(tenantId, {
      label: ' Cita agendada ',
      color: '#123456',
      probability: 55,
    });

    expect(created.label).toBe('Cita agendada');
    expect(created.key).toMatch(/^cita-agendada-/);
    expect(created.outcome).toBeUndefined();
    const keys = (await service.list(tenantId)).map((s) => s.key);
    expect(keys.slice(-3)).toEqual([created.key, 'won', 'lost']);
  });

  it('no repite nombres de etapa', async () => {
    await expect(service.create(tenantId, { label: 'nuevo' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('renombrar cambia la etiqueta, nunca la clave', async () => {
    const stage = await service.update(tenantId, 'won', {
      label: 'Cerrado',
      color: '#000000',
      probability: 90,
    });
    expect(stage).toMatchObject({
      key: 'won',
      label: 'Cerrado',
      color: '#000000',
      probability: 90,
      outcome: 'won',
    });
  });

  it('editar una etapa que no existe es 404', async () => {
    await expect(
      service.update(tenantId, 'nope', { label: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('reordena con todas las claves y rechaza listas incompletas', async () => {
    const keys = LEAD_STAGES.map((s) => s.key).reverse();
    const stages = await service.reorder(tenantId, keys);
    expect(stages.map((s) => s.key)).toEqual(keys);

    await expect(service.reorder(tenantId, keys.slice(1))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.reorder(tenantId, [...keys.slice(1), keys[1]]),
    ).rejects.toThrow(BadRequestException);
  });

  it('no deja borrar las etapas de ganado y perdido', async () => {
    await expect(service.remove(tenantId, 'won')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.remove(tenantId, 'lost')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deja siempre al menos una etapa abierta', async () => {
    for (const key of ['new', 'contacted', 'qualified', 'proposal'])
      await service.remove(tenantId, key);
    await expect(service.remove(tenantId, 'negotiation')).rejects.toThrow(
      'al menos una etapa abierta',
    );
  });

  it('borra una etapa vacía y renumera el orden', async () => {
    const res = await service.remove(tenantId, 'contacted');
    expect(res).toEqual({ deleted: true, moved: 0 });
    const stages = await service.list(tenantId);
    expect(stages.map((s) => s.key)).not.toContain('contacted');
    expect(stages.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(leadModel.updateMany).not.toHaveBeenCalled();
  });

  it('con oportunidades exige destino y las mueve recalculando el estado', async () => {
    leadModel.countDocuments.mockReturnValue(buildQuery(3));
    leadModel.updateMany.mockReturnValue(buildQuery({ modifiedCount: 3 }));

    await expect(service.remove(tenantId, 'proposal')).rejects.toThrow(
      'indica a qué etapa moverlas',
    );
    await expect(
      service.remove(tenantId, 'proposal', 'proposal'),
    ).rejects.toThrow(BadRequestException);
    await expect(service.remove(tenantId, 'proposal', 'nope')).rejects.toThrow(
      BadRequestException,
    );

    const res = await service.remove(tenantId, 'proposal', 'lost');
    expect(res).toEqual({ deleted: true, moved: 3 });
    const [filter, update] = leadModel.updateMany.mock.calls[0];
    expect(filter.stage).toBe('proposal');
    expect(update.$set).toMatchObject({ stage: 'lost', status: 'lost' });
    expect(update.$set.closedAt).toBeInstanceOf(Date);

    await service.remove(tenantId, 'qualified', 'new');
    const [, reopen] = leadModel.updateMany.mock.calls[1];
    expect(reopen.$set).toEqual({ stage: 'new', status: 'open' });
    expect(reopen.$unset).toEqual({ closedAt: 1, lostReason: 1 });
  });
});
