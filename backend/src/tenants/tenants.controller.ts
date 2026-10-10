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
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { TenantsService } from './tenants.service';
import { UsersService } from '../users/users.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/create-tenant.dto';

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
  async createTenant(@Body() body: CreateTenantDto, @Request() req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();

    const tenant = await this.tenantsService.create(body);
    const password = 'Maya@' + crypto.randomBytes(4).toString('hex');

    const user = await this.usersService.create({
      email: body.email,
      password,
      name: body.ownerName ?? body.name,
      role: 'TENANT_ADMIN',
      tenantId: tenant._id,
      mustChangePassword: true,
    });

    return {
      tenant,
      credentials: {
        email: user.email,
        password,
      },
    };
  }

  // Las rutas `me` van ANTES de `:id`: Nest resuelve por orden de
  // declaración y `:id` se quedaría con "me".
  @Get('me')
  getMyTenant(@Request() req: AuthReq) {
    return this.tenantsService.findById(req.user.tenantId);
  }

  /**
   * La empresa edita sus propios datos de contacto. El plan y el estado son
   * decisiones de la plataforma: solo los cambia el SUPERADMIN por `:id`.
   */
  @Patch('me')
  updateMyTenant(@Request() req: AuthReq, @Body() body: UpdateTenantDto) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    const { name, email, ruc, phone } = body;
    return this.tenantsService.update(req.user.tenantId, {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(ruc !== undefined ? { ruc } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
  }

  // SUPERADMIN: editar cualquier tenant
  @Patch(':id')
  updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.update(id, body);
  }

  // SUPERADMIN: eliminar tenant y todos sus datos
  @Delete(':id')
  removeTenant(@Param('id') id: string, @Request() req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.remove(id);
  }
}
