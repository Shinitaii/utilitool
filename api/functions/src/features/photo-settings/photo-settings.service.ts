import {photoSettingsRepository} from "./photo-settings.repository";
import {UpsertPhotoSettingsDTO, PhotoSettingsResponseDTO} from "./photo-settings.dto";
import {PhotoSettings} from "./photo-settings.model";

const DEFAULT_SAVE_PHOTOS = false;

function toResponseDTO(config: PhotoSettings): PhotoSettingsResponseDTO {
  return {savePhotos: config.save_photos};
}

export const photoSettingsService = {
  // Unlike llm-config, this always resolves — no config yet just means the
  // (disabled-by-default) default applies, not a 404.
  async get(userId: string): Promise<PhotoSettingsResponseDTO> {
    const config = await photoSettingsRepository.getByUserId(userId);
    return config ? toResponseDTO(config) : {savePhotos: DEFAULT_SAVE_PHOTOS};
  },

  async upsert(userId: string, data: UpsertPhotoSettingsDTO): Promise<PhotoSettingsResponseDTO> {
    const existing = await photoSettingsRepository.getByUserId(userId);
    const payload = {save_photos: data.savePhotos};

    const result = existing ?
      await photoSettingsRepository.update(userId, payload) :
      await photoSettingsRepository.create(userId, payload as Omit<PhotoSettings, keyof import("../../utils/model.util").BaseModel>);

    return toResponseDTO(result);
  },
};
