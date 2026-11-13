import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { HANDOFF_CHANNELS } from '../ai-agent.schema';
import type { HandoffChannel } from '../ai-agent.schema';
import { STORE_CART_MODES } from '../store/store-tools';
import type { StoreCartMode } from '../store/store-tools';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WorkingHoursDto {
  @IsInt() @Min(0) @Max(6) day: number;
  @Matches(HHMM) start: string;
  @Matches(HHMM) end: string;
}

/** Agendamiento del agente. La zona y las franjas se validan en el servicio. */
export class AgentCalendarDto {
  @IsBoolean() enabled: boolean;

  /** Vacío = calendario predeterminado de la empresa. */
  @IsOptional() @IsMongoId() connectionId?: string;

  @IsInt() @Min(10) @Max(240) durationMinutes: number;

  @IsString() @MaxLength(64) timeZone: string;

  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  hours: WorkingHoursDto[];

  @IsInt() @Min(0) @Max(120) bufferMinutes: number;
  @IsInt() @Min(0) @Max(720) minNoticeHours: number;
  @IsInt() @Min(1) @Max(180) maxDaysAhead: number;
  @IsBoolean() video: boolean;

  @IsString() @IsNotEmpty() @MaxLength(80) title: string;

  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}

export class HandoffTargetDto {
  @IsIn(HANDOFF_CHANNELS)
  channel: HandoffChannel;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsString()
  accountId?: string;
}

export class CreateAiAgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  systemPrompt: string;

  @IsOptional()
  @IsIn(['auto', 'openai', 'claude', 'deepseek', 'gemini'])
  provider?: 'auto' | 'openai' | 'claude' | 'deepseek' | 'gemini';

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  replyDelaySeconds?: number;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  topK?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instagramAccountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messengerAccountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailAccountIds?: string[];

  @IsOptional()
  @IsBoolean()
  handoffEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoffTargetDto)
  handoffTargets?: HandoffTargetDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handoffNumbers?: string[];

  @IsOptional()
  @IsString()
  handoffAccountId?: string;

  @IsOptional()
  @IsString()
  handoffInstructions?: string;

  @IsOptional()
  @IsString()
  handoffMessage?: string;

  @IsOptional()
  @IsString()
  handoffTemplateName?: string;

  @IsOptional()
  @IsString()
  handoffTemplateLang?: string;

  /** Vacío desactiva las herramientas de tienda. */
  @IsOptional()
  @IsString()
  storeUrl?: string;

  @IsOptional()
  @IsIn(STORE_CART_MODES)
  storeCartMode?: StoreCartMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentCalendarDto)
  calendar?: AgentCalendarDto;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

// PartialType: en un PATCH parcial ningún campo requerido del Create debe ser obligatorio.
export class UpdateAiAgentDto extends PartialType(CreateAiAgentDto) {}

export class AddDocDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

export class TestChatDto {
  @IsArray()
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export class AgentFileDto {
  @IsString()
  @IsNotEmpty()
  alias: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}
