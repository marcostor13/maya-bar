import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateVisitDto {
  @IsString()
  @IsNotEmpty()
  reference!: string;

  @IsObject()
  location!: { lat: number; lng: number; accuracy?: number };

  @IsOptional()
  @IsString()
  address?: string;
}
