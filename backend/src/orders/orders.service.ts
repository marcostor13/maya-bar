import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderStatus, OrderLineItem } from './order.schema';
import { Local } from '../locals/local.schema';
import { MenuCategory } from '../menu/menu-category.schema';
import { MenuItem } from '../menu/menu-item.schema';
import { CreateOrderDto } from './dto/order.dto';
import { OrdersGateway } from './orders.gateway';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Local.name) private localModel: Model<Local>,
    @InjectModel(MenuCategory.name) private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
    private gateway: OrdersGateway,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const local = await this.localModel.findById(dto.localId).exec();
    if (!local) throw new NotFoundException('Local no encontrado');

    const items: OrderLineItem[] = dto.items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      notes: item.notes,
      stations: item.stations ?? ['kitchen'],
      subtotal: item.price * item.quantity,
    }));

    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

    const order = new this.orderModel({
      tenantId: local.tenantId,
      localId: new Types.ObjectId(dto.localId),
      tableNumber: dto.tableNumber,
      type: dto.type ?? 'dine-in',
      status: 'pending',
      items,
      subtotal,
      total: subtotal,
      notes: dto.notes,
      guestName: dto.guestName,
      statusHistory: [{ status: 'pending', at: new Date() }],
    });

    const saved = await order.save();
    this.gateway.emitOrderNew(
      local.tenantId.toString(),
      dto.localId,
      saved.toObject(),
    );
    return saved;
  }

  async findOrderById(id: string): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  async findOrders(
    tenantId: string,
    localId: string,
    status?: string,
  ): Promise<Order[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      localId: new Types.ObjectId(localId),
    };
    if (status) filter.status = status;
    return this.orderModel.find(filter).sort({ createdAt: 1 }).exec();
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.tenantId.toString() !== tenantId) throw new ForbiddenException();
    order.status = status;
    order.statusHistory.push({ status, at: new Date() });
    const saved = await order.save();
    this.gateway.emitOrderUpdated(
      tenantId,
      order.localId.toString(),
      saved.toObject(),
    );
    return saved;
  }

  async cancelOrder(id: string, tenantId: string): Promise<Order> {
    return this.updateStatus(id, tenantId, 'cancelled');
  }

  async modifyOrder(
    id: string,
    tenantId: string,
    items: OrderLineItem[],
    notes?: string,
  ): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (order.status !== 'pending') {
      throw new BadRequestException(
        'Solo se puede modificar un pedido en estado pendiente',
      );
    }
    order.items = items;
    if (notes !== undefined) order.notes = notes;
    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    order.subtotal = subtotal;
    order.total = subtotal;
    const saved = await order.save();
    this.gateway.emitOrderUpdated(
      tenantId,
      order.localId.toString(),
      saved.toObject(),
    );
    return saved;
  }

  async callWaiter(orderId: string): Promise<Order> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Pedido no encontrado');
    order.callWaiter = true;
    const saved = await order.save();
    this.gateway.emitOrderUpdated(
      order.tenantId.toString(),
      order.localId.toString(),
      saved.toObject(),
    );
    return saved;
  }

  async callBill(orderId: string): Promise<Order> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Pedido no encontrado');
    order.callBill = true;
    const saved = await order.save();
    this.gateway.emitOrderUpdated(
      order.tenantId.toString(),
      order.localId.toString(),
      saved.toObject(),
    );
    return saved;
  }

  async getPublicMenu(localId: string): Promise<{
    local: Local;
    categories: MenuCategory[];
    items: MenuItem[];
  }> {
    const local = await this.localModel.findById(localId).exec();
    if (!local || !local.isActive)
      throw new NotFoundException('Local no encontrado');

    const [categories, items] = await Promise.all([
      this.categoryModel
        .find({ localId: new Types.ObjectId(localId), isActive: true })
        .sort({ sortOrder: 1 })
        .exec(),
      this.itemModel
        .find({
          localId: new Types.ObjectId(localId),
          isActive: true,
          isAvailable: true,
        })
        .sort({ sortOrder: 1 })
        .exec(),
    ]);

    return { local, categories, items };
  }

  async getLocalTables(
    localId: string,
    tenantId: string,
    baseUrl: string,
  ): Promise<{ number: number; name: string; qrUrl: string }[]> {
    const local = await this.localModel.findById(localId).exec();
    if (!local) throw new NotFoundException('Local no encontrado');
    if (local.tenantId.toString() !== tenantId) throw new ForbiddenException();

    return Array.from({ length: local.tableCount }, (_, i) => ({
      number: i + 1,
      name: `Mesa ${i + 1}`,
      qrUrl: `${baseUrl}/q/${localId}/${i + 1}`,
    }));
  }
}
