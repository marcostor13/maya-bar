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
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { ListsService } from './lists.service';
import { CreateListDto, UpdateListDto, AddMembersDto } from './dto/list.dto';
import { SegmentRule } from './contact-list.schema';

@Controller('lists')
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(private listsService: ListsService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.findAll(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post()
  create(@Body() dto: CreateListDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.create(
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.update(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.delete(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.getMembers(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Get(':id/count')
  previewCount(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.previewCount(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post('preview-count')
  previewCountBulk(
    @Body() body: { listIds: string[] },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.previewCountForLists(
      body.listIds ?? [],
      req.user.tenantId,
    );
  }

  @Post('preview-rules')
  previewRules(
    @Body() body: { rules: SegmentRule[] },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.previewRules(req.user.tenantId, body.rules ?? []);
  }

  @Post(':id/members')
  addMembers(
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.addMembers(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto.customerIds,
    );
  }

  @Delete(':id/members/:customerId')
  removeMember(
    @Param('id') id: string,
    @Param('customerId') customerId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.listsService.removeMember(
      id,
      customerId,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
    );
  }
}
