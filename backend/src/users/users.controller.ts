import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  listUsers(@Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.findAllByTenant(req.user.tenantId);
  }

  @Post()
  async createUser(
    @Body() body: { name: string; email: string; role: string },
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.createTenantUser(req.user.tenantId, body);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() body: { name?: string; role?: string; isActive?: boolean },
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.usersService.updateUser(id, req.user.tenantId, body);
  }

  @Delete(':id')
  async deactivateUser(@Param('id') id: string, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    await this.usersService.deactivateUser(id, req.user.tenantId);
    return { ok: true };
  }
}
