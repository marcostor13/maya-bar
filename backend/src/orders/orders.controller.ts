import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  MANAGE_ROLES,
  OPERATIONAL_ROLES,
  ADVANCE_ORDER_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderLineItem, OrderStatus } from './order.schema';

@Controller()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  // ─── Public routes (no auth) ──────────────────────────────────────────────

  @Get('public/menu')
  getPublicMenu(@Query('localId') localId: string) {
    return this.ordersService.getPublicMenu(localId);
  }

  @Post('public/orders')
  createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  @Get('public/orders/:id')
  trackOrder(@Param('id') id: string) {
    return this.ordersService.findOrderById(id);
  }

  @Post('public/orders/:id/call-waiter')
  callWaiter(@Param('id') id: string) {
    return this.ordersService.callWaiter(id);
  }

  @Post('public/orders/:id/call-bill')
  callBill(@Param('id') id: string) {
    return this.ordersService.callBill(id);
  }

  // ─── Staff routes (auth required) ─────────────────────────────────────────

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  findOrders(
    @Query('localId') localId: string,
    @Query('status') status: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, OPERATIONAL_ROLES);
    return this.ordersService.findOrders(req.user.tenantId, localId, status);
  }

  @Get('orders/tables')
  @UseGuards(JwtAuthGuard)
  getLocalTables(
    @Query('localId') localId: string,
    @Request() req: AuthReq,
    @Headers('origin') origin: string,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    const baseUrl = origin || 'http://localhost:4200';
    return this.ordersService.getLocalTables(
      localId,
      req.user.tenantId,
      baseUrl,
    );
  }

  @Patch('orders/:id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, ADVANCE_ORDER_ROLES);
    return this.ordersService.updateStatus(
      id,
      req.user.tenantId,
      dto.status as OrderStatus,
    );
  }

  @Patch('orders/:id')
  @UseGuards(JwtAuthGuard)
  modifyOrder(
    @Param('id') id: string,
    @Body() body: { items: OrderLineItem[]; notes?: string },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, ADVANCE_ORDER_ROLES);
    return this.ordersService.modifyOrder(
      id,
      req.user.tenantId,
      body.items,
      body.notes,
    );
  }

  @Delete('orders/:id')
  @UseGuards(JwtAuthGuard)
  cancelOrder(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.ordersService.cancelOrder(id, req.user.tenantId);
  }
}
