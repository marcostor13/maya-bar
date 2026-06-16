import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  MANAGE_ROLES,
  ADMIN_ONLY,
  type AuthReq,
} from '../auth/permissions';
import { LocalsService } from './locals.service';
import { CreateLocalDto, UpdateLocalDto } from './dto/create-local.dto';

@Controller('locals')
@UseGuards(JwtAuthGuard)
export class LocalsController {
  constructor(private localsService: LocalsService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    if (req.user.role === 'SUPERADMIN') return this.localsService.findAll();
    return this.localsService.findAllByTenant(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    return this.localsService.findById(id, req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateLocalDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    const tenantId =
      req.user.role === 'SUPERADMIN' ? (dto.tenantId ?? '') : req.user.tenantId;
    return this.localsService.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocalDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.localsService.update(id, req.user.tenantId, dto);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.localsService.clone(id, req.user.tenantId);
  }

  @Delete(':id')
  archive(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.localsService.archive(id, req.user.tenantId);
  }
}
