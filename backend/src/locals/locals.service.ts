import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Local } from './local.schema';
import { CreateLocalDto, UpdateLocalDto } from './dto/create-local.dto';

@Injectable()
export class LocalsService {
  constructor(@InjectModel(Local.name) private localModel: Model<Local>) {}

  async create(tenantId: string, dto: CreateLocalDto): Promise<Local> {
    const local = new this.localModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      timezone: dto.timezone || 'America/Lima',
    });
    return local.save();
  }

  async findAll(): Promise<Local[]> {
    return this.localModel
      .find({ isActive: true })
      .populate('tenantId', 'name email slug')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Locales visibles para el usuario. `localIds` vacío significa "todos": es
   * como estaban todos los usuarios antes de que existiera la asignación, y por
   * eso pasar una lista vacía no restringe nada.
   */
  async findAllByTenant(
    tenantId: string,
    localIds?: string[],
  ): Promise<Local[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    };
    const assigned = (localIds ?? []).filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (assigned.length)
      filter._id = { $in: assigned.map((id) => new Types.ObjectId(id)) };
    return this.localModel.find(filter).exec();
  }

  async findById(id: string, tenantId: string): Promise<Local> {
    const local = await this.localModel.findById(id).exec();
    if (!local) throw new NotFoundException('Local not found');
    if (local.tenantId.toString() !== tenantId) throw new ForbiddenException();
    return local;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateLocalDto,
  ): Promise<Local> {
    const local = await this.findById(id, tenantId);
    Object.assign(local, dto);
    return local.save();
  }

  async archive(id: string, tenantId: string): Promise<Local> {
    return this.update(id, tenantId, { isActive: false });
  }

  async clone(id: string, tenantId: string): Promise<Local> {
    const source = await this.findById(id, tenantId);
    const clone = new this.localModel({
      tenantId: source.tenantId,
      name: `${source.name} (copia)`,
      type: source.type,
      address: source.address,
      phone: source.phone,
      email: source.email,
      timezone: source.timezone,
      hours: source.hours,
      tableCount: source.tableCount,
    });
    return clone.save();
  }
}
