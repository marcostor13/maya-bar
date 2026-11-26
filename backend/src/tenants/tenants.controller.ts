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
import {
  CreateTenantDto,
  DeleteTenantDto,
  UpdateBrandingDto,
  UpdateTenantDto,
} from './dto/create-tenant.dto';

import { Audit } from '../audit/audit.decorator';
export const actorOf = (req: AuthReq) => ({
  userId: req.user.userId,
  email: req.user.email,
});

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
  @Audit({
    action: 'admin.tenants.created',
    resource: 'tenant',
    bodyFields: ['name', 'email', 'plan'],
  })
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
    await this.tenantsService.audit(actorOf(req), tenant, 'create');

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
  async getMyTenant(@Request() req: AuthReq) {
    const tenant = await this.tenantsService.findById(req.user.tenantId);
    // El origen del registro (HU84) lleva IP y navegador del dueño: no se
    // muestra al resto del equipo.
    const plain = tenant.toObject() as Record<string, unknown>;
    delete plain.acquisition;
    return plain;
  }

  /**
   * La empresa edita sus propios datos de contacto. El plan y el estado son
   * decisiones de la plataforma: solo los cambia el SUPERADMIN por `:id`.
   */
  @Audit({ action: 'tenant.updated', resource: 'tenant' })
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

  /** Logo y favicon de la empresa para la landing de sus eventos (HU26). */
  @Patch('me/branding')
  updateMyBranding(@Request() req: AuthReq, @Body() body: UpdateBrandingDto) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
    return this.tenantsService.updateBranding(req.user.tenantId, body);
  }

  // SUPERADMIN: editar cualquier tenant
  @Audit({
    action: 'admin.tenants.updated',
    resource: 'tenant',
    tenantParam: 'id',
    bodyFields: ['plan', 'isActive', 'name'],
  })
  @Patch(':id')
  updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.update(id, body, actorOf(req));
  }

  // SUPERADMIN: eliminar tenant y todos sus datos
  @Audit({
    action: 'admin.tenants.deleted',
    resource: 'tenant',
    tenantParam: 'id',
  })
  @Delete(':id')
  removeTenant(
    @Param('id') id: string,
    @Body() body: DeleteTenantDto,
    @Request() req: AuthReq,
  ) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return this.tenantsService.remove(id, {
      confirmName: body?.confirmName,
      actor: actorOf(req),
    });
  }
}
