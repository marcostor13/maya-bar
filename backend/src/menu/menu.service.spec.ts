import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MenuService } from './menu.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const tenantOid = new Types.ObjectId();
const tenantId = tenantOid.toString();
const localId = new Types.ObjectId().toString();
const categoryId = new Types.ObjectId().toString();

function buildQuery(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(),
    tenantId: tenantOid,
    name: 'Pisco sour',
    price: 28,
    isAvailable: true,
    save: jest.fn(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function createMockModel() {
  const model: any = jest.fn();
  model.find = jest.fn().mockReturnValue(buildQuery([]));
  model.findById = jest.fn().mockReturnValue(buildQuery(null));
  model.findByIdAndDelete = jest.fn().mockReturnValue(buildQuery(null));
  model.findOneAndUpdate = jest.fn().mockReturnValue(buildQuery(null));
  model.deleteMany = jest.fn().mockReturnValue(buildQuery({}));
  model.countDocuments = jest.fn().mockResolvedValue(0);
  return model;
}

function captureCreated(model: any) {
  const captured: { data?: any } = {};
  model.mockImplementation((data: any) => {
    captured.data = data;
    return makeDoc(data);
  });
  return captured;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('MenuService', () => {
  let service: MenuService;
  let categoryModel: any;
  let itemModel: any;

  beforeEach(() => {
    categoryModel = createMockModel();
    itemModel = createMockModel();
    service = new MenuService(categoryModel as never, itemModel as never);
  });

  // ─── categorías ─────────────────────────────────────────────────────────────

  describe('createCategory', () => {
    it('crea la categoría en la empresa y la coloca al final del local', async () => {
      categoryModel.countDocuments.mockResolvedValue(3);
      const captured = captureCreated(categoryModel);

      await service.createCategory(tenantId, { localId, name: 'Cócteles' });

      expect(
        categoryModel.countDocuments.mock.calls[0][0].localId.toString(),
      ).toBe(localId);
      expect(captured.data.tenantId.toString()).toBe(tenantId);
      expect(captured.data.localId).toBeInstanceOf(Types.ObjectId);
      expect(captured.data.localId.toString()).toBe(localId);
      expect(captured.data).toMatchObject({ name: 'Cócteles', sortOrder: 3 });
    });

    it('respeta la posición enviada, también la 0', async () => {
      categoryModel.countDocuments.mockResolvedValue(3);
      const captured = captureCreated(categoryModel);

      await service.createCategory(tenantId, {
        localId,
        name: 'Entradas',
        sortOrder: 0,
      });

      expect(captured.data.sortOrder).toBe(0);
    });
  });

  describe('findCategories', () => {
    it('lista las categorías activas del local dentro de la empresa, en orden', async () => {
      const query = buildQuery([]);
      categoryModel.find.mockReturnValue(query);

      await service.findCategories(tenantId, localId);

      const filter = categoryModel.find.mock.calls[0][0];
      expect(Object.keys(filter).sort()).toEqual([
        'isActive',
        'localId',
        'tenantId',
      ]);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.localId.toString()).toBe(localId);
      expect(filter.isActive).toBe(true);
      expect(query.sort).toHaveBeenCalledWith({ sortOrder: 1, createdAt: 1 });
    });
  });

  describe('updateCategory', () => {
    it('aplica los cambios y guarda', async () => {
      const cat = makeDoc({ name: 'Cócteles', description: 'De autor' });
      categoryModel.findById.mockReturnValue(buildQuery(cat));

      await service.updateCategory(cat._id.toString(), tenantId, {
        name: 'Coctelería',
      });

      expect(cat.name).toBe('Coctelería');
      expect(cat.description).toBe('De autor');
      expect(cat.save).toHaveBeenCalledTimes(1);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(
        service.updateCategory('x', tenantId, { name: 'N' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('una categoría de otra empresa no se modifica', async () => {
      const cat = makeDoc({ tenantId: new Types.ObjectId(), name: 'Ajena' });
      categoryModel.findById.mockReturnValue(buildQuery(cat));

      await expect(
        service.updateCategory('x', tenantId, { name: 'Hackeada' }),
      ).rejects.toThrow(ForbiddenException);
      expect(cat.name).toBe('Ajena');
      expect(cat.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('borra la categoría y los ítems que colgaban de ella', async () => {
      categoryModel.findById.mockReturnValue(buildQuery(makeDoc()));

      await service.deleteCategory(categoryId, tenantId);

      expect(categoryModel.findByIdAndDelete).toHaveBeenCalledWith(categoryId);
      const filter = itemModel.deleteMany.mock.calls[0][0];
      expect(Object.keys(filter)).toEqual(['categoryId']);
      expect(filter.categoryId.toString()).toBe(categoryId);
    });

    it('id inexistente lanza NotFoundException y no borra ítems', async () => {
      await expect(
        service.deleteCategory(categoryId, tenantId),
      ).rejects.toThrow(NotFoundException);
      expect(itemModel.deleteMany).not.toHaveBeenCalled();
    });

    it('una categoría de otra empresa no se borra, ni sus ítems', async () => {
      categoryModel.findById.mockReturnValue(
        buildQuery(makeDoc({ tenantId: new Types.ObjectId() })),
      );

      await expect(
        service.deleteCategory(categoryId, tenantId),
      ).rejects.toThrow(ForbiddenException);
      expect(categoryModel.findByIdAndDelete).not.toHaveBeenCalled();
      expect(itemModel.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── reordenar ──────────────────────────────────────────────────────────────

  describe.each([
    ['reorderCategories', () => 'category'],
    ['reorderItems', () => 'item'],
  ] as const)('%s', (method, which) => {
    const model = () => (which() === 'category' ? categoryModel : itemModel);

    it('guarda la posición de cada id, siempre dentro de la empresa', async () => {
      const ids = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];

      await service[method](tenantId, { localId, ids });

      const calls = model().findOneAndUpdate.mock.calls;
      expect(calls).toHaveLength(3);
      calls.forEach(([filter, change]: [any, any], index: number) => {
        expect(Object.keys(filter).sort()).toEqual(['_id', 'tenantId']);
        expect(filter._id.toString()).toBe(ids[index]);
        expect(filter.tenantId.toString()).toBe(tenantId);
        expect(change).toEqual({ sortOrder: index });
      });
    });

    it('con la lista vacía no escribe nada', async () => {
      await service[method](tenantId, { localId, ids: [] });

      expect(model().findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── ítems ──────────────────────────────────────────────────────────────────

  describe('createItem', () => {
    it('crea el ítem en la empresa y lo coloca al final de su categoría', async () => {
      itemModel.countDocuments.mockResolvedValue(5);
      const captured = captureCreated(itemModel);

      await service.createItem(tenantId, {
        localId,
        categoryId,
        name: 'Pisco sour',
        price: 28,
      });

      expect(
        itemModel.countDocuments.mock.calls[0][0].categoryId.toString(),
      ).toBe(categoryId);
      expect(captured.data.tenantId.toString()).toBe(tenantId);
      expect(captured.data.localId).toBeInstanceOf(Types.ObjectId);
      expect(captured.data.localId.toString()).toBe(localId);
      expect(captured.data.categoryId).toBeInstanceOf(Types.ObjectId);
      expect(captured.data.categoryId.toString()).toBe(categoryId);
      expect(captured.data).toMatchObject({
        name: 'Pisco sour',
        price: 28,
        sortOrder: 5,
      });
    });

    it('respeta la posición enviada, también la 0', async () => {
      itemModel.countDocuments.mockResolvedValue(5);
      const captured = captureCreated(itemModel);

      await service.createItem(tenantId, {
        localId,
        categoryId,
        name: 'Agua',
        price: 5,
        sortOrder: 0,
      });

      expect(captured.data.sortOrder).toBe(0);
    });
  });

  describe('findItems', () => {
    it('lista los ítems activos del local dentro de la empresa, en orden', async () => {
      const query = buildQuery([]);
      itemModel.find.mockReturnValue(query);

      await service.findItems(tenantId, localId);

      const filter = itemModel.find.mock.calls[0][0];
      expect(Object.keys(filter).sort()).toEqual([
        'isActive',
        'localId',
        'tenantId',
      ]);
      expect(filter.tenantId.toString()).toBe(tenantId);
      expect(filter.localId.toString()).toBe(localId);
      expect(query.sort).toHaveBeenCalledWith({ sortOrder: 1, createdAt: 1 });
    });

    it('con categoría filtra además por ella, sin salir de la empresa', async () => {
      await service.findItems(tenantId, localId, categoryId);

      const filter = itemModel.find.mock.calls[0][0];
      expect(filter.categoryId.toString()).toBe(categoryId);
      expect(filter.tenantId.toString()).toBe(tenantId);
    });
  });

  describe('updateItem', () => {
    it('aplica los cambios y convierte la nueva categoría a ObjectId', async () => {
      const item = makeDoc();
      itemModel.findById.mockReturnValue(buildQuery(item));

      await service.updateItem(item._id.toString(), tenantId, {
        price: 32,
        categoryId,
      });

      expect(item.price).toBe(32);
      expect(item.name).toBe('Pisco sour');
      expect(item.categoryId).toBeInstanceOf(Types.ObjectId);
      expect(item.categoryId.toString()).toBe(categoryId);
      expect(item.save).toHaveBeenCalledTimes(1);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(
        service.updateItem('x', tenantId, { price: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('un ítem de otra empresa no se modifica', async () => {
      const item = makeDoc({ tenantId: new Types.ObjectId() });
      itemModel.findById.mockReturnValue(buildQuery(item));

      await expect(
        service.updateItem('x', tenantId, { price: 1 }),
      ).rejects.toThrow(ForbiddenException);
      expect(item.price).toBe(28);
      expect(item.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteItem', () => {
    it('borra el ítem de la empresa', async () => {
      const item = makeDoc();
      itemModel.findById.mockReturnValue(buildQuery(item));
      const id = item._id.toString();

      await service.deleteItem(id, tenantId);

      expect(itemModel.findByIdAndDelete).toHaveBeenCalledWith(id);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.deleteItem('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
      expect(itemModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('un ítem de otra empresa no se borra', async () => {
      itemModel.findById.mockReturnValue(
        buildQuery(makeDoc({ tenantId: new Types.ObjectId() })),
      );

      await expect(service.deleteItem('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(itemModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  describe('toggleAvailability', () => {
    it('agota un ítem disponible y lo repone al volver a llamar', async () => {
      const item = makeDoc({ isAvailable: true });
      itemModel.findById.mockReturnValue(buildQuery(item));

      const agotado = await service.toggleAvailability('x', tenantId);
      expect(agotado.isAvailable).toBe(false);

      const repuesto = await service.toggleAvailability('x', tenantId);
      expect(repuesto.isAvailable).toBe(true);
      expect(item.save).toHaveBeenCalledTimes(2);
    });

    it('id inexistente lanza NotFoundException', async () => {
      await expect(service.toggleAvailability('x', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('un ítem de otra empresa no cambia de disponibilidad', async () => {
      const item = makeDoc({ tenantId: new Types.ObjectId() });
      itemModel.findById.mockReturnValue(buildQuery(item));

      await expect(service.toggleAvailability('x', tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(item.isAvailable).toBe(true);
      expect(item.save).not.toHaveBeenCalled();
    });
  });
});
