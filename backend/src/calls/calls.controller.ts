import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { ADMIN_ONLY, assertRole, type AuthReq } from '../auth/permissions';
import { CallsService } from './calls.service';
import {
  ContactRefDto,
  ListCallsQuery,
  OutboundCallDto,
  SdpDto,
  StatsQuery,
  UpdateCallSettingsDto,
} from './dto/calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard, ModuleGuard('calls'))
export class CallsController {
  constructor(private calls: CallsService) {}

  @Get()
  list(@Request() req: AuthReq, @Query() q: ListCallsQuery) {
    return this.calls.list(req.user.tenantId, q);
  }

  @Get('options')
  options(@Request() req: AuthReq) {
    return this.calls.options(req.user.tenantId);
  }

  @Get('stats')
  stats(@Request() req: AuthReq, @Query() q: StatsQuery) {
    return this.calls.stats(
      req.user.tenantId,
      q.from ? new Date(q.from) : undefined,
      q.to ? new Date(q.to) : undefined,
    );
  }

  @Get('permission')
  permission(@Request() req: AuthReq, @Query() q: ContactRefDto) {
    return this.calls.permissionState(
      req.user.tenantId,
      q.accountId,
      q.contact,
    );
  }

  @Post('permission/request')
  requestPermission(@Request() req: AuthReq, @Body() dto: ContactRefDto) {
    return this.calls.requestPermission(
      req.user.tenantId,
      req.user.userId,
      dto.accountId,
      dto.contact,
    );
  }

  @Post('outbound')
  outbound(@Request() req: AuthReq, @Body() dto: OutboundCallDto) {
    return this.calls.startOutbound(
      req.user.tenantId,
      req.user.userId,
      dto.accountId,
      dto.contact,
      dto.sdp,
    );
  }

  @Get('settings/:accountId')
  settings(@Request() req: AuthReq, @Param('accountId') accountId: string) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.calls.getSettings(req.user.tenantId, accountId);
  }

  @Put('settings/:accountId')
  updateSettings(
    @Request() req: AuthReq,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateCallSettingsDto,
  ) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.calls.updateSettings(req.user.tenantId, accountId, dto);
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(@Request() req: AuthReq, @Param('id') id: string) {
    return this.calls.claim(id, req.user.tenantId, req.user.userId);
  }

  @Post(':id/release')
  @HttpCode(204)
  async release(@Request() req: AuthReq, @Param('id') id: string) {
    await this.calls.release(id, req.user.tenantId, req.user.userId);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: SdpDto,
  ) {
    return this.calls.accept(id, req.user.tenantId, req.user.userId, dto.sdp);
  }

  @Post(':id/reject')
  @HttpCode(204)
  async reject(@Request() req: AuthReq, @Param('id') id: string) {
    await this.calls.reject(id, req.user.tenantId);
  }

  @Post(':id/hangup')
  @HttpCode(200)
  hangup(@Request() req: AuthReq, @Param('id') id: string) {
    return this.calls.hangup(id, req.user.tenantId, req.user.userId);
  }
}
