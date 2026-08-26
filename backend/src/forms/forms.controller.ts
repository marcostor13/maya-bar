import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ModuleGuard } from '../roles/module.guard';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { FormsService } from './forms.service';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';

@Controller()
export class FormsController {
  constructor(private formsService: FormsService) {}

  // ─── Público (sin auth, embebible en cualquier landing) ───────────────────

  @Get('public/forms/:publicKey')
  getPublicForm(@Param('publicKey') publicKey: string) {
    return this.formsService.findPublic(publicKey);
  }

  /**
   * Sin DTO tipado a propósito: el ValidationPipe global tiene `whitelist` y
   * recortaría las respuestas del formulario, que son claves dinámicas.
   */
  @Post('public/forms/:publicKey/submit')
  submit(
    @Param('publicKey') publicKey: string,
    @Body() body: Record<string, unknown>,
    @Req() req: ExpressRequest,
  ) {
    return this.formsService.submit(publicKey, body, {
      pageUrl: typeof body?.['pageUrl'] === 'string' ? body['pageUrl'] : undefined,
      referer: req.headers.referer,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ─── Gestión interna ──────────────────────────────────────────────────────

  @Get('forms')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.findAll(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get('forms/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.findOne(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get('forms/:id/submissions')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  findSubmissions(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.findSubmissions(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      limit ? Number(limit) : undefined,
    );
  }

  @Post('forms')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  create(@Body() dto: CreateFormDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.create(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post('forms/:id/regenerate-key')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  regenerateKey(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.regenerateKey(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch('forms/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.update(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Delete('forms/:id')
  @UseGuards(JwtAuthGuard, ModuleGuard('forms'))
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.formsService.delete(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
