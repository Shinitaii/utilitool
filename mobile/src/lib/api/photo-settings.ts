import { apiGet, apiPatch } from './client';

export interface PhotoSettings {
  savePhotos: boolean;
}

export async function getPhotoSettings(): Promise<PhotoSettings> {
  return apiGet('/photo-settings');
}

export async function upsertPhotoSettings(data: PhotoSettings): Promise<PhotoSettings> {
  return apiPatch('/photo-settings', data);
}
