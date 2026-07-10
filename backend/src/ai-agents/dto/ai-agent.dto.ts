import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

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
