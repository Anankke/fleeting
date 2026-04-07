/**
 * Typed fetch wrapper. Always sends session cookie and expects JSON responses.
 * Throws an Error with the HTTP status for non-2xx responses.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) {
    throw new ApiError(res.status, json?.message ?? res.statusText);
  }
  return json as T;
}

export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
};

// ── Typed helpers ──────────────────────────────────────────────────────────────

export interface MeResponse {
  userId: string;
  name: string;
  roles: string[];
  characters: Array<{ id: number; name: string }>;
}

export function getMe() {
  return api.get<MeResponse>('/api/me');
}
