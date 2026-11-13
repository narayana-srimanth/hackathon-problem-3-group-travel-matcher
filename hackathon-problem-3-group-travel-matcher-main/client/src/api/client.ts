import type { ErrorCode, ErrorDetail } from './types';

const BASE = '/api/v1';
const STORAGE_KEY = 'gtm.travellerId';

// ---- Identity (M1: no passwords, just an ID kept on this device) ----
export const identity = {
  get: (): string | null => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  },
  set: (id: string) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
  },
  clear: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  },
};

// ---- Error envelope (§3) ----
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];
  readonly requestId?: string;

  constructor(status: number, code: ErrorCode, message: string, details: ErrorDetail[] = [], requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field-level messages for form validation, keyed by field name. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) if (d.field && !out[d.field]) out[d.field] = d.issue;
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

// Called when the server says our stored ID is no longer valid.
let onUnauthenticated: () => void = () => {};
export const setUnauthenticatedHandler = (fn: () => void) => { onUnauthenticated = fn; };

type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

function toQueryString(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  query?: Query;
  body?: unknown;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const id = identity.get();
    if (id) headers['X-Traveller-Id'] = id;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${toQueryString(opts.query)}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check that the backend is running.");
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: ErrorCode; message?: string; details?: ErrorDetail[]; requestId?: string } } | null)?.error;
    const apiErr = new ApiError(
      res.status,
      err?.code ?? (res.status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR'),
      err?.message ?? `Request failed (${res.status})`,
      Array.isArray(err?.details) ? err!.details! : [],
      err?.requestId ?? res.headers.get('X-Request-Id') ?? undefined,
    );
    if (apiErr.code === 'UNAUTHENTICATED') onUnauthenticated();
    throw apiErr;
  }

  return data as T;
}
