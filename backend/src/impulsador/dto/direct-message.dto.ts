export class DirectMessageDto {
  channel!: 'whatsapp' | 'email';
  body!: string;
  subject?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}
