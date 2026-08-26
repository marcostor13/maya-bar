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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { UsersService } from './users.service';
import { ActiveUserCache } from '../auth/active-user.cache';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private activeUsers: ActiveUserCache,
  ) {}

  @Get()
  listUsers(@Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.findAllByTenant(req.user.tenantId);
  }

  @Post()
  async createUser(@Body() body: CreateUserDto, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.createTenantUser(req.user.tenantId, body);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.updateUser(id, req.user.tenantId, body);
  }

  /** Lo que este usuario tiene asociado, para enseñarlo antes de confirmar. */
  @Get(':id/impact')
  deletionImpact(@Param('id') id: string, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.deletionImpact(id, req.user.tenantId);
  }

  /** Usuarios a los que se puede transferir el contenido. */
  @Get(':id/reassign-candidates')
  reassignCandidates(@Param('id') id: string, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.reassignCandidates(id, req.user.tenantId);
  }

  /**
   * `mode=deactivate` (por defecto) desactiva y conserva todo.
   * `mode=delete` elimina definitivamente, reasignando antes lo que creó a
   * `reassignTo` o, si va vacío, dejándolo a nivel de empresa.
   */
  @Delete(':id')
  async removeUser(
    @Param('id') id: string,
    @Query('mode') mode: string,
    @Query('reassignTo') reassignTo: string,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();

    if (mode === 'delete') {
      const result = await this.usersService.deleteUser(
        id,
        req.user.tenantId,
        req.user.userId,
        reassignTo || undefined,
      );
      this.activeUsers.invalidate(id);
      return result;
    }

    await this.usersService.deactivateUser(id, req.user.tenantId);
    // Sin esto el token del desactivado seguiría valiendo hasta que expire la caché.
    this.activeUsers.invalidate(id);
    return { ok: true };
  }
}
