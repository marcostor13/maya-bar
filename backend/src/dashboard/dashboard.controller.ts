import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ModuleGuard('dashboard'))
export class DashboardController {
  constructor(private service: DashboardService) {}

  /** Resumen del CRM. El alcance del seguimiento depende del rol. */
  @Get('crm')
  crm(@Request() req: AuthReq) {
    return this.service.crm(req.user.tenantId, req.user.userId, req.user.role);
  }
}
