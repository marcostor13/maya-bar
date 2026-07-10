import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContactList, SegmentRule } from './contact-list.schema';
import { Customer } from '../customers/customer.schema';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import { isOwnerScoped } from '../auth/permissions';

@Injectable()
export class ListsService {
  constructor(
    @InjectModel(ContactList.name) private listModel: Model<ContactList>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
  ) {}

  async findAll(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactList[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (isOwnerScoped(role)) filter['createdBy'] = new Types.ObjectId(userId);
    return this.listModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(
    id: string,
    tenantId: string,
    userId?: string,
    role?: string,
  ): Promise<ContactList> {
    const list = await this.listModel.findById(id).exec();
    if (!list) throw new NotFoundException('Lista no encontrada');
    if (list.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (
      role &&
      userId &&
      isOwnerScoped(role) &&
      list.createdBy?.toString() !== userId
    )
      throw new ForbiddenException();
    return list;
  }

  async create(
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateListDto,
  ): Promise<ContactList> {
    const list = new this.listModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      rules: dto.rules ?? [],
      memberIds: [],
      memberCount: 0,
      color: dto.color ?? '#6366F1',
      ...(isOwnerScoped(role) ? { createdBy: new Types.ObjectId(userId) } : {}),
    });
    const saved = await list.save();
    if (dto.type === 'dynamic' && dto.rules?.length) {
      await this.refreshDynamicCount(saved);
    }
    return saved;
  }

  async update(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateListDto,
  ): Promise<ContactList> {
    const list = await this.findOne(id, tenantId, userId, role);
    Object.assign(list, dto);
    const saved = await list.save();
    if (list.type === 'dynamic') await this.refreshDynamicCount(saved);
    return saved;
  }

  async delete(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const list = await this.findOne(id, tenantId, userId, role);
    await this.listModel.findByIdAndDelete(list._id).exec();
  }

  async addMembers(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    customerIds: string[],
  ): Promise<ContactList> {
    const list = await this.findOne(id, tenantId, userId, role);
    if (list.type !== 'static')
      throw new BadRequestException(
        'Solo se pueden agregar miembros manualmente a listas estáticas',
      );
    const newIds = customerIds.map((cid) => new Types.ObjectId(cid));
    const existing = new Set(list.memberIds.map((mid) => mid.toString()));
    const toAdd = newIds.filter((id) => !existing.has(id.toString()));
    list.memberIds.push(...toAdd);
    list.memberCount = list.memberIds.length;
    return list.save();
  }

  async removeMember(
    listId: string,
    customerId: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactList> {
    const list = await this.findOne(listId, tenantId, userId, role);
    if (list.type !== 'static')
      throw new BadRequestException('Solo listas estáticas');
    list.memberIds = list.memberIds.filter(
      (mid) => mid.toString() !== customerId,
    );
    list.memberCount = list.memberIds.length;
    return list.save();
  }

  async getMembers(
    id: string,
    tenantId: string,
    userId?: string,
    role?: string,
  ): Promise<Customer[]> {
    const list = await this.findOne(id, tenantId, userId, role);
    const tid = new Types.ObjectId(tenantId);
    if (list.type === 'static') {
      return this.customerModel
        .find({ _id: { $in: list.memberIds }, tenantId: tid })
        .lean()
        .exec();
    }
    const filter = this.buildFilter(list.rules, tid);
    return this.customerModel.find(filter).lean().exec();
  }

  async previewCount(
    id: string,
    tenantId: string,
    userId?: string,
    role?: string,
  ): Promise<{ count: number }> {
    const list = await this.findOne(id, tenantId, userId, role);
    const tid = new Types.ObjectId(tenantId);
    if (list.type === 'static') return { count: list.memberCount };
    const filter = this.buildFilter(list.rules, tid);
    const count = await this.customerModel.countDocuments(filter);
    return { count };
  }

  async previewRules(
    tenantId: string,
    rules: SegmentRule[],
  ): Promise<{ count: number }> {
    const tid = new Types.ObjectId(tenantId);
    const filter = this.buildFilter(rules, tid);
    const count = await this.customerModel.countDocuments(filter);
    return { count };
  }

  async previewCountForLists(
    listIds: string[],
    tenantId: string,
  ): Promise<{ count: number }> {
    const customers = await this.resolveCustomers(listIds, tenantId);
    return { count: customers.length };
  }

  async resolveCustomers(
    listIds: string[],
    tenantId: string,
  ): Promise<Customer[]> {
    const customerMap = new Map<string, Customer>();
    for (const id of listIds) {
      try {
        const members = await this.getMembers(id, tenantId);
        members.forEach((c) => customerMap.set(c._id.toString(), c));
      } catch {
        /* skip invalid list */
      }
    }
    return Array.from(customerMap.values());
  }

  private async refreshDynamicCount(list: ContactList): Promise<void> {
    const filter = this.buildFilter(list.rules, list.tenantId);
    list.memberCount = await this.customerModel.countDocuments(filter);
    await list.save();
  }

  private buildFilter(
    rules: SegmentRule[],
    tenantId: Types.ObjectId,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { tenantId };
    for (const rule of rules) {
      switch (rule.field) {
        case 'tags':
          if (rule.operator === 'has_any')
            filter['tags'] = {
              $in: Array.isArray(rule.value) ? rule.value : [rule.value],
            };
          else if (rule.operator === 'has_all')
            filter['tags'] = {
              $all: Array.isArray(rule.value) ? rule.value : [rule.value],
            };
          break;
        case 'source':
          if (rule.operator === 'equals') filter['source'] = rule.value;
          else if (rule.operator === 'not_equals')
            filter['source'] = { $ne: rule.value };
          break;
        case 'totalReservations':
          if (rule.operator === 'gte')
            filter['totalReservations'] = { $gte: Number(rule.value) };
          else if (rule.operator === 'lte')
            filter['totalReservations'] = { $lte: Number(rule.value) };
          else if (rule.operator === 'equals')
            filter['totalReservations'] = Number(rule.value);
          break;
        case 'totalEvents':
          if (rule.operator === 'gte')
            filter['totalEvents'] = { $gte: Number(rule.value) };
          else if (rule.operator === 'lte')
            filter['totalEvents'] = { $lte: Number(rule.value) };
          else if (rule.operator === 'equals')
            filter['totalEvents'] = Number(rule.value);
          break;
        case 'daysSinceLastVisit':
          if (rule.operator === 'lte') {
            filter['lastVisit'] = {
              $gte: new Date(Date.now() - Number(rule.value) * 86_400_000),
            };
          } else if (rule.operator === 'gte') {
            filter['lastVisit'] = {
              $lte: new Date(Date.now() - Number(rule.value) * 86_400_000),
            };
          }
          break;
      }
    }
    return filter;
  }
}
