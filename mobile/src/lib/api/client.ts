import { auth } from '../../firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002';
const REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Custom error for network issues
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function getAccessToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

/**
 * Wraps fetch with timeout and error handling
 */
async function request(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });

    // Handle 401: refresh token and retry once
    if (response.status === 401) {
      try {
        const retryToken = await auth.currentUser!.getIdToken(true);
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT);
        
        try {
          return await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...headers, 'Authorization': `Bearer ${retryToken}` },
            signal: retryController.signal
          });
        } finally {
          clearTimeout(retryTimeoutId);
        }
      } catch {
        // If refresh fails, return original 401
        return response;
      }
    }

    return response;
  } catch (error) {
    if (error instanceof TypeError && error.name === 'AbortError') {
      throw new NetworkError(`Request timeout (${REQUEST_TIMEOUT}ms exceeded)`);
    }
    if (error instanceof TypeError) {
      throw new NetworkError('Network error: unable to reach server');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handles response and throws ApiError if not ok
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // Response is not JSON
    }

    throw new ApiError(
      response.status,
      errorData.message || errorData.error || response.statusText,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json();
}

export async function apiGet<T = any>(endpoint: string): Promise<T> {
  try {
    const res = await request(endpoint, { method: 'GET' });
    return handleResponse<T>(res);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(`Failed to fetch ${endpoint}`);
  }
}

export async function apiPost<T = any>(endpoint: string, data: any): Promise<T> {
  try {
    const res = await request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return handleResponse<T>(res);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(`Failed to post to ${endpoint}`);
  }
}

export async function apiPatch<T = any>(endpoint: string, data: any): Promise<T> {
  try {
    const res = await request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return handleResponse<T>(res);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(`Failed to patch ${endpoint}`);
  }
}

export async function apiDelete<T = any>(endpoint: string): Promise<T> {
  try {
    const res = await request(endpoint, { method: 'DELETE' });
    return handleResponse<T>(res);
  } catch (error) {
    if (error instanceof ApiError || error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(`Failed to delete ${endpoint}`);
  }
}
