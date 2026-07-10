import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['email', 'whatsapp'])
  type: 'email' | 'whatsapp';

  @IsOptional()
  @IsIn(['waha', 'cloudapi'])
  waProvider?: 'waha' | 'cloudapi';

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsIn(['all', 'tags', 'lists'])
  targeting?: 'all' | 'tags' | 'lists';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'document'])
  mediaType?: 'image' | 'video' | 'audio' | 'document';

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateVars?: string[];
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['waha', 'cloudapi'])
  waProvider?: 'waha' | 'cloudapi';

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(['all', 'tags', 'lists'])
  targeting?: 'all' | 'tags' | 'lists';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'document'])
  mediaType?: 'image' | 'video' | 'audio' | 'document';

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateVars?: string[];
}
