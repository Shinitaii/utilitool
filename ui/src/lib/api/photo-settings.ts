import { apiGet, apiPatch } from './client';
import type {
	PhotoSettingsResponse,
	UpsertPhotoSettingsRequest
} from '$lib/types/photo-settings.types';

export async function getPhotoSettings(): Promise<PhotoSettingsResponse> {
	return apiGet<PhotoSettingsResponse>('/photo-settings');
}

export async function upsertPhotoSettings(
	data: UpsertPhotoSettingsRequest
): Promise<PhotoSettingsResponse> {
	return apiPatch<PhotoSettingsResponse>('/photo-settings', data);
}
