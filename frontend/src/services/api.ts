import type { ApiResponse } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Error raised for any failed API call; keeps the backend error code and HTTP status
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // Required by the backend CSRF guard on state-changing requests
        'X-RepoPulse-Client': 'web',
        ...options?.headers,
      },
    });
  } catch {
    throw new ApiRequestError('NETWORK_ERROR', 'Unable to reach the RepoPulse API', 0);
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    // Proxies and gateways (e.g. 502/504) can return HTML instead of the API envelope
    throw new ApiRequestError(
      'INVALID_RESPONSE',
      `Unexpected response from the API (HTTP ${res.status})`,
      res.status,
    );
  }

  if (!json.success) {
    throw new ApiRequestError(json.error.code, json.error.message, res.status);
  }

  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
