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
import { ContactCareService } from './contact-care.service';
import {
  AssignContactDto,
  BulkAssignDto,
  BulkTagsDto,
  CreateContactActivityDto,
  ReleaseContactDto,
  UpdateContactActivityDto,
} from './dto/contact-care.dto';

/**
 * Responsable y bitácora del contacto. Comparte prefijo y permiso con
 * `CustomersController`; va aparte para no mezclar el CRUD con la atención.
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, ModuleGuard('customers'))
export class ContactCareController {
  constructor(private care: ContactCareService) {}

  @Get('owners')
  owners(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.owners(req.user.tenantId);
  }

  // Son acciones sobre contactos existentes, no altas: 200 y no 201.
  @Post('bulk/assign')
  @HttpCode(200)
  bulkAssign(@Body() dto: BulkAssignDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.bulkAssign(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.customerIds,
      dto.toUserId || undefined,
    );
  }

  @Post('bulk/tags')
  @HttpCode(200)
  bulkTags(@Body() dto: BulkTagsDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.bulkTags(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.customerIds,
      dto.add,
      dto.remove,
    );
  }

  @Patch(':id/claim')
  claim(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.claim(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignContactDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.assign(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.toUserId,
      dto.note,
    );
  }

  @Patch(':id/release')
  release(
    @Param('id') id: string,
    @Body() dto: ReleaseContactDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.release(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.note,
    );
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.timeline(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':id/activities')
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateContactActivityDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.addActivity(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateContactActivityDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.updateActivity(
      id,
      activityId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.care.deleteActivity(
      id,
      activityId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
