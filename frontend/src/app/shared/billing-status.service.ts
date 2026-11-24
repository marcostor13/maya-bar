import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface BillingStatus {
  plan: string;
  planName: string;
  legacy: boolean;
  status: 'trialing' | 'active' | 'past_due' | 'expired' | 'canceled' | 'legacy';
  readOnly: boolean;
  trialEndsAt?: string;
  trialDaysLeft?: number;
  reason?: string;
  subscription?: {
    period?: 'monthly' | 'quarterly' | 'annual';
    currency?: 'PEN' | 'USD';
    amount?: number;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
    pendingPlan?: string;
    graceEndsAt?: string;
  };
}

const DAY_MS = 86_400_000;

/** Días que quedan hasta `end`, redondeando hacia arriba; nunca negativo. */
export function daysLeft(end: string | Date | undefined, now = new Date()): number {
  if (!end) return 0;
  return Math.max(0, Math.ceil((new Date(end).getTime() - now.getTime()) / DAY_MS));
}

/** Estado de cobro de la empresa (HU41, HU44). */
@Injectable({ providedIn: 'root' })
export class BillingStatusService {
  private http = inject(HttpClient);
  readonly status = signal<BillingStatus | null>(null);

  load(): void {
    this.http.get<BillingStatus>(`${environment.apiUrl}/billing/status`).subscribe({
      next: s => this.status.set(s),
      // Sin estado no se muestra el aviso; el 402 del servidor sigue mandando.
      error: () => this.status.set(null),
    });
  }
}
