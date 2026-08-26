import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { RolesService } from './roles.service';
import { User } from '../users/user.schema';
import { ACTIONS, ACTION_LABELS, MODULES } from './modules.catalog';

export class UpdateRoleModulesDto {
  @IsArray()
  @IsString({ each: true })
  modules: string[];

  /** módulo → acciones permitidas. Omitirlo deja las acciones como estaban. */
  @IsOptional()
  @IsObject()
  actions?: Record<string, string[]>;
}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(
    private roles: RolesService,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /** Lo que puede ver y hacer el usuario actual. Lo consume el menú y los guards. */
  @Get('me/permissions')
  async myPermissions(@Request() req: AuthReq) {
    const access = await this.roles.accessFor(req.user.tenantId, req.user.role);
    return {
      role: req.user.role,
      modules: access.modules,
      actions: access.actions,
      // Vacío significa "todos los locales": es como estaban todos los usuarios
      // antes de que existiera esta restricción.
      localIds: req.user.localIds ?? [],
    };
  }

  /** Catálogo de módulos y acciones, para pintar la matriz. */
  @Get('roles/catalog')
  catalog(@Request() req: AuthReq) {
    this.assertAdmin(req);
    return {
      modules: MODULES,
      actions: ACTIONS.map((key) => ({ key, label: ACTION_LABELS[key] })),
    };
  }

  @Get('roles')
  async findAll(@Request() req: AuthReq) {
    this.assertAdmin(req);
    const roles = await this.roles.findAll(req.user.tenantId);
    const counts = await this.usersPerRole(req.user.tenantId);
    // El recuento evita que el administrador borre un rol que alguien usa sin
    // enterarse hasta que el servidor lo rechaza.
    return roles.map((r) => ({
      ...r.toObject(),
      userCount: counts[r.key] ?? 0,
    }));
  }

  @Post('roles')
  create(@Body() dto: CreateRoleDto, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.roles.create(req.user.tenantId, dto.label);
  }

  @Patch('roles/:key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateRoleModulesDto,
    @Request() req: AuthReq,
  ) {
    this.assertAdmin(req);
    return this.roles.update(
      req.user.tenantId,
      key,
      dto.modules,
      dto.actions,
    );
  }

  @Delete('roles/:key')
  async remove(@Param('key') key: string, @Request() req: AuthReq) {
    this.assertAdmin(req);
    const inUse = await this.userModel.countDocuments({
      tenantId: new Types.ObjectId(req.user.tenantId),
      role: key,
    });
    await this.roles.remove(req.user.tenantId, key, inUse);
    return { deleted: true };
  }

  /** Cuántos usuarios tiene cada rol, para avisar antes de borrarlo. */
  private async usersPerRole(tenantId: string): Promise<Record<string, number>> {
    const rows = await this.userModel.aggregate<{ _id: string; n: number }>([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      { $group: { _id: '$role', n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  /** Configurar quién accede a qué es competencia exclusiva del administrador. */
  private assertAdmin(req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPERADMIN')
      throw new ForbiddenException('Solo el administrador gestiona los roles');
  }
}
