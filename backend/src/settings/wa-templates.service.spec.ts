import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WaTemplatesService } from './wa-templates.service';
import { WaTemplate } from './wa-template.schema';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

const tenantId = new Types.ObjectId().toString();
const accountId = new Types.ObjectId();

const cloudAccount = {
  _id: accountId,
  label: 'Cuenta 1',
  provider: 'cloudapi',
  active: true,
  waAccessToken: 'tok',
  waBusinessAccountId: 'waba1',
};

function query(result: unknown) {
  const q = {
    sort: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  q.sort.mockReturnValue(q);
  return q;
}

describe('WaTemplatesService', () => {
  let service: WaTemplatesService;
  let graph: { get: jest.Mock; post: jest.Mock; delete: jest.Mock };
  let templateModel: {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
    deleteMany: jest.Mock;
  };
  let accounts: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    graph = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    templateModel = {
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
      deleteMany: jest.fn(),
    };
    accounts = { findAll: jest.fn(), findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WaTemplatesService,
        { provide: getModelToken(WaTemplate.name), useValue: templateModel },
        { provide: MetaGraphClient, useValue: graph },
        { provide: WhatsAppAccountsService, useValue: accounts },
      ],
    }).compile();
    service = moduleRef.get(WaTemplatesService);
  });

  describe('sync', () => {
    it('exige al menos una cuenta Cloud API vinculada', async () => {
      accounts.findAll.mockResolvedValue([]);
      await expect(service.sync(tenantId)).rejects.toThrow(
        'Vincula al menos una cuenta de WhatsApp Cloud API primero',
      );
      expect(graph.get).not.toHaveBeenCalled();
    });

    it('trae las plantillas de Meta de cada cuenta y hace upsert local', async () => {
      accounts.findAll.mockResolvedValue([cloudAccount]);
      graph.get.mockResolvedValue({
        data: [
          {
            id: 'm1',
            name: 'bienvenida',
            category: 'MARKETING',
            language: 'es',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'TEXT', text: 'Hola' },
              { type: 'BODY', text: 'Cuerpo {{1}}' },
              { type: 'FOOTER', text: 'Pie' },
            ],
          },
        ],
      });
      templateModel.findOneAndUpdate.mockReturnValue(query({ name: 'bienvenida' }));
      templateModel.deleteMany.mockReturnValue(query({}));
      const list = [{ name: 'bienvenida', accountLabel: 'Cuenta 1' }];
      templateModel.find.mockReturnValue(query(list));

      const res = await service.sync(tenantId);

      expect(res).toEqual(list);
      expect(graph.get).toHaveBeenCalledWith(
        '/waba1/message_templates',
        expect.objectContaining({
          accessToken: 'tok',
          params: { limit: '100' },
        }),
      );
      expect(templateModel.findOneAndUpdate).toHaveBeenCalledWith(
        { tenantId: expect.anything(), accountId, metaId: 'm1' },
        expect.objectContaining({
          name: 'bienvenida',
          body: 'Cuerpo {{1}}',
          headerType: 'TEXT',
          headerText: 'Hola',
          footer: 'Pie',
          status: 'APPROVED',
          accountId,
          accountLabel: 'Cuenta 1',
          wabaId: 'waba1',
        }),
        { upsert: true, new: true },
      );
      expect(templateModel.deleteMany).toHaveBeenCalledWith({
        tenantId: expect.anything(),
        accountId: { $nin: [accountId] },
      });
    });

    it('traduce el error de Meta a BadRequest con status y mensaje', async () => {
      accounts.findAll.mockResolvedValue([cloudAccount]);
      graph.get.mockRejectedValue(new MetaApiError('token expired', 401));
      await expect(service.sync(tenantId)).rejects.toThrow(BadRequestException);
      await expect(service.sync(tenantId)).rejects.toThrow(
        'Meta API 401: token expired',
      );
    });
  });

  describe('create', () => {
    const dto = {
      name: 'promo',
      category: 'MARKETING',
      language: 'es',
      body: 'Hola {{1}}',
      headerText: 'Título',
      footer: 'Pie',
    };

    it('exige al menos una cuenta Cloud API vinculada', async () => {
      accounts.findAll.mockResolvedValue([]);
      await expect(service.create(tenantId, dto as never)).rejects.toThrow(
        'Vincula al menos una cuenta de WhatsApp Cloud API primero',
      );
    });

    it('crea la plantilla en cada cuenta y la persiste como PENDING', async () => {
      accounts.findAll.mockResolvedValue([cloudAccount]);
      graph.post.mockResolvedValue({ id: 'meta9' });
      const doc = { metaId: 'meta9' };
      templateModel.create.mockResolvedValue(doc);

      const res = await service.create(tenantId, dto as never);

      expect(res).toEqual([doc]);
      expect(graph.post).toHaveBeenCalledWith(
        '/waba1/message_templates',
        expect.objectContaining({
          accessToken: 'tok',
          json: expect.objectContaining({
            name: 'promo',
            category: 'MARKETING',
            language: 'es',
            components: [
              { type: 'HEADER', format: 'TEXT', text: 'Título' },
              { type: 'BODY', text: 'Hola {{1}}' },
              { type: 'FOOTER', text: 'Pie' },
            ],
          }),
        }),
      );
      expect(templateModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metaId: 'meta9',
          status: 'PENDING',
          accountId,
          accountLabel: 'Cuenta 1',
          wabaId: 'waba1',
        }),
      );
    });

    it('lanza BadRequest si falla en todas las cuentas', async () => {
      accounts.findAll.mockResolvedValue([cloudAccount]);
      graph.post.mockRejectedValue(
        new MetaApiError('name already exists', 400),
      );
      await expect(service.create(tenantId, dto as never)).rejects.toThrow(
        BadRequestException,
      );
      expect(templateModel.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const template = {
      _id: 'tpl1',
      tenantId: { toString: () => tenantId },
      accountId,
      metaId: 'm1',
      name: 'bienvenida',
    };

    it('borra en Meta (por nombre, usando la cuenta) y localmente', async () => {
      templateModel.findById.mockReturnValue(query(template));
      accounts.findOne.mockResolvedValue(cloudAccount);
      graph.delete.mockResolvedValue({ success: true });
      templateModel.findByIdAndDelete.mockReturnValue(query(null));

      await service.remove(tenantId, 'tpl1');

      expect(accounts.findOne).toHaveBeenCalledWith(accountId.toString(), tenantId);
      expect(graph.delete).toHaveBeenCalledWith(
        '/waba1/message_templates',
        expect.objectContaining({
          accessToken: 'tok',
          params: { name: 'bienvenida' },
        }),
      );
      expect(templateModel.findByIdAndDelete).toHaveBeenCalledWith('tpl1');
    });

    it('borra localmente aunque Meta falle', async () => {
      templateModel.findById.mockReturnValue(query(template));
      accounts.findOne.mockResolvedValue(cloudAccount);
      graph.delete.mockRejectedValue(new MetaApiError('not found', 404));
      templateModel.findByIdAndDelete.mockReturnValue(query(null));

      await expect(service.remove(tenantId, 'tpl1')).resolves.toBeUndefined();
      expect(templateModel.findByIdAndDelete).toHaveBeenCalledWith('tpl1');
    });

    it('rechaza plantillas de otro tenant', async () => {
      templateModel.findById.mockReturnValue(
        query({
          ...template,
          tenantId: { toString: () => new Types.ObjectId().toString() },
        }),
      );
      await expect(service.remove(tenantId, 'tpl1')).rejects.toThrow(
        NotFoundException,
      );
      expect(graph.delete).not.toHaveBeenCalled();
    });
  });
});
