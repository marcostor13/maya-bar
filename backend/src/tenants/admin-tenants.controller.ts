import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { UsersService } from '../users/users.service';
import { UserAdminService } from '../users/user-admin.service';
import { actorOf as userActorOf } from '../users/users.controller';
import type { User } from '../users/user.schema';
import { TenantsService } from './tenants.service';
import { actorOf } from './tenants.controller';
import { AssignOwnerDto, RecoverOwnerDto } from './dto/create-tenant.dto';

const view = (u: User) => ({
  _id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive !== false,
  mustChangePassword: !!u.mustChangePassword,
  lastAccessAt: u.lastAccessAt,
  createdAt: (u as unknown as { createdAt?: Date }).createdAt,
});

/** Ficha de una empresa y su usuario principal, para el superadministrador (HU16, HU17). */
@Controller('admin/tenants')
@UseGuards(JwtAuthGuard)
export class AdminTenantsController {
  constructor(
    private tenants: TenantsService,
    private users: UsersService,
    private admin: UserAdminService,
  ) {}

  private assertSuper(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
  }

  @Get(':id/overview')
  async overview(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    const tenant = await this.tenants.findById(id);
    const [users, usage] = await Promise.all([
      this.users.findAllByTenant(id),
      this.tenants.usage(id),
    ]);
    const rows = users.map(view);
    // Usuario principal: el administrador activo más antiguo (HU17).
    const owner =
      rows
        .filter((u) => u.role === 'TENANT_ADMIN' && u.isActive)
        .sort(
          (a, b) =>
            new Date(a.createdAt ?? 0).getTime() -
            new Date(b.createdAt ?? 0).getTime(),
        )[0] ?? null;
    return { tenant, users: rows, owner, usage };
  }

  @Get(':id/audit')
  audit(@Param('id') id: string, @Request() req: AuthReq) {
    this.assertSuper(req);
    return this.tenants.auditLog(id);
  }

  /**
   * Devuelve el acceso a un administrador de la empresa en un paso: correo,
   * reactivación, contraseña y cierre de sesiones (HU17).
   */
  @Post(':id/owner/recover')
  async recover(
    @Param('id') id: string,
    @Body() body: RecoverOwnerDto,
    @Request() req: AuthReq,
  ) {
    this.assertSuper(req);
    const tenant = await this.tenants.findById(id);
    const target = await this.admin.target(body.userId, id);
    if (target.role !== 'TENANT_ADMIN')
      throw new BadRequestException(
        'Solo se recupera la cuenta de un administrador. Nómbralo primero.',
      );
    // Sin proveedor de correo se rechaza antes de cambiar el correo o reactivar.
    this.admin.assertResetPossible(body.mode);
    const actor = await userActorOf(req, this.users);
    const email = body.email?.trim().toLowerCase();
    const updated = await this.admin.update(
      body.userId,
      id,
      { ...(email ? { email } : {}), isActive: true },
      actor,
    );
    const reset = await this.admin.resetAccess(
      body.userId,
      id,
      body.mode,
      actor,
    );
    await this.tenants.audit(actorOf(req), tenant, 'owner_reset', {
      user: { to: updated.email },
      ...(email && email !== target.email
        ? { email: { from: target.email, to: email } }
        : {}),
      ...(target.isActive === false
        ? { isActive: { from: false, to: true } }
        : {}),
      mode: { to: body.mode },
    });
    return { user: view(updated), ...reset };
  }

  /** Nombra administrador a un usuario de la empresa o crea uno nuevo (HU17). */
  @Post(':id/owner/assign')
  async assign(
    @Param('id') id: string,
    @Body() body: AssignOwnerDto,
    @Request() req: AuthReq,
  ) {
    this.assertSuper(req);
    const tenant = await this.tenants.findById(id);
    const actor = await userActorOf(req, this.users);
    if (body.userId) {
      const target = await this.admin.target(body.userId, id);
      const updated = await this.admin.update(
        body.userId,
        id,
        { role: 'TENANT_ADMIN', isActive: true },
        actor,
      );
      await this.tenants.audit(actorOf(req), tenant, 'owner_assign', {
        user: { to: updated.email },
        ...(target.role !== 'TENANT_ADMIN'
          ? { role: { from: target.role, to: 'TENANT_ADMIN' } }
          : {}),
        ...(target.isActive === false
          ? { isActive: { from: false, to: true } }
          : {}),
      });
      return { user: view(updated) };
    }
    const created = await this.admin.create(
      id,
      {
        name: body.name!.trim(),
        email: body.email!.trim().toLowerCase(),
        role: 'TENANT_ADMIN',
      },
      actor,
    );
    await this.tenants.audit(actorOf(req), tenant, 'owner_assign', {
      user: { to: created.user.email },
      created: { to: true },
    });
    return { user: view(created.user), tempPassword: created.tempPassword };
  }
}
