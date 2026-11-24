import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { UsersService } from './users.service';
import { UserAdminService } from './user-admin.service';
import { UserAuditService, type AuditActor } from './user-audit.service';
import {
  CreateUserDto,
  ResetAccessDto,
  TransferAdminDto,
  UpdateUserDto,
} from './dto/user.dto';

import { Audit } from '../audit/audit.decorator';
/** Quién actúa, con su nombre para el registro. */
export async function actorOf(
  req: AuthReq,
  users: UsersService,
): Promise<AuditActor> {
  const me = await users.findById(req.user.userId);
  return {
    userId: req.user.userId,
    role: req.user.role,
    name: me?.name || me?.email,
  };
}

/** Equipo de la empresa. Solo el administrador; siempre dentro de su empresa. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private admin: UserAdminService,
    private audit: UserAuditService,
    // Global (HU42); opcional para las pruebas que montan solo el controlador.
    @Optional() private limits?: PlanLimitsService,
  ) {}

  private assertAdmin(req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
  }

  @Get()
  listUsers(@Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.usersService.findAllByTenant(req.user.tenantId);
  }

  @Audit({
    action: 'users.created',
    resource: 'user',
    bodyFields: ['email', 'role'],
  })
  @Post()
  async createUser(@Body() body: CreateUserDto, @Request() req: AuthReq) {
    this.assertAdmin(req);
    await this.limits?.assertCanAdd(req.user.tenantId, 'users');
    return this.admin.create(
      req.user.tenantId,
      body,
      await actorOf(req, this.usersService),
    );
  }

  /** Registro de cambios de la empresa (opcionalmente de un usuario). */
  @Get('audit')
  listAudit(@Query('targetId') targetId: string, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.audit.list({ tenantId: req.user.tenantId, targetId });
  }

  /** Pasa la administración a otro usuario y quien la tenía toma `newRole`. */
  @Audit({
    action: 'users.admin_transferred',
    resource: 'user',
    bodyFields: ['userId'],
  })
  @Post('transfer-admin')
  async transferAdmin(@Body() body: TransferAdminDto, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.admin.transferAdmin(
      req.user.tenantId,
      await actorOf(req, this.usersService),
      body.toUserId,
      body.newRole,
    );
  }

  @Audit({
    action: 'users.updated',
    resource: 'user',
    bodyFields: ['role', 'isActive', 'localIds'],
  })
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Request() req: AuthReq,
  ) {
    this.assertAdmin(req);
    // Reactivar cuenta contra el límite de usuarios del plan (HU42).
    if (body.isActive === true) {
      const target = await this.usersService.findById(id).catch(() => null);
      if (target && target.isActive === false)
        await this.limits?.assertCanAdd(req.user.tenantId, 'users');
    }
    return this.admin.update(
      id,
      req.user.tenantId,
      body,
      await actorOf(req, this.usersService),
    );
  }

  @Audit({ action: 'users.access_reset', resource: 'user' })
  @Post(':id/reset-access')
  async resetAccess(
    @Param('id') id: string,
    @Body() body: ResetAccessDto,
    @Request() req: AuthReq,
  ) {
    this.assertAdmin(req);
    return this.admin.resetAccess(
      id,
      req.user.tenantId,
      body.mode,
      await actorOf(req, this.usersService),
      { password: body.password, mustChange: body.mustChange },
    );
  }

  /** Cierra todas las sesiones del usuario sin cambiar su contraseña (HU19). */
  @Audit({ action: 'users.sessions_revoked', resource: 'user' })
  @Post(':id/sessions/revoke')
  async revokeSessions(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.admin.revokeSessions(
      id,
      req.user.tenantId,
      await actorOf(req, this.usersService),
    );
  }

  /** Lo que este usuario tiene asociado, para enseñarlo antes de confirmar. */
  @Get(':id/impact')
  deletionImpact(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.usersService.deletionImpact(id, req.user.tenantId);
  }

  /** Usuarios a los que se puede transferir el contenido. */
  @Get(':id/reassign-candidates')
  reassignCandidates(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.usersService.reassignCandidates(id, req.user.tenantId);
  }

  /**
   * `mode=deactivate` (por defecto) desactiva y conserva todo.
   * `mode=delete` elimina definitivamente, reasignando antes lo que creó a
   * `reassignTo` o, si va vacío, dejándolo a nivel de empresa.
   */
  @Audit({ action: 'users.deleted', resource: 'user' })
  @Delete(':id')
  async removeUser(
    @Param('id') id: string,
    @Query('mode') mode: string,
    @Query('reassignTo') reassignTo: string,
    @Request() req: AuthReq,
  ) {
    this.assertAdmin(req);
    const actor = await actorOf(req, this.usersService);
    if (mode === 'delete')
      return this.admin.delete(
        id,
        req.user.tenantId,
        actor,
        reassignTo || undefined,
      );
    await this.admin.deactivate(id, req.user.tenantId, actor);
    return { ok: true };
  }
}
