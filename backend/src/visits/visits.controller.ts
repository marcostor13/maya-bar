import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, VISIT_ROLES, type AuthReq } from '../auth/permissions';
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/visit.dto';

@Controller('visits')
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private visitsService: VisitsService) {}

  @Post()
  create(@Body() dto: CreateVisitDto, @Request() req: AuthReq) {
    assertRole(req.user.role, VISIT_ROLES);
    return this.visitsService.create(req.user.tenantId, req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, VISIT_ROLES);
    return this.visitsService.findAll(req.user.tenantId, req.user.userId, req.user.role);
  }

  @Get('stats')
  getStats(@Request() req: AuthReq) {
    assertRole(req.user.role, VISIT_ROLES);
    return this.visitsService.getStats(req.user.tenantId, req.user.userId, req.user.role);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, VISIT_ROLES);
    return this.visitsService.delete(id, req.user.tenantId, req.user.userId, req.user.role);
  }
}
