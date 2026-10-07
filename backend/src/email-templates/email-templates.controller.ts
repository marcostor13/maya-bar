import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { EmailTemplatesService } from './email-templates.service';
import {
  CreateEmailTemplateDto,
  GenerateEmailTemplateDto,
  TestEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class EmailTemplatesController {
  constructor(private service: EmailTemplatesService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  // Genera una propuesta; no guarda nada hasta que el usuario la acepta.
  @Post('generate')
  @HttpCode(200)
  generate(@Body() dto: GenerateEmailTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.generate(req.user.tenantId, dto);
  }

  @Post('test')
  @HttpCode(204)
  sendTest(@Body() dto: TestEmailTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.sendTest(req.user.tenantId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateEmailTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.create(req.user.tenantId, req.user.userId, dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.duplicate(id, req.user.tenantId, req.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
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
