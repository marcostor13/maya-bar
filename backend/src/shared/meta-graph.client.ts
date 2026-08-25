import { Injectable } from '@nestjs/common';

/**
 * Error tipado de la Meta Graph API. Conserva el status HTTP y el cuerpo crudo
 * para que cada caller decida cómo traducirlo (BadRequestException, log, etc.).
 */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

export type MetaGraphHost =
  | 'https://graph.facebook.com'
  | 'https://graph.instagram.com'
  | 'https://api.instagram.com';

export interface MetaRequestOptions {
  /** Host de Meta; por defecto graph.facebook.com */
  host?: MetaGraphHost;
  /** Bearer token; se manda por header Authorization */
  accessToken?: string;
  /** Query params */
  params?: Record<string, string>;
  /** Body JSON (POST) */
  json?: object;
  /** Body application/x-www-form-urlencoded (POST) — usado por los endpoints OAuth */
  form?: Record<string, string>;
  /** Omite el prefijo de versión (p.ej. /oauth/access_token de api.instagram.com) */
  unversioned?: boolean;
}

const GRAPH_VERSION = 'v21.0';

/**
 * Cliente único para la Meta Graph API (Facebook/Instagram/WhatsApp Cloud).
 * Centraliza versión de API, autenticación y el parseo de errores
 * (`error.message` de Graph y `error_message` de los endpoints OAuth),
 * que antes estaba duplicado en cada service.
 */
@Injectable()
export class MetaGraphClient {
  async get<T>(path: string, opts: MetaRequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, opts);
  }

  async post<T>(path: string, opts: MetaRequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, opts);
  }

  async delete<T>(path: string, opts: MetaRequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, opts);
  }

  private buildUrl(path: string, opts: MetaRequestOptions): string {
    const host = opts.host ?? 'https://graph.facebook.com';
    const version = opts.unversioned ? '' : `/${GRAPH_VERSION}`;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const query = opts.params
      ? `?${new URLSearchParams(opts.params).toString()}`
      : '';
    return `${host}${version}${cleanPath}${query}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: MetaRequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;

    let body: string | URLSearchParams | undefined;
    if (opts.json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = new URLSearchParams(opts.form);
    }

    const res = await fetch(this.buildUrl(path, opts), {
      method,
      headers,
      body,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      error_message?: string;
    };

    if (!res.ok || data.error) {
      const message =
        data.error?.message ||
        data.error_message ||
        `Meta Graph API respondió ${res.status}`;
      throw new MetaApiError(message, res.status, data);
    }
    return data as T;
  }
}
