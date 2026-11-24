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
  Res,
  StreamableFile,
  Optional,
} from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ModuleGuard } from '../roles/module.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

import { Audit } from '../audit/audit.decorator';
@Controller('customers')
@UseGuards(JwtAuthGuard, ModuleGuard('customers'))
export class CustomersController {
  constructor(
    private customersService: CustomersService,
    // Global (HU42); opcional para las pruebas que montan solo el controlador.
    @Optional() private limits?: PlanLimitsService,
  ) {}

  @Get()
  findAll(
    @Query('search') search: string,
    @Query('tag') tag: string,
    @Query('formId') formId: string,
    @Request() req: AuthReq,
    @Query('heat') heat?: string,
    @Query('sort') sort?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.findAll(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      search,
      tag,
      formId,
      { heat, sort },
    );
  }

  /**
   * Formularios del tenant para poblar el filtro de la tabla. Va aquí y no en
   * `/forms` porque quien administra contactos no tiene por qué tener acceso
   * al módulo de formularios, y solo necesita el nombre y el id.
   */
  @Get('forms')
  findForms(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.findForms(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post()
  async create(@Body() dto: CreateCustomerDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    await this.limits?.assertCanAdd(req.user.tenantId, 'contacts');
    return this.customersService.create(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post('sync')
  sync(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.sync(req.user.tenantId);
  }

  @Audit({ action: 'customers.export', resource: 'customer' })
  @Get('export.csv')
  async exportCsv(
    @Request() req: AuthReq,
    @Res({ passthrough: true }) res: any,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const csv = await this.customersService.exportCsv(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
    // Auditoría (HU63): cuántos contactos salieron.
    (req as AuthReq & { auditDetails?: Record<string, unknown> }).auditDetails =
      {
        rows: csv ? csv.split(String.fromCharCode(10)).length - 1 : 0,
      };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
    return new StreamableFile(Buffer.from('﻿' + csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.update(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Audit({ action: 'customers.deleted', resource: 'customer' })
  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.customersService.delete(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
