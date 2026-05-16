import { apiPost } from './client';
import type { LoginRequest, RegisterRequest, RefreshRequest, AuthResponse } from '$lib/types/auth.types';

export async function login(email: string, password: string): Promise<AuthResponse> {
  const request: LoginRequest = { email, password };
  return apiPost<AuthResponse>('/auth/login', request, { skipAuth: true });
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const request: RegisterRequest = { email, password };
  return apiPost<AuthResponse>('/auth/register', request, { skipAuth: true });
}

export async function refreshToken(refreshToken: string): Promise<AuthResponse> {
  const request: RefreshRequest = { refresh_token: refreshToken };
  return apiPost<AuthResponse>('/auth/refresh', request, { skipAuth: true });
}

export async function logout(refreshTokenId: string): Promise<void> {
  return apiPost('/auth/logout', { refreshTokenId });
}
