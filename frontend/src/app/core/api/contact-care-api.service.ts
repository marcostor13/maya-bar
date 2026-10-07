import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Usuario que puede llevar contactos, con cuántos lleva ya. */
export interface ContactOwner {
  _id: string;
  name: string;
  email: string;
  role: string;
  contacts: number;
}

/** Responsable tal como llega poblado en el contacto. */
export interface OwnerRef {
  _id: string;
  name?: string;
  email?: string;
}

export interface PersonRef {
  _id: string;
  name: string;
}

export type ContactActivityType =
  | 'note'
  | 'call'
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'meeting'
  | 'visit'
  | 'task';

export interface TimelineItem {
  _id: string;
  source: 'contact' | 'lead';
  type: string;
  title: string;
  body?: string;
  at: string;
  createdBy?: PersonRef;
  fromUser?: PersonRef;
  toUser?: PersonRef;
  leadId?: string;
  leadTitle?: string;
  editable: boolean;
}

export interface ActivityInput {
  type: ContactActivityType;
  title: string;
  body?: string;
  at?: string;
  conversationId?: string;
}

/** Contacto mínimo que devuelven las acciones de asignación. */
export interface AssignedContact {
  _id: string;
  ownerId?: OwnerRef | null;
}

/** Responsable y bitácora de atención de un contacto. */
@Injectable({ providedIn: 'root' })
export class ContactCareApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/customers`;

  owners(): Observable<ContactOwner[]> {
    return this.http.get<ContactOwner[]>(`${this.base}/owners`);
  }

  claim(id: string): Observable<AssignedContact> {
    return this.http.patch<AssignedContact>(`${this.base}/${id}/claim`, {});
  }

  assign(id: string, toUserId: string, note?: string): Observable<AssignedContact> {
    return this.http.patch<AssignedContact>(`${this.base}/${id}/assign`, { toUserId, note });
  }

  release(id: string, note?: string): Observable<AssignedContact> {
    return this.http.patch<AssignedContact>(`${this.base}/${id}/release`, { note });
  }

  bulkAssign(customerIds: string[], toUserId: string): Observable<{ updated: number; skipped: number }> {
    return this.http.post<{ updated: number; skipped: number }>(`${this.base}/bulk/assign`, {
      customerIds,
      toUserId,
    });
  }

  bulkTags(customerIds: string[], add: string[], remove: string[]): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.base}/bulk/tags`, { customerIds, add, remove });
  }

  timeline(id: string): Observable<TimelineItem[]> {
    return this.http.get<TimelineItem[]>(`${this.base}/${id}/timeline`);
  }

  addActivity(id: string, input: ActivityInput): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/activities`, input);
  }

  updateActivity(id: string, activityId: string, input: Partial<ActivityInput>): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/activities/${activityId}`, input);
  }

  deleteActivity(id: string, activityId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}/activities/${activityId}`);
  }
}
