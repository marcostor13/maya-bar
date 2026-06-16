import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MenuCategory } from './menu-category.schema';
import { MenuItem } from './menu-item.schema';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderDto,
  CreateItemDto,
  UpdateItemDto,
} from './dto/menu.dto';

@Injectable()
export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name) private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
  ) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  async createCategory(
    tenantId: string,
    dto: CreateCategoryDto,
  ): Promise<MenuCategory> {
    const count = await this.categoryModel.countDocuments({
      localId: new Types.ObjectId(dto.localId),
    });
    const category = new this.categoryModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(dto.localId),
      sortOrder: dto.sortOrder ?? count,
    });
    return category.save();
  }

  async findCategories(
    tenantId: string,
    localId: string,
  ): Promise<MenuCategory[]> {
    return this.categoryModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        localId: new Types.ObjectId(localId),
        isActive: true,
      })
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();
  }

  async updateCategory(
    id: string,
    tenantId: string,
    dto: UpdateCategoryDto,
  ): Promise<MenuCategory> {
    const cat = await this.categoryModel.findById(id).exec();
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    if (cat.tenantId.toString() !== tenantId) throw new ForbiddenException();
    Object.assign(cat, dto);
    return cat.save();
  }

  async deleteCategory(id: string, tenantId: string): Promise<void> {
    const cat = await this.categoryModel.findById(id).exec();
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    if (cat.tenantId.toString() !== tenantId) throw new ForbiddenException();
    await this.categoryModel.findByIdAndDelete(id).exec();
    await this.itemModel
      .deleteMany({ categoryId: new Types.ObjectId(id) })
      .exec();
  }

  async reorderCategories(tenantId: string, dto: ReorderDto): Promise<void> {
    await Promise.all(
      dto.ids.map((id, index) =>
        this.categoryModel
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(id),
              tenantId: new Types.ObjectId(tenantId),
            },
            { sortOrder: index },
          )
          .exec(),
      ),
    );
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  async createItem(tenantId: string, dto: CreateItemDto): Promise<MenuItem> {
    const count = await this.itemModel.countDocuments({
      categoryId: new Types.ObjectId(dto.categoryId),
    });
    const item = new this.itemModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(dto.localId),
      categoryId: new Types.ObjectId(dto.categoryId),
      sortOrder: dto.sortOrder ?? count,
    });
    return item.save();
  }

  async findItems(
    tenantId: string,
    localId: string,
    categoryId?: string,
  ): Promise<MenuItem[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(localId),
      isActive: true,
    };
    if (categoryId) filter['categoryId'] = new Types.ObjectId(categoryId);
    return this.itemModel
      .find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();
  }

  async updateItem(
    id: string,
    tenantId: string,
    dto: UpdateItemDto,
  ): Promise<MenuItem> {
    const item = await this.itemModel.findById(id).exec();
    if (!item) throw new NotFoundException('Ítem no encontrado');
    if (item.tenantId.toString() !== tenantId) throw new ForbiddenException();
    const update: Record<string, unknown> = { ...dto };
    if (dto.categoryId)
      update['categoryId'] = new Types.ObjectId(dto.categoryId);
    Object.assign(item, update);
    return item.save();
  }

  async deleteItem(id: string, tenantId: string): Promise<void> {
    const item = await this.itemModel.findById(id).exec();
    if (!item) throw new NotFoundException('Ítem no encontrado');
    if (item.tenantId.toString() !== tenantId) throw new ForbiddenException();
    await this.itemModel.findByIdAndDelete(id).exec();
  }

  // HU-2.3: Toggle disponibilidad (Sistema 86)
  async toggleAvailability(id: string, tenantId: string): Promise<MenuItem> {
    const item = await this.itemModel.findById(id).exec();
    if (!item) throw new NotFoundException('Ítem no encontrado');
    if (item.tenantId.toString() !== tenantId) throw new ForbiddenException();
    item.isAvailable = !item.isAvailable;
    return item.save();
  }

  async reorderItems(tenantId: string, dto: ReorderDto): Promise<void> {
    await Promise.all(
      dto.ids.map((id, index) =>
        this.itemModel
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(id),
              tenantId: new Types.ObjectId(tenantId),
            },
            { sortOrder: index },
          )
          .exec(),
      ),
    );
  }
}
