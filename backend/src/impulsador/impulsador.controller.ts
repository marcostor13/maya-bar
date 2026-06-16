import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, type AuthReq } from '../auth/permissions';
import { ImpulsadorService } from './impulsador.service';
import { DirectMessageDto } from './dto/direct-message.dto';

@Controller('impulsador')
@UseGuards(JwtAuthGuard)
export class ImpulsadorController {
  constructor(private service: ImpulsadorService) {}

  @Get('registrations')
  findMyRegistrations(@Request() req: AuthReq) {
    assertRole(req.user.role, ['IMPULSADOR']);
    return this.service.findMyRegistrations(req.user.userId, req.user.tenantId);
  }

  @Post('registrations/:regId/message')
  sendMessage(
    @Param('regId') regId: string,
    @Body() dto: DirectMessageDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, ['IMPULSADOR']);
    return this.service.sendDirectMessage(regId, req.user.userId, req.user.tenantId, dto);
  }

  @Patch('registrations/:regId/check-in')
  checkIn(@Param('regId') regId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, ['IMPULSADOR']);
    return this.service.checkIn(regId, req.user.userId, req.user.tenantId);
  }
}
