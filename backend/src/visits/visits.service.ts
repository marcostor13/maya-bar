import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Visit } from './visit.schema';
import { Customer } from '../customers/customer.schema';
import { CreateVisitDto } from './dto/visit.dto';
import { isOwnerScoped } from '../auth/permissions';

@Injectable()
export class VisitsService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
  ) {}

  async create(
    tenantId: string,
    impulsadorId: string,
    dto: CreateVisitDto,
  ): Promise<Visit> {
    const visit = new this.visitModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      impulsadorId: new Types.ObjectId(impulsadorId),
    });
    return visit.save();
  }

  async findAll(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<Visit[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (isOwnerScoped(role))
      filter['impulsadorId'] = new Types.ObjectId(userId);
    return this.visitModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }

  async delete(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const visit = await this.visitModel.findById(id).exec();
    if (!visit) return;
    if (visit.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role) && visit.impulsadorId.toString() !== userId)
      throw new ForbiddenException();
    await this.visitModel.findByIdAndDelete(id).exec();
  }

  async getStats(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<{
    today: number;
    week: number;
    month: number;
    contacts: number;
    eventRegistrations: number;
  }> {
    const tid = new Types.ObjectId(tenantId);
    const uid = new Types.ObjectId(userId);
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const visitFilter: Record<string, unknown> = { tenantId: tid };
    if (isOwnerScoped(role)) visitFilter['impulsadorId'] = uid;

    const customerFilter: Record<string, unknown> = { tenantId: tid };
    if (isOwnerScoped(role)) customerFilter['createdBy'] = uid;

    const [today, week, month, contacts] = await Promise.all([
      this.visitModel.countDocuments({
        ...visitFilter,
        createdAt: { $gte: startOfDay },
      }),
      this.visitModel.countDocuments({
        ...visitFilter,
        createdAt: { $gte: startOfWeek },
      }),
      this.visitModel.countDocuments({
        ...visitFilter,
        createdAt: { $gte: startOfMonth },
      }),
      this.customerModel.countDocuments(customerFilter),
    ]);

    return { today, week, month, contacts, eventRegistrations: 0 };
  }
}
