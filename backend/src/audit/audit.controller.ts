import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { Audit } from './audit.decorator';
import { AuditService, type AuditQuery } from './audit.service';

/**
 * Registro de actividad (HU63). El administrador ve solo su empresa; el
 * superadmin ve todo o filtra por `tenantId`.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  private scope(req: AuthReq, q: AuditQuery): AuditQuery {
    if (req.user.role === 'SUPERADMIN') return q;
    if (req.user.role !== 'TENANT_ADMIN' || !req.user.tenantId)
      throw new ForbiddenException(
        'Solo el administrador ve el registro de actividad',
      );
    return { ...q, tenantId: req.user.tenantId };
  }

  @Get()
  list(@Query() q: AuditQuery, @Request() req: AuthReq) {
    return this.audit.list(this.scope(req, q));
  }

  @Get('actions')
  actions(@Request() req: AuthReq) {
    return this.audit.actions(this.scope(req, {}).tenantId);
  }

  @Get('export.csv')
  @Audit({ action: 'audit.export', resource: 'audit' })
  async exportCsv(
    @Query() q: AuditQuery,
    @Request() req: AuthReq & { auditDetails?: Record<string, unknown> },
    @Res({ passthrough: true }) res: { setHeader(k: string, v: string): void },
  ) {
    const csv = await this.audit.exportCsv(this.scope(req, q));
    req.auditDetails = { rows: csv.split('\n').length - 1 };
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="actividad.csv"',
    );
    return new StreamableFile(Buffer.from('﻿' + csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
    });
  }
}
