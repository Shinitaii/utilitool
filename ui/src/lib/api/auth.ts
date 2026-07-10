import { apiGet, apiPatch } from './client';
import type { AuthUser } from '$lib/types/auth.types';

export async function getMe(): Promise<AuthUser> {
	return apiGet<AuthUser>('/auth/me');
}

export interface UpdateMeRequest {
	display_name?: string;
	qr_payment_url?: string;
}

export async function updateMe(data: UpdateMeRequest): Promise<AuthUser> {
	return apiPatch<AuthUser>('/auth/me', data);
}
