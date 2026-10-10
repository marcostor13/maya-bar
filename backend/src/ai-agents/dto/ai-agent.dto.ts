import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { HANDOFF_CHANNELS } from '../ai-agent.schema';
import type { HandoffChannel } from '../ai-agent.schema';

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
