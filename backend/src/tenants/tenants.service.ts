import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './tenant.schema';

@Injectable()
export class TenantsService {
  constructor(@InjectModel(Tenant.name) private tenantModel: Model<Tenant>) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantModel.find().sort({ createdAt: -1 }).exec();
  }

  async create(data: {
    name: string;
    email: string;
    ruc?: string;
    phone?: string;
  }): Promise<Tenant> {
    const slug = this.slugify(data.name);
    const exists = await this.tenantModel.findOne({
      $or: [{ email: data.email }, { slug }],
    });
    if (exists)
      throw new ConflictException('Email or business name already registered');

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const tenant = new this.tenantModel({ ...data, slug, trialEndsAt });
    return tenant.save();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantModel.findById(id).exec();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.tenantModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
