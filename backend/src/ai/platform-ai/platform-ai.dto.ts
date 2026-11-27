import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AiProviderId } from '../providers/ai-provider.interface';
import { PLATFORM_AI_PROVIDERS } from './platform-ai.schema';

export class SavePlatformAiDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsIn(PLATFORM_AI_PROVIDERS)
  provider?: AiProviderId;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  /** Vacía u omitida: se conserva la guardada (si es del mismo proveedor). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}

export class PlatformAiModelsDto {
  @IsIn(PLATFORM_AI_PROVIDERS)
  provider: AiProviderId;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}

export class TestPlatformAiDto extends PlatformAiModelsDto {
  @IsString()
  @MaxLength(120)
  model: string;
}
