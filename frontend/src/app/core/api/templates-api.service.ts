import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { EmailDesign } from '../../pages/templates/email-design';

/** Variable insertable en un texto, con un valor de muestra. */
export interface TemplateVariable {
  token: string;
  label: string;
  example: string;
}

export type MessageChannel = 'sms' | 'whatsapp' | 'email';

export interface MessageTemplate {
  _id: string;
  name: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
  updatedAt: string;
}

export interface MessageTemplateInput {
  name: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
}

export interface SmsSegments {
  encoding: 'GSM-7' | 'UCS-2';
  length: number;
  segments: number;
  perSegment: number;
  unicodeChars: string[];
}

export interface MessagePreview {
  subject?: string;
  body: string;
  unknown: string[];
  sms: SmsSegments;
}

export interface EmailTemplateSummary {
  _id: string;
  name: string;
  subject: string;
  preheader: string;
  mode: 'blocks' | 'html';
  updatedAt: string;
}

export interface EmailTemplate extends EmailTemplateSummary {
  design?: EmailDesign;
  html: string;
}

export interface EmailTemplateInput {
  name: string;
  subject: string;
  preheader: string;
  mode: 'blocks' | 'html';
  design?: EmailDesign;
  html: string;
}

export interface GenerateEmailInput {
  brief: string;
  tone?: string;
  goal?: string;
  ctaUrl?: string;
  brandColor?: string;
}

export interface GeneratedEmail {
  subject: string;
  preheader: string;
  design: EmailDesign;
}

/** Plantillas de mensaje (texto con variables) y plantillas HTML de email. */
@Injectable({ providedIn: 'root' })
export class TemplatesApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // ── Variables ──
  variables(): Observable<TemplateVariable[]> {
    return this.http.get<TemplateVariable[]>(`${this.base}/message-templates/variables`);
  }

  // ── Plantillas de mensaje ──
  messageTemplates(channel?: MessageChannel): Observable<MessageTemplate[]> {
    return this.http.get<MessageTemplate[]>(`${this.base}/message-templates`, {
      params: channel ? { channel } : {},
    });
  }

  createMessageTemplate(input: MessageTemplateInput): Observable<MessageTemplate> {
    return this.http.post<MessageTemplate>(`${this.base}/message-templates`, input);
  }

  updateMessageTemplate(id: string, input: Partial<MessageTemplateInput>): Observable<MessageTemplate> {
    return this.http.patch<MessageTemplate>(`${this.base}/message-templates/${id}`, input);
  }

  deleteMessageTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/message-templates/${id}`);
  }

  previewMessage(body: string, subject?: string, customerId?: string): Observable<MessagePreview> {
    return this.http.post<MessagePreview>(`${this.base}/message-templates/preview`, {
      body,
      subject,
      customerId,
    });
  }

  // ── Plantillas de email ──
  emailTemplates(): Observable<EmailTemplateSummary[]> {
    return this.http.get<EmailTemplateSummary[]>(`${this.base}/email-templates`);
  }

  emailTemplate(id: string): Observable<EmailTemplate> {
    return this.http.get<EmailTemplate>(`${this.base}/email-templates/${id}`);
  }

  createEmailTemplate(input: EmailTemplateInput): Observable<EmailTemplate> {
    return this.http.post<EmailTemplate>(`${this.base}/email-templates`, input);
  }

  updateEmailTemplate(id: string, input: Partial<EmailTemplateInput>): Observable<EmailTemplate> {
    return this.http.patch<EmailTemplate>(`${this.base}/email-templates/${id}`, input);
  }

  duplicateEmailTemplate(id: string): Observable<EmailTemplate> {
    return this.http.post<EmailTemplate>(`${this.base}/email-templates/${id}/duplicate`, {});
  }

  deleteEmailTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/email-templates/${id}`);
  }

  generateEmail(input: GenerateEmailInput): Observable<GeneratedEmail> {
    return this.http.post<GeneratedEmail>(`${this.base}/email-templates/generate`, input);
  }

  sendTestEmail(to: string, subject: string, html: string): Observable<void> {
    return this.http.post<void>(`${this.base}/email-templates/test`, { to, subject, html });
  }

  uploadImage(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<{ url: string }>(`${this.base}/upload?folder=email-templates`, fd);
  }
}
