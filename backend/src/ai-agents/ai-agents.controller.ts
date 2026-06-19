import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../auth/permissions';
import { AiAgentsService } from './ai-agents.service';
import { CreateAiAgentDto, UpdateAiAgentDto, AddDocDto, TestChatDto, AgentFileDto } from './dto/ai-agent.dto';

@Controller('ai-agents')
@UseGuards(JwtAuthGuard)
export class AiAgentsController {
  constructor(private service: AiAgentsService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateAiAgentDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (!dto.name || !dto.systemPrompt) throw new BadRequestException('Faltan nombre o prompt');
    return this.service.create(req.user.tenantId, req.user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findOne(id, req.user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiAgentDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }

  // Base de conocimiento
  @Get(':id/docs')
  listDocs(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listDocs(id, req.user.tenantId);
  }

  @Post(':id/docs')
  addDoc(@Param('id') id: string, @Body() dto: AddDocDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (!dto.filename || !dto.url) throw new BadRequestException('Faltan filename o url');
    return this.service.addDoc(id, req.user.tenantId, dto);
  }

  @Delete(':id/docs/:docId')
  deleteDoc(@Param('id') id: string, @Param('docId') docId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.deleteDoc(id, docId, req.user.tenantId);
  }

  // Archivos enviables
  @Get(':id/files')
  listFiles(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listFiles(id, req.user.tenantId);
  }

  @Post(':id/files')
  addFile(@Param('id') id: string, @Body() dto: AgentFileDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (!dto.alias || !dto.url || !dto.filename) throw new BadRequestException('Faltan alias, filename o url');
    return this.service.addFile(id, req.user.tenantId, dto);
  }

  @Delete(':id/files/:fileId')
  deleteFile(@Param('id') id: string, @Param('fileId') fileId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.deleteFile(id, fileId, req.user.tenantId);
  }

  // Playground
  @Post(':id/test')
  test(@Param('id') id: string, @Body() dto: TestChatDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (!dto.messages?.length) throw new BadRequestException('Faltan mensajes');
    return this.service.testChat(id, req.user.tenantId, dto.messages);
  }
}
