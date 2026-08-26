import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Campos del contacto a los que se puede mapear una columna del origen. */
export const TARGET_FIELDS = [
  'name',
  'email',
  'phone',
  'tags',
  'notes',
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

export const DEDUPE_KEYS = ['email', 'phone', 'both'] as const;
export type DedupeKey = (typeof DEDUPE_KEYS)[number];

/**
 * Mapa campo del contacto → columna/campo del origen. Lo que no se mapea y
 * `keepUnmapped` recoge acaba en `customFields`.
 */
export class ImportMappingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ImportOptionsDto {
  @ValidateNested()
  @Type(() => ImportMappingDto)
  mapping: ImportMappingDto;

  /** Por qué campo se decide si un contacto ya existe. */
  @IsOptional()
  @IsIn(DEDUPE_KEYS)
  dedupeBy?: DedupeKey;

  /** Etiquetas que se añaden a todos los contactos de la importación. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** Si es false, los contactos existentes no se tocan. */
  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;

  /**
   * Guarda TODAS las columnas sin mapear en `customFields`. Solo se aplica
   * cuando no llega `customFields`, que es la selección explícita.
   */
  @IsOptional()
  @IsBoolean()
  keepUnmapped?: boolean;

  /**
   * Columnas del origen que se guardan en `customFields`, elegidas una a una.
   * Un array vacío significa "ninguna", que es distinto de no mandar el campo.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customFields?: string[];
}

/** Conexión a la base de origen. */
export class MongoConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  uri: string;

  @IsString()
  @IsNotEmpty()
  database: string;

  @IsString()
  @IsNotEmpty()
  collection: string;

  /** Filtro de Mongo en JSON; vacío = toda la colección. */
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
}

export class AnalyzeMongoDto extends MongoConnectionDto {}

export class ImportMongoDto extends MongoConnectionDto {
  @ValidateNested()
  @Type(() => ImportOptionsDto)
  options: ImportOptionsDto;

  /** Si llega, guarda la conexión con este nombre para re-sincronizar. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  saveAs?: string;

  /** Id de una fuente ya guardada, para actualizarla en vez de crear otra. */
  @IsOptional()
  @IsString()
  sourceId?: string;
}

/** Resumen de lo que se importó. */
export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  sourceId?: string;
}

/** Lo que devuelve el análisis previo, para pintar el mapeo. */
export interface AnalyzeResult {
  columns: string[];
  /** Valores de ejemplo por columna, para que el usuario reconozca el campo. */
  samples: Record<string, string[]>;
  totalRows: number;
  /** Mapeo sugerido a partir del nombre de cada columna. */
  suggested: Record<string, string>;
}
