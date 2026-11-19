import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { DashboardService } from './dashboard.service';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { AnalyticsQueryDto, CostSettingsDto } from './dto';
import { DashboardCostsService } from './dashboard-costs.service';
import { DashboardUsersService } from './dashboard-users.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ModuleGuard('dashboard'))
export class DashboardController {
  constructor(
    private service: DashboardService,
    private analytics: DashboardAnalyticsService,
    private costsService: DashboardCostsService,
    private usersService: DashboardUsersService,
  ) {}

  /** Los costos son del administrador de la empresa (HU18). */
  private assertAdmin(req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN') throw new ForbiddenException();
  }

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

  /** Rendimiento por usuario (HU20): supervisores ven a todos; el resto, su fila. */
  @Get('users')
  users(@Query() query: AnalyticsQueryDto, @Request() req: AuthReq) {
    return this.usersService.performance(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      query,
    );
  }

  /** Costos estimados de los mensajes del periodo (HU18). */
  @Get('costs')
  costs(@Query() query: AnalyticsQueryDto, @Request() req: AuthReq) {
    this.assertAdmin(req);
    return this.costsService.costs(req.user.tenantId, query.range, query.tz);
  }

  @Put('costs/settings')
  saveCostSettings(@Body() body: CostSettingsDto, @Request() req: AuthReq) {
    this.assertAdmin(req);
    const changes: {
      smsPerSegment?: number | null;
      emailPer1000?: number | null;
    } = {};
    if (body.smsPerSegment !== undefined)
      changes.smsPerSegment = body.smsPerSegment;
    if (body.emailPer1000 !== undefined)
      changes.emailPer1000 = body.emailPer1000;
    return this.costsService.saveSettings(req.user.tenantId, changes);
  }
}
