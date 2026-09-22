import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { ConversionsService } from './conversions.service';
import { ReportConversionDto } from './dto/conversion.dto';

/**
 * Conversiones reportadas al sistema de atribución. Vive dentro del módulo de
 * oportunidades: quien trabaja el embudo es quien sabe cuándo se cobró.
 */
@Controller('conversions')
@UseGuards(JwtAuthGuard, ModuleGuard('leads'))
export class ConversionsController {
  constructor(private service: ConversionsService) {}

  /** Qué se envió y qué falló. */
  @Get()
  list(@Request() req: AuthReq, @Query('limit') limit?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.list(req.user.tenantId, Number(limit) || 50);
  }

  /**
   * Reporta una conversión a mano: sirve para los cobros que no pasan por el
   * embudo. Cada llamada es un hecho nuevo (id propio), así que no se deduplica
   * contra las automáticas.
   */
  @Post()
  report(@Request() req: AuthReq, @Body() dto: ReportConversionDto) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.report({
      tenantId: req.user.tenantId,
      event: dto.event,
      refType: 'manual',
      refId: randomUUID(),
      customerId: dto.customerId,
      phone: dto.phone,
      email: dto.email,
      name: dto.name,
      value: dto.value,
      currency: dto.currency,
      notes: dto.notes,
    });
  }
}
