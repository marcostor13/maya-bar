export class CreateCampaignDto {
  name: string;
  type: 'email' | 'whatsapp';
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting?: 'all' | 'tags' | 'lists';
  recipientTags?: string[];
  listIds?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  templateName?: string;
  templateLanguage?: string;
  templateVars?: string[];
}

export class UpdateCampaignDto {
  name?: string;
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body?: string;
  targeting?: 'all' | 'tags' | 'lists';
  recipientTags?: string[];
  listIds?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  templateName?: string;
  templateLanguage?: string;
  templateVars?: string[];
}
