import {
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
  UseGuards,
} from '@nestjs/common';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  EVENT_ROLES,
  type AuthReq,
  type UserRole,
} from '../auth/permissions';
import { LandingDomainsService } from './landing-domains.service';

/** Registrar, verificar o quitar un dominio toca el proxy: no lo hace un impulsador. */
const DOMAIN_MANAGE_ROLES: UserRole[] = EVENT_ROLES.filter(
  (r) => r !== 'IMPULSADOR',
);

export class CreateLandingDomainDto {
  @IsString()
  domain: string;

  @IsOptional()
  @IsMongoId()
  eventId?: string;
}

export class AssignLandingDomainDto {
  @IsMongoId()
  eventId: string;
}

/** Dominios propios de las landings de eventos (HU25). */
@Controller()
export class LandingDomainsController {
  constructor(private domains: LandingDomainsService) {}

  /** Pública: la landing pregunta qué evento corresponde a su dominio. */
  @Get('public/landing-domains/resolve')
  resolve(@Query('host') host: string) {
    return this.domains.resolve(host);
  }

  @Get('landing-domains')
  @UseGuards(JwtAuthGuard)
  async list(@Request() req: AuthReq, @Query('eventId') eventId?: string) {
    assertRole(req.user.role, EVENT_ROLES);
    return {
      ...(await this.domains.list(req.user.tenantId, eventId || undefined)),
      canManage: DOMAIN_MANAGE_ROLES.includes(req.user.role as UserRole),
    };
  }

  @Post('landing-domains')
  @UseGuards(JwtAuthGuard)
  add(@Body() dto: CreateLandingDomainDto, @Request() req: AuthReq) {
    assertRole(req.user.role, DOMAIN_MANAGE_ROLES);
    return this.domains.add(
      req.user.tenantId,
      req.user.userId,
      dto.domain,
      dto.eventId,
    );
  }

  @Post('landing-domains/:id/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  verify(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, DOMAIN_MANAGE_ROLES);
    return this.domains.verify(id, req.user.tenantId);
  }

  @Patch('landing-domains/:id')
  @UseGuards(JwtAuthGuard)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLandingDomainDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, DOMAIN_MANAGE_ROLES);
    return this.domains.assign(id, req.user.tenantId, dto.eventId);
  }

  @Delete('landing-domains/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, DOMAIN_MANAGE_ROLES);
    return this.domains.remove(id, req.user.tenantId);
  }
}
