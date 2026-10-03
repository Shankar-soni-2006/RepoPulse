import type { ApiResponse } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json: ApiResponse<T> = await res.json();

  if (!json.success) {
    throw new Error(json.error.message);
  }

  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
