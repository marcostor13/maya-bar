import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, type AuthReq } from '../auth/permissions';
import { Audit } from '../audit/audit.decorator';
import { AgencyService } from './agency.service';

class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEmail()
  @MaxLength(200)
  email: string;
}

class WhiteLabelDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  favicon?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color hexadecimal (#RRGGBB)' })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  panelDomain?: string;
}

class SetAgencyDto {
  /** 0 quita el plan Agencia. */
  @IsInt()
  @Min(0)
  @Max(500)
  seats: number;
}

/** Plan Agencia y marca blanca (HU72). */
@Controller()
export class AgencyController {
  constructor(private agency: AgencyService) {}

  @Get('agency')
  @UseGuards(JwtAuthGuard)
  overview(@Request() req: AuthReq) {
    return this.agency.overview(req.user);
  }

  @Audit({ action: 'agency.client_created', resource: 'tenant' })
  @Post('agency/clients')
  @UseGuards(JwtAuthGuard)
  createClient(@Request() req: AuthReq, @Body() dto: CreateClientDto) {
    return this.agency.createClient(req.user, dto.name, dto.email);
  }

  @Audit({ action: 'agency.white_label_updated', resource: 'tenant' })
  @Put('agency/white-label')
  @UseGuards(JwtAuthGuard)
  whiteLabel(@Request() req: AuthReq, @Body() dto: WhiteLabelDto) {
    return this.agency.updateWhiteLabel(req.user, dto);
  }

  /** Marca del panel para la empresa en sesión (la de su agencia, si tiene). */
  @Get('agency/brand')
  @UseGuards(JwtAuthGuard)
  async brand(@Request() req: AuthReq) {
    const [brand, agency] = await Promise.all([
      this.agency.brandForTenant(req.user.tenantId),
      this.agency.isAgency(req.user),
    ]);
    // `agency`: el menú muestra "Agencia" a su administrador.
    return { ...brand, agency };
  }

  @Audit({ action: 'agency.plan_set', resource: 'tenant' })
  @Put('admin/agency/:tenantId')
  @UseGuards(JwtAuthGuard)
  setAgency(
    @Request() req: AuthReq,
    @Param('tenantId') tenantId: string,
    @Body() dto: SetAgencyDto,
  ) {
    assertRole(req.user.role, ['SUPERADMIN']);
    return this.agency.setAgency(tenantId, dto.seats);
  }

  /** Marca según el dominio del panel; el frontend la pide antes del login. */
  @Get('public/white-label')
  async publicBrand(@Query('host') host: string) {
    const b = await this.agency.brandForHost(host);
    if (!b) throw new NotFoundException('Sin marca propia');
    return b;
  }
}
