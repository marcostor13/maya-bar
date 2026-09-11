import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ModuleGuard } from '../roles/module.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { SuppressionService } from './suppression.service';
import { CreateSuppressionDto } from './dto/suppression.dto';

/** Lista de no contactar: quién pidió dejar de recibir comunicaciones. */
@Controller('suppression')
@UseGuards(JwtAuthGuard, ModuleGuard('suppression'))
export class SuppressionController {
  constructor(private service: SuppressionService) {}

  @Get()
  list(@Request() req: AuthReq, @Query('q') q?: string) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.list(req.user.tenantId, q);
  }

  @Get('count')
  count(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.count(req.user.tenantId).then((total) => ({ total }));
  }

  @Post()
  add(@Body() dto: CreateSuppressionDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.add(req.user.tenantId, {
      ...dto,
      source: dto.source ?? 'manual',
      userId: req.user.userId,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.removeById(id, req.user.tenantId);
  }
}
