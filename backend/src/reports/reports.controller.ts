import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { ALLOWED, MAX_RANGE_DAYS } from './report-definition';
import {
  ReportsService,
  type ReportInput,
  type Viewer,
} from './reports.service';

const viewer = (req: AuthReq): Viewer => ({
  userId: req.user.userId,
  role: req.user.role,
  tenantId: req.user.tenantId,
});

/** Reportes configurables (HU64). Mismo permiso que el dashboard. */
@Controller('reports')
@UseGuards(JwtAuthGuard, ModuleGuard('dashboard'))
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('meta')
  meta() {
    return { allowed: ALLOWED, maxRangeDays: MAX_RANGE_DAYS };
  }

  /** Vista previa sin guardar. */
  @Post('run')
  run(@Body() body: ReportInput, @Request() req: AuthReq) {
    return this.reports.run(req.user.tenantId, body);
  }

  @Get()
  list(@Request() req: AuthReq) {
    return this.reports.list(viewer(req));
  }

  @Get('pinned')
  pinned(@Request() req: AuthReq) {
    return this.reports.pinned(viewer(req));
  }

  @Post()
  @Audit({
    action: 'reports.created',
    resource: 'report',
    bodyFields: ['name', 'source', 'sharedRoles'],
  })
  create(@Body() body: ReportInput, @Request() req: AuthReq) {
    return this.reports.create(viewer(req), body);
  }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: AuthReq) {
    return this.reports.get(viewer(req), id);
  }

  @Get(':id/run')
  runSaved(@Param('id') id: string, @Request() req: AuthReq) {
    return this.reports.runSaved(viewer(req), id);
  }

  @Get(':id/export.csv')
  @Audit({ action: 'reports.export', resource: 'report' })
  async exportCsv(
    @Param('id') id: string,
    @Request() req: AuthReq & { auditDetails?: Record<string, unknown> },
    @Res({ passthrough: true }) res: { setHeader(k: string, v: string): void },
  ) {
    const { name, csv } = await this.reports.exportCsv(viewer(req), id);
    req.auditDetails = { name };
    const file =
      name
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'reporte';
    res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
    return new StreamableFile(Buffer.from('﻿' + csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
    });
  }

  @Post(':id/send')
  sendNow(@Param('id') id: string, @Request() req: AuthReq) {
    return this.reports.sendNow(viewer(req), id);
  }

  @Patch(':id')
  @Audit({
    action: 'reports.updated',
    resource: 'report',
    bodyFields: ['name', 'pinned', 'sharedRoles'],
  })
  update(
    @Param('id') id: string,
    @Body() body: ReportInput,
    @Request() req: AuthReq,
  ) {
    return this.reports.update(viewer(req), id, body);
  }

  @Delete(':id')
  @Audit({ action: 'reports.deleted', resource: 'report' })
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    return this.reports.remove(viewer(req), id);
  }
}
