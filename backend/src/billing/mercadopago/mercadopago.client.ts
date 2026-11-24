import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 15_000;
const RETRIES = 2;

export interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  payment_type_id?: string;
  transaction_amount: number;
  currency_id: string;
  description?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  date_created?: string;
  date_approved?: string | null;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
  };
  preapproval_id?: string;
  point_of_interaction?: { transaction_data?: { subscription_id?: string } };
  /** PagoEfectivo: enlace con el código CIP y las instrucciones. */
  transaction_details?: {
    external_resource_url?: string;
    payment_method_reference_id?: string;
  };
}

export interface MpPreapproval {
  id: string;
  status: string;
  reason?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  init_point?: string;
  auto_recurring?: {
    frequency: number;
    frequency_type: 'months' | 'days';
    transaction_amount: number;
    currency_id: string;
  };
}

export interface MpAuthorizedPayment {
  id: number | string;
  preapproval_id: string;
  status: string;
  payment?: { id: number | string; status: string };
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export interface MpOAuthToken {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id: number | string;
  expires_in?: number;
  live_mode?: boolean;
}

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Cliente REST mínimo de Mercado Pago (HU45): Checkout Pro, suscripciones
 * (`preapproval`), pagos y reembolsos. Timeout por llamada y reintentos solo
 * ante fallos de red o 5xx; los 4xx se devuelven tal cual.
 */
@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);

  constructor(private config: ConfigService) {}

  configured(): boolean {
    return !!this.token();
  }

  publicKey(): string | undefined {
    return this.config.get<string>('MP_PUBLIC_KEY') || undefined;
  }

  private token(): string | undefined {
    return this.config.get<string>('MP_ACCESS_TOKEN') || undefined;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
    sellerToken?: string,
  ): Promise<T> {
    // `sellerToken`: cuenta de la empresa conectada por OAuth (HU67).
    const token = sellerToken ?? this.token();
    if (!token)
      throw new MercadoPagoError(
        'Mercado Pago no está configurado (MP_ACCESS_TOKEN)',
      );
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await fetch(`${API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await res.text();
        if (res.ok) return (text ? JSON.parse(text) : {}) as T;
        const error = new MercadoPagoError(
          `Mercado Pago ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`,
          res.status,
        );
        if (res.status < 500) throw error;
        lastError = error;
      } catch (err) {
        if (err instanceof MercadoPagoError && (err.status ?? 500) < 500)
          throw err;
        lastError = err;
      }
      if (attempt < RETRIES)
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    this.logger.warn(`Mercado Pago no respondió: ${String(lastError)}`);
    throw lastError instanceof Error
      ? lastError
      : new MercadoPagoError(String(lastError));
  }

  createPreference(body: Record<string, unknown>, idempotencyKey: string) {
    return this.request<MpPreference>(
      'POST',
      '/checkout/preferences',
      body,
      idempotencyKey,
    );
  }

  createPreapproval(body: Record<string, unknown>, idempotencyKey: string) {
    return this.request<MpPreapproval>(
      'POST',
      '/preapproval',
      body,
      idempotencyKey,
    );
  }

  getPreapproval(id: string) {
    return this.request<MpPreapproval>(
      'GET',
      `/preapproval/${encodeURIComponent(id)}`,
    );
  }

  updatePreapproval(id: string, body: Record<string, unknown>) {
    return this.request<MpPreapproval>(
      'PUT',
      `/preapproval/${encodeURIComponent(id)}`,
      body,
    );
  }

  getPayment(id: string | number) {
    return this.request<MpPayment>(
      'GET',
      `/v1/payments/${encodeURIComponent(String(id))}`,
    );
  }

  getAuthorizedPayment(id: string | number) {
    return this.request<MpAuthorizedPayment>(
      'GET',
      `/authorized_payments/${encodeURIComponent(String(id))}`,
    );
  }

  async searchPayments(externalReference: string): Promise<MpPayment[]> {
    const q = new URLSearchParams({
      external_reference: externalReference,
      sort: 'date_created',
      criteria: 'desc',
    });
    const res = await this.request<{ results?: MpPayment[] }>(
      'GET',
      `/v1/payments/search?${q}`,
    );
    return res.results ?? [];
  }

  // ── Cuenta de la empresa (Marketplace, HU67) ─────────────────────────

  createPreferenceFor(
    sellerToken: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return this.request<MpPreference>(
      'POST',
      '/checkout/preferences',
      body,
      idempotencyKey,
      sellerToken,
    );
  }

  getPaymentFor(sellerToken: string, id: string | number) {
    return this.request<MpPayment>(
      'GET',
      `/v1/payments/${encodeURIComponent(String(id))}`,
      undefined,
      undefined,
      sellerToken,
    );
  }

  refundPaymentFor(sellerToken: string, id: string | number) {
    return this.request<{ id: number }>(
      'POST',
      `/v1/payments/${encodeURIComponent(String(id))}/refunds`,
      {},
      `refund-${id}-full`,
      sellerToken,
    );
  }

  /** Credenciales de la app de Maya en Mercado Pago (para OAuth). */
  oauthApp(): { clientId: string; clientSecret: string } | null {
    const clientId = this.config.get<string>('MP_CLIENT_ID');
    const clientSecret = this.config.get<string>('MP_CLIENT_SECRET');
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  /** `POST /oauth/token`: canjea el código o renueva el token de la empresa. */
  async oauthToken(params: {
    code?: string;
    redirectUri?: string;
    refreshToken?: string;
  }): Promise<MpOAuthToken> {
    const app = this.oauthApp();
    if (!app)
      throw new MercadoPagoError('Falta MP_CLIENT_ID / MP_CLIENT_SECRET');
    const body = params.refreshToken
      ? { grant_type: 'refresh_token', refresh_token: params.refreshToken }
      : {
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: params.redirectUri,
        };
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        ...body,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok)
      throw new MercadoPagoError(
        `Mercado Pago OAuth → ${res.status}: ${text.slice(0, 300)}`,
        res.status,
      );
    return JSON.parse(text) as MpOAuthToken;
  }

  refundPayment(id: string | number, amount?: number) {
    return this.request<{ id: number }>(
      'POST',
      `/v1/payments/${encodeURIComponent(String(id))}/refunds`,
      amount ? { amount } : {},
      `refund-${id}-${amount ?? 'full'}`,
    );
  }
}
