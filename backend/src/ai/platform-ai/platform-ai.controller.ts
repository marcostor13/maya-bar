import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthReq } from '../../auth/permissions';
import { Audit } from '../../audit/audit.decorator';
import {
  PlatformAiModelsDto,
  SavePlatformAiDto,
  TestPlatformAiDto,
} from './platform-ai.dto';
import { PlatformAiService } from './platform-ai.service';

/** IA de la plataforma (HU85): solo el superadministrador. */
@Controller('admin/platform-ai')
@UseGuards(JwtAuthGuard)
export class PlatformAiController {
  constructor(private service: PlatformAiService) {}

  private superadmin(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
  }

  @Get()
  get(@Request() req: AuthReq) {
    this.superadmin(req);
    return this.service.view();
  }

  @Put()
  // Sin bodyFields: la API key nunca llega al registro de actividad.
  @Audit({ action: 'platform_ai.updated', resource: 'platform_ai' })
  save(@Request() req: AuthReq, @Body() dto: SavePlatformAiDto) {
    this.superadmin(req);
    return this.service.save(dto, req.user.userId);
  }

  @Post('models')
  @HttpCode(200)
  models(@Request() req: AuthReq, @Body() dto: PlatformAiModelsDto) {
    this.superadmin(req);
    return this.service.listModels(dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@Request() req: AuthReq, @Body() dto: TestPlatformAiDto) {
    this.superadmin(req);
    return this.service.test(dto);
  }
}
