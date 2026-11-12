import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePromptReviewDto {
  /** Días hacia atrás que se analizan. */
  @IsOptional() @IsInt() @Min(1) @Max(90) days?: number;
}

export const AGENT_LANGUAGES = ['es', 'en', 'pt'] as const;
export const AGENT_TONES = ['cercano', 'formal', 'entusiasta'] as const;

/** Datos del negocio para generar un agente. */
export class GenerateAgentDto {
  @IsString() @IsNotEmpty() @MaxLength(120) businessName: string;
  @IsString() @IsNotEmpty() @MaxLength(120) industry: string;
  /** Qué vende u ofrece, precios orientativos, zona de atención. */
  @IsString() @IsNotEmpty() @MaxLength(3000) offer: string;
  /** Qué debe lograr el agente (agendar, vender, calificar, soporte…). */
  @IsString() @IsNotEmpty() @MaxLength(1000) goal: string;
  @IsIn(AGENT_TONES) tone: (typeof AGENT_TONES)[number];
  @IsIn(AGENT_LANGUAGES) language: (typeof AGENT_LANGUAGES)[number];
  @IsOptional() @IsString() @MaxLength(3000) faqs?: string;
  /** Cuándo pasar el chat a una persona. */
  @IsOptional() @IsString() @MaxLength(1000) handoffWhen?: string;
  /** Lo que el agente nunca debe hacer o decir. */
  @IsOptional() @IsString() @MaxLength(1000) restrictions?: string;
}
