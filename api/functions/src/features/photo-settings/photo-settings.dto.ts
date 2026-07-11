import {z} from "zod";

export const UpsertPhotoSettingsDTOSchema = z.object({
  savePhotos: z.boolean(),
});
export type UpsertPhotoSettingsDTO = z.infer<typeof UpsertPhotoSettingsDTOSchema>;

export interface PhotoSettingsResponseDTO {
  // Whether to persist meter-reading photos (image_url) when creating readings.
  // Defaults to false — OCR suggest still works either way, but the photo
  // itself is discarded before submission unless explicitly enabled. Bill /
  // billing-cycle photos are never persisted regardless of this setting.
  savePhotos: boolean;
}
