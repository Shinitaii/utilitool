import {PhotoSettings} from "./photo-settings.model";
import {COLLECTIONS} from "../../constants/collection.constants";
import {getDocument, setDocument, updateDocument} from "../../lib/firestore.lib";
import {WithoutBaseModel} from "../../utils/model.util";

// One settings document per user, keyed by userId (same pattern as llm-config).
export const photoSettingsRepository = {
  async getByUserId(userId: string): Promise<PhotoSettings | null> {
    return getDocument<PhotoSettings>(COLLECTIONS.PHOTO_SETTINGS, userId);
  },

  async create(userId: string, data: WithoutBaseModel<PhotoSettings>): Promise<PhotoSettings> {
    return setDocument<PhotoSettings>(COLLECTIONS.PHOTO_SETTINGS, userId, data);
  },

  async update(userId: string, data: Partial<WithoutBaseModel<PhotoSettings>>): Promise<PhotoSettings> {
    return updateDocument<PhotoSettings>(COLLECTIONS.PHOTO_SETTINGS, userId, data);
  },
};
