import {LlmConfig} from "./llm-config.model";
import {COLLECTIONS} from "../../constants/collection.constants";
import {getDocument, setDocument, updateDocument} from "../../lib/firestore.lib";
import {WithoutBaseModel} from "../../utils/model.util";

// One config document per user, keyed by userId (deterministic ID — avoids
// duplicate-detection logic for what is always a single record per user).
export const llmConfigRepository = {
  async getByUserId(userId: string): Promise<LlmConfig | null> {
    return getDocument<LlmConfig>(COLLECTIONS.LLM_CONFIG, userId);
  },

  async create(userId: string, data: WithoutBaseModel<LlmConfig>): Promise<LlmConfig> {
    return setDocument<LlmConfig>(COLLECTIONS.LLM_CONFIG, userId, data);
  },

  async update(userId: string, data: Partial<WithoutBaseModel<LlmConfig>>): Promise<LlmConfig> {
    return updateDocument<LlmConfig>(COLLECTIONS.LLM_CONFIG, userId, data);
  },
};
