import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import type { Availability } from './routing-pick';
import { RoutingService, type RoutingRuleInput } from './routing.service';

/** Reglas de reparto automático (HU59): solo quien dirige el equipo. */
@Controller('routing')
@UseGuards(JwtAuthGuard)
export class RoutingController {
  constructor(private routing: RoutingService) {}

  // Cada usuario marca su propia disponibilidad, sin permisos de módulo.
  @Get('availability')
  availability(@Request() req: AuthReq) {
    return this.routing.availability(req.user.userId);
  }

  @Patch('availability')
  setAvailability(
    @Body() body: { available?: boolean; availability?: Availability | null },
    @Request() req: AuthReq,
  ) {
    return this.routing.setAvailability(req.user.userId, body ?? {});
  }

  @Get('rules')
  @UseGuards(ModuleGuard('leads'))
  list(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.routing.list(req.user.tenantId);
  }

  @Get('log')
  @UseGuards(ModuleGuard('leads'))
  log(@Request() req: AuthReq, @Query('limit') limit?: string) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.routing.log(req.user.tenantId, Number(limit) || 100);
  }

  @Post('rules')
  @UseGuards(ModuleGuard('leads'))
  create(@Body() body: RoutingRuleInput, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.routing.create(req.user.tenantId, body);
  }

  @Put('rules/:id')
  @UseGuards(ModuleGuard('leads'))
  update(
    @Param('id') id: string,
    @Body() body: RoutingRuleInput,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.routing.update(req.user.tenantId, id, body);
  }

  @Delete('rules/:id')
  @UseGuards(ModuleGuard('leads'))
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.routing.remove(req.user.tenantId, id);
  }
}
