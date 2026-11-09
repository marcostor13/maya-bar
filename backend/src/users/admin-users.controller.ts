import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { UsersService } from './users.service';
import { UserAdminService } from './user-admin.service';
import { UserAuditService } from './user-audit.service';
import { actorOf } from './users.controller';
import { ResetAccessDto, SetActiveDto } from './dto/user.dto';

/**
 * Usuarios de toda la plataforma, para el superadministrador. Cada acción se
 * aplica dentro de la empresa del propio usuario, con las mismas reglas que usa
 * el administrador de esa empresa.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(
    private users: UsersService,
    private admin: UserAdminService,
    private audit: UserAuditService,
  ) {}

  private assertSuper(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
  }

  @Get()
  search(@Query('q') q: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    return this.admin.search(q ?? '');
  }

  @Get('audit')
  listAudit(@Query('targetId') targetId: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    return this.audit.list({ targetId });
  }

  @Patch(':id/active')
  async setActive(
    @Param('id') id: string,
    @Body() body: SetActiveDto,
    @Request() req: AuthReq,
  ) {
    this.assertSuper(req);
    const tenantId = await this.admin.tenantOf(id);
    return this.admin.update(
      id,
      tenantId,
      { isActive: body.isActive },
      await actorOf(req, this.users),
    );
  }

  @Post(':id/reset-access')
  async resetAccess(
    @Param('id') id: string,
    @Body() body: ResetAccessDto,
    @Request() req: AuthReq,
  ) {
    this.assertSuper(req);
    const tenantId = await this.admin.tenantOf(id);
    return this.admin.resetAccess(
      id,
      tenantId,
      body.mode,
      await actorOf(req, this.users),
    );
  }

  @Get(':id/impact')
  async impact(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    return this.users.deletionImpact(id, await this.admin.tenantOf(id));
  }

  @Get(':id/reassign-candidates')
  async candidates(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    return this.users.reassignCandidates(id, await this.admin.tenantOf(id));
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('reassignTo') reassignTo: string,
    @Request() req: AuthReq,
  ) {
    this.assertSuper(req);
    const tenantId = await this.admin.tenantOf(id);
    return this.admin.delete(
      id,
      tenantId,
      await actorOf(req, this.users),
      reassignTo || undefined,
    );
  }
}
