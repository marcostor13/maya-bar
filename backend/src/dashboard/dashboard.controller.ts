import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { DashboardService } from './dashboard.service';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { AnalyticsQueryDto } from './dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ModuleGuard('dashboard'))
export class DashboardController {
  constructor(
    private service: DashboardService,
    private analytics: DashboardAnalyticsService,
  ) {}

  /** Resumen del CRM. El alcance del seguimiento depende del rol. */
  @Get('crm')
  crm(@Request() req: AuthReq) {
    return this.service.crm(req.user.tenantId, req.user.userId, req.user.role);
  }

  /** Analítica con filtros de periodo y canal: KPIs, series y desgloses. */
  @Get('analytics')
  analyticsView(@Query() query: AnalyticsQueryDto, @Request() req: AuthReq) {
    return this.analytics.analytics(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      query,
    );
  }
}
