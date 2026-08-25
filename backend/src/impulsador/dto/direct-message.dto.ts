import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DirectMessageDto {
  @IsIn(['whatsapp', 'email'])
  channel!: 'whatsapp' | 'email';

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  mediaType?: 'image' | 'video';
}
