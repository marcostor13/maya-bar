import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuthReq } from '../../auth/permissions';
import { ONBOARDING_STATUSES, OnboardingService } from './onboarding.service';

class ChecklistItemDto {
  @IsInt()
  @Min(0)
  index: number;

  @IsBoolean()
  done: boolean;
}

class UpdateOnboardingDto {
  @IsOptional()
  @IsIn(ONBOARDING_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

/** Implementaciones pagadas (HU55): solo el superadmin. */
@Controller('billing/admin/onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  private superadmin(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
  }

  @Get()
  list(@Request() req: AuthReq, @Query('status') status?: string) {
    this.superadmin(req);
    return this.onboarding.list(status);
  }

  @Patch(':id')
  update(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    this.superadmin(req);
    return this.onboarding.update(id, dto);
  }
}
