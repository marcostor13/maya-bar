import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { TenantsService } from './tenants.service';
import { UsersService } from '../users/users.service';

interface TenantBody {
  name: string;
  email: string;
  ruc?: string;
  phone?: string;
  ownerName?: string;
}

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private tenantsService: TenantsService,
    private usersService: UsersService,
  ) {}

  // SUPERADMIN: listar todos los tenants
  @Get()
  findAll(@Request() req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.findAll();
  }

  // SUPERADMIN: crear tenant + TENANT_ADMIN, devuelve credenciales
  @Post()
  async createTenant(@Body() body: TenantBody, @Request() req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();

    const tenant = await this.tenantsService.create(body);
    const password = 'Maya@' + crypto.randomBytes(4).toString('hex');

    const user = await this.usersService.create({
      email: body.email,
      password,
      name: body.ownerName ?? body.name,
      role: 'TENANT_ADMIN',
      tenantId: tenant._id,
    });

    return {
      tenant,
      credentials: {
        email: user.email,
        password,
      },
    };
  }

  // SUPERADMIN: editar cualquier tenant
  @Patch(':id')
  updateTenant(
    @Param('id') id: string,
    @Body() body: Partial<TenantBody>,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.update(id, body);
  }

  @Get('me')
  getMyTenant(@Request() req: AuthReq) {
    return this.tenantsService.findById(req.user.tenantId);
  }

  @Patch('me')
  updateMyTenant(@Request() req: AuthReq, @Body() body: Partial<TenantBody>) {
    return this.tenantsService.update(req.user.tenantId, body);
  }
}
