import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { AddonsService } from './addons.service';
import { ADDON_IDS, type AddonId } from './addons.catalog';

import { Audit } from '../audit/audit.decorator';
class BuyAddonDto {
  @IsIn(ADDON_IDS)
  addon: AddonId;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  qty?: number;
}

/** Add-ons y recargas (HU53). Solo el administrador de la empresa. */
@Controller('billing/addons')
@UseGuards(JwtAuthGuard)
export class AddonsController {
  constructor(private addons: AddonsService) {}

  private admin(req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN' || !req.user.tenantId)
      throw new ForbiddenException(
        'Solo el administrador puede comprar extras',
      );
    return req.user.tenantId;
  }

  @Get()
  list(@Request() req: AuthReq) {
    return this.addons.list(this.admin(req));
  }

  @Audit({
    action: 'billing.addon_bought',
    resource: 'addon',
    bodyFields: ['addon', 'quantity'],
  })
  @Post('buy')
  buy(@Request() req: AuthReq, @Body() dto: BuyAddonDto) {
    return this.addons.buy(
      this.admin(req),
      req.user.userId,
      dto.addon,
      dto.qty ?? 1,
    );
  }
}
