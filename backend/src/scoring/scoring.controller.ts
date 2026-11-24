import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { LeadScoringService } from './lead-scoring.service';

/** Recalcular a pedido el puntaje de un contacto (HU70). */
@Controller('scoring')
@UseGuards(JwtAuthGuard)
export class ScoringController {
  constructor(private scoring: LeadScoringService) {}

  @Post('customers/:id')
  recalculate(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Contacto inválido');
    return this.scoring.recalculate(req.user.tenantId, id);
  }
}
