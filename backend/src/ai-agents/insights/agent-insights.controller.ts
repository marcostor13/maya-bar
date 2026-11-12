import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ModuleGuard } from '../../roles/module.guard';
import { assertRole, CRM_ROLES, type AuthReq } from '../../auth/permissions';
import { ParseObjectIdPipe } from './parse-object-id.pipe';
import { CreatePromptReviewDto, GenerateAgentDto } from './prompt-insights.dto';
import { PromptReviewService } from './prompt-review.service';
import { AgentGeneratorService } from './agent-generator.service';

/** Llamadas largas y caras a la IA: tope por IP para que no se repitan sin fin. */
const AI_CALLS_PER_HOUR = { default: { limit: 20, ttl: 60 * 60_000 } };

/** Mejora de prompts (análisis, sugerencias, versiones) y generador de agentes. */
@Controller('ai-agents')
@UseGuards(JwtAuthGuard, ModuleGuard('ai-agents'))
export class AgentInsightsController {
  constructor(
    private reviews: PromptReviewService,
    private generator: AgentGeneratorService,
  ) {}

  @Post('generate')
  @UseGuards(ThrottlerGuard)
  @Throttle(AI_CALLS_PER_HOUR)
  generate(@Body() dto: GenerateAgentDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.generator.generate(req.user.tenantId, dto);
  }

  @Get(':id/reviews')
  listReviews(
    @Param('id', ParseObjectIdPipe) id: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.list(req.user.tenantId, id);
  }

  @Post(':id/reviews')
  @UseGuards(ThrottlerGuard)
  @Throttle(AI_CALLS_PER_HOUR)
  analyze(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreatePromptReviewDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.analyze(
      req.user.tenantId,
      id,
      req.user.userId,
      dto.days,
    );
  }

  @Get(':id/reviews/:reviewId')
  getReview(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('reviewId', ParseObjectIdPipe) reviewId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.get(req.user.tenantId, id, reviewId);
  }

  @Post(':id/reviews/:reviewId/suggestions/:index/apply')
  apply(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('reviewId', ParseObjectIdPipe) reviewId: string,
    @Param('index', ParseIntPipe) index: number,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.apply(
      req.user.tenantId,
      id,
      reviewId,
      index,
      req.user.userId,
    );
  }

  @Post(':id/reviews/:reviewId/suggestions/:index/discard')
  discard(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('reviewId', ParseObjectIdPipe) reviewId: string,
    @Param('index', ParseIntPipe) index: number,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.discard(req.user.tenantId, id, reviewId, index);
  }

  @Get(':id/versions')
  versions(
    @Param('id', ParseObjectIdPipe) id: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.listVersions(req.user.tenantId, id);
  }

  @Post(':id/versions/:versionId/restore')
  restore(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('versionId', ParseObjectIdPipe) versionId: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.reviews.restore(
      req.user.tenantId,
      id,
      versionId,
      req.user.userId,
    );
  }
}
