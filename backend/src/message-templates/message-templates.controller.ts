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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { MessageTemplatesService } from './message-templates.service';
import {
  CreateMessageTemplateDto,
  PreviewMessageDto,
  UpdateMessageTemplateDto,
} from './dto/message-template.dto';

@Controller('message-templates')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class MessageTemplatesController {
  constructor(private service: MessageTemplatesService) {}

  @Get()
  findAll(@Query('channel') channel: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findAll(req.user.tenantId, channel || undefined);
  }

  @Get('variables')
  variables(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.variables(req.user.tenantId);
  }

  // Solo calcula: no crea nada, así que no exige el permiso de "crear".
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewMessageDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.preview(req.user.tenantId, dto);
  }

  @Post()
  create(@Body() dto: CreateMessageTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.create(req.user.tenantId, req.user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }
}
