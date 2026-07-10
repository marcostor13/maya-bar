import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SegmentRule } from '../contact-list.schema';

export class CreateListDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['static', 'dynamic'])
  type: 'static' | 'dynamic';

  @IsOptional()
  @IsArray()
  rules?: SegmentRule[];

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  rules?: SegmentRule[];

  @IsOptional()
  @IsString()
  color?: string;
}

export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  customerIds: string[];
}
