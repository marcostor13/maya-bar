export class MediaFileDto {
  url!: string;
  key!: string;
  name!: string;
  mimeType!: string;
  size!: number;
}

export class FormFieldDto {
  id!: string;
  label!: string;
  type!: string;
  required?: boolean;
  options?: string[];
}

export class CreateEventDto {
  localId!: string;
  title!: string;
  description?: string;
  date!: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  price?: number;
  imageUrl?: string;
  status?: string;
  mediaFiles?: MediaFileDto[];
  formFields?: FormFieldDto[];
  invitationDesign?: Record<string, unknown>;
}

export class UpdateEventDto {
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  price?: number;
  imageUrl?: string;
  status?: string;
  mediaFiles?: MediaFileDto[];
  formFields?: FormFieldDto[];
  invitationDesign?: Record<string, unknown>;
}

export class GenerateDesignDto {
  prompt!: string;
  mediaFiles?: { name: string; url: string; mimeType: string }[];
}

export class SaveTemplateDto {
  name!: string;
  design!: Record<string, unknown>;
}

export class RegisterEventDto {
  name!: string;
  email!: string;
  phone?: string;
  partySize?: number;
  ref?: string;
  customFields?: Record<string, string>;
}

export class ShareEventDto {
  sharedWith?: string[];
  sharedWithAll?: boolean;
}

export class GenerateFromPromptDto {
  prompt!: string;
  mediaFileNames?: string[];
}
