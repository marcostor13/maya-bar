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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  MANAGE_ROLES,
  AVAILABILITY_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderDto,
  CreateItemDto,
  UpdateItemDto,
} from './dto/menu.dto';

@Controller('menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
  constructor(private menuService: MenuService) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  @Get('categories')
  getCategories(@Query('localId') localId: string, @Request() req: AuthReq) {
    return this.menuService.findCategories(req.user.tenantId, localId);
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.createCategory(req.user.tenantId, dto);
  }

  @Patch('categories/reorder')
  reorderCategories(@Body() dto: ReorderDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.reorderCategories(req.user.tenantId, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.updateCategory(id, req.user.tenantId, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.deleteCategory(id, req.user.tenantId);
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  @Get('items')
  getItems(
    @Query('localId') localId: string,
    @Query('categoryId') categoryId: string,
    @Request() req: AuthReq,
  ) {
    return this.menuService.findItems(req.user.tenantId, localId, categoryId);
  }

  @Post('items')
  createItem(@Body() dto: CreateItemDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.createItem(req.user.tenantId, dto);
  }

  @Patch('items/reorder')
  reorderItems(@Body() dto: ReorderDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.reorderItems(req.user.tenantId, dto);
  }

  @Patch('items/:id/availability')
  toggleAvailability(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, AVAILABILITY_ROLES);
    return this.menuService.toggleAvailability(id, req.user.tenantId);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.updateItem(id, req.user.tenantId, dto);
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.menuService.deleteItem(id, req.user.tenantId);
  }
}
