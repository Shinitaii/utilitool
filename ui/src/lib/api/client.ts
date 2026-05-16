import { browser } from '$app/environment';
import type { ApiError } from '$lib/types/api.types';

const API_BASE_URL = 'http://localhost:5002';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  if (browser) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && browser) {
    accessToken = localStorage.getItem('access_token');
  }
  return accessToken;
}

export function getRefreshToken(): string | null {
  if (!refreshToken && browser) {
    refreshToken = localStorage.getItem('refresh_token');
  }
  return refreshToken;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (browser) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const token = getRefreshToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token })
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();
    setTokens(data.access_token, token);
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearTokens();
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers || {});

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  headers.set('Content-Type', 'application/json');

  const url = `${API_BASE_URL}${path}`;
  let response = await fetch(url, { ...fetchOptions, headers });

  // Handle 401 by refreshing token and retrying once
  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const token = getAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      response = await fetch(url, { ...fetchOptions, headers });
    }
  }

  if (!response.ok) {
    let errorData: ApiError;
    try {
      const json = await response.json();
      errorData = {
        status: response.status,
        message: json.message || response.statusText,
        details: json
      };
    } catch {
      errorData = {
        status: response.status,
        message: response.statusText
      };
    }
    throw errorData;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined
  });
}

export async function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'DELETE' });
}
