import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { LinksService } from './links.service';
import {
  CreateBatchDto,
  CreateDomainDto,
  CreateLinkDto,
  UpdateLinkDto,
} from './dto/link.dto';
import {
  parseCsv,
  parseXlsx,
  type ParsedTable,
} from '../contact-import/table-parser';
import { toText } from '../shared/to-text';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Filas que se devuelven al analizar un archivo: el lote admite 10 000. */
const MAX_PARSED_ROWS = 10_000;

function csv(headers: string[], rows: unknown[][]): StreamableFile {
  const cell = (v: unknown) => {
    const text =
      v === null || v === undefined
        ? ''
        : v instanceof Date
          ? v.toISOString()
          : typeof v === 'object'
            ? JSON.stringify(v)
            : toText(v);
    // Una celda que empieza por = + - @ la ejecuta Excel como fórmula.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const body = [headers, ...rows]
    .map((r) => r.map(cell).join(','))
    .join('\r\n');
  return new StreamableFile(Buffer.from('﻿' + body, 'utf-8'), {
    type: 'text/csv; charset=utf-8',
  });
}

@Controller('links')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class LinksController {
  constructor(private links: LinksService) {}

  // ── Analítica (rutas fijas antes de `:id`) ──
  @Get('stats')
  stats(
    @Query('linkId') linkId: string,
    @Query('batchId') batchId: string,
    @Query('campaignId') campaignId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') timezone: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.stats(req.user.tenantId, {
      linkId,
      batchId,
      campaignId,
      from,
      to,
      timezone,
    });
  }

  @Get('clicks.csv')
  async exportClicks(
    @Query('linkId') linkId: string,
    @Query('batchId') batchId: string,
    @Request() req: AuthReq,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const clicks = await this.links.clicksForExport(req.user.tenantId, {
      linkId,
      batchId,
    });
    res.setHeader('Content-Disposition', 'attachment; filename="clics.csv"');
    return csv(
      [
        'Fecha',
        'Contacto',
        'Email',
        'Teléfono',
        'IP',
        'País',
        'Ciudad',
        'Dispositivo',
        'Sistema',
        'Navegador',
        'Versión',
        'Idioma',
        'Origen',
        'Único',
        'Bot',
        'Visitante',
        'Parámetros',
        'Cookies',
        'User-Agent',
      ],
      clicks.map((c) => {
        const customer = c.customerId as unknown as
          | { name?: string; email?: string; phone?: string }
          | undefined;
        return [
          c.at,
          customer?.name,
          customer?.email,
          customer?.phone,
          c.ip,
          c.country,
          c.city,
          c.device,
          c.os,
          c.browser,
          c.browserVersion,
          c.language,
          c.refererHost,
          c.isUnique ? 'sí' : 'no',
          c.isBot ? 'sí' : 'no',
          c.visitorId,
          c.query,
          c.cookies,
          c.userAgent,
        ];
      }),
    );
  }

  // ── Dominios ──
  @Get('domains')
  domains(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.domains(req.user.tenantId);
  }

  @Post('domains')
  addDomain(@Body() dto: CreateDomainDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.links.addDomain(req.user.tenantId, req.user.userId, dto.domain);
  }

  @Post('domains/:id/verify')
  @HttpCode(200)
  verifyDomain(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.verifyDomain(id, req.user.tenantId);
  }

  @Patch('domains/:id/default')
  setDefaultDomain(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.links.setDefaultDomain(id, req.user.tenantId);
  }

  @Delete('domains/:id')
  removeDomain(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.links.removeDomain(id, req.user.tenantId);
  }

  // ── Lotes ──
  @Get('batches')
  batches(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.batches(req.user.tenantId);
  }

  /** Lee un Excel/CSV y devuelve columnas y filas para mapearlas en pantalla. */
  @Post('batches/parse')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async parse(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    if (!file?.buffer?.length)
      throw new BadRequestException('No se recibió ningún archivo');
    const name = (file.originalname ?? '').toLowerCase();
    let table: ParsedTable;
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm'))
      table = await parseXlsx(file.buffer);
    else if (name.endsWith('.csv') || name.endsWith('.txt'))
      table = parseCsv(file.buffer.toString('utf-8'));
    else
      throw new BadRequestException(
        'Formato no soportado. Sube un archivo .xlsx o .csv',
      );
    return {
      columns: table.columns,
      total: table.rows.length,
      rows: table.rows.slice(0, MAX_PARSED_ROWS),
    };
  }

  @Post('batches')
  createBatch(@Body() dto: CreateBatchDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.createBatch(req.user.tenantId, req.user.userId, dto);
  }

  @Get('batches/:id')
  batchRows(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.batchRows(id, req.user.tenantId);
  }

  @Get('batches/:id/export.csv')
  async exportBatch(
    @Param('id') id: string,
    @Request() req: AuthReq,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    const { batch, rows } = await this.links.batchRows(id, req.user.tenantId);
    res.setHeader('Content-Disposition', 'attachment; filename="links.csv"');
    return csv(
      [
        'Nombre',
        'Teléfono',
        'Email',
        'Link',
        'Clics',
        'Únicos',
        ...(batch.subject ? ['Asunto'] : []),
        'Mensaje',
      ],
      rows.map((r) => [
        r.name,
        r.phone,
        r.email,
        r.shortUrl,
        r.clicks,
        r.uniqueClicks,
        ...(batch.subject ? [r.subject] : []),
        r.message,
      ]),
    );
  }

  @Delete('batches/:id')
  removeBatch(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.removeBatch(id, req.user.tenantId);
  }

  // ── Links ──
  @Get()
  findAll(
    @Query('search') search: string,
    @Query('batchId') batchId: string,
    @Query('scope') scope: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.findAll(req.user.tenantId, { search, batchId, scope });
  }

  @Post()
  create(@Body() dto: CreateLinkDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.create(req.user.tenantId, req.user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.getOne(id, req.user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.links.remove(id, req.user.tenantId);
  }
}
