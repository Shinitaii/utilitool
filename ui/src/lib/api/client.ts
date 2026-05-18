import { auth } from '$lib/firebase';
import type { ApiError } from '$lib/types/api.types';

const API_BASE_URL = 'http://localhost:5002';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function getAccessToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function refreshAccessToken(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    await user.getIdToken(true);
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
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
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  headers.set('Content-Type', 'application/json');

  const url = `${API_BASE_URL}${path}`;
  let response = await fetch(url, { ...fetchOptions, headers });

  // Handle 401 by force-refreshing token and retrying once
  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const token = await getAccessToken();
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

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined
  });
}
