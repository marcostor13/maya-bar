import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'date';

/** Campo del contacto al que se vuelca la respuesta. Vacío → dato extra. */
export type FormFieldMapTo = 'name' | 'email' | 'phone' | 'notes' | '';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required: boolean;
  options: string[];
  mapTo: FormFieldMapTo;
}

export interface ContactForm {
  _id: string;
  name: string;
  description?: string;
  publicKey: string;
  fields: FormField[];
  tags: string[];
  listIds: string[];
  active: boolean;
  successMessage: string;
  redirectUrl?: string;
  submissionCount: number;
  lastSubmissionAt?: string;
  createdAt: string;
}

export interface FormSubmission {
  _id: string;
  formId: string;
  customerId?: string;
  data: Record<string, unknown>;
  pageUrl?: string;
  referer?: string;
  createdAt: string;
}

export interface FormPayload {
  name: string;
  description?: string;
  fields: FormField[];
  tags: string[];
  listIds: string[];
  active: boolean;
  successMessage: string;
  redirectUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class FormsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/forms`;

  /** Base pública que se pega en la landing del cliente. */
  readonly publicBase = `${environment.apiUrl}/public/forms`;

  list(): Observable<ContactForm[]> {
    return this.http.get<ContactForm[]>(this.base);
  }

  create(payload: FormPayload): Observable<ContactForm> {
    return this.http.post<ContactForm>(this.base, payload);
  }

  update(id: string, payload: FormPayload): Observable<ContactForm> {
    return this.http.patch<ContactForm>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  regenerateKey(id: string): Observable<ContactForm> {
    return this.http.post<ContactForm>(`${this.base}/${id}/regenerate-key`, {});
  }

  submissions(id: string): Observable<FormSubmission[]> {
    return this.http.get<FormSubmission[]>(`${this.base}/${id}/submissions`);
  }
}
