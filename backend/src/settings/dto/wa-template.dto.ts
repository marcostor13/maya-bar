export class CreateWaTemplateDto {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  body: string;
  headerText?: string;
  footer?: string;
}
