import {llmConfigRepository} from "./llm-config.repository";
import {encryptSecret, decryptSecret} from "../../lib/crypto.lib";
import {UpsertLlmConfigDTO, LlmConfigResponseDTO} from "./llm-config.dto";
import {LlmConfig} from "./llm-config.model";
import {AppError} from "../../utils/error.util";

function toResponseDTO(config: LlmConfig): LlmConfigResponseDTO {
  return {
    provider: config.provider,
    model: config.model,
    hasKey: Boolean(config.encrypted_api_key),
  };
}

export const llmConfigService = {
  async get(userId: string): Promise<LlmConfigResponseDTO | null> {
    const config = await llmConfigRepository.getByUserId(userId);
    return config ? toResponseDTO(config) : null;
  },

  async upsert(userId: string, data: UpsertLlmConfigDTO): Promise<LlmConfigResponseDTO> {
    const existing = await llmConfigRepository.getByUserId(userId);

    if (!data.apiKey && !existing) {
      throw new AppError(400, "apiKey is required when configuring a provider for the first time");
    }

    const payload = {
      provider: data.provider,
      model: data.model,
      ...(data.apiKey ? (() => {
        const {ciphertext, iv, authTag} = encryptSecret(data.apiKey as string);
        return {encrypted_api_key: ciphertext, iv, auth_tag: authTag};
      })() : {}),
    };

    const result = existing ?
      await llmConfigRepository.update(userId, payload) :
      await llmConfigRepository.create(userId, payload as Omit<LlmConfig, keyof import("../../utils/model.util").BaseModel>);

    return toResponseDTO(result);
  },

  /**
   * Decrypts and returns the plaintext API key for internal server-side use
   * only (e.g. calling the LLM provider). Never expose this value in an HTTP
   * response.
   */
  async getDecryptedConfig(userId: string): Promise<{provider: LlmConfig["provider"]; model: string; apiKey: string}> {
    const config = await llmConfigRepository.getByUserId(userId);
    if (!config) {
      throw new AppError(404, "LLM provider not configured. Set it up in Settings first.");
    }
    return {
      provider: config.provider,
      model: config.model,
      apiKey: decryptSecret({
        ciphertext: config.encrypted_api_key,
        iv: config.iv,
        authTag: config.auth_tag,
      }),
    };
  },
};
