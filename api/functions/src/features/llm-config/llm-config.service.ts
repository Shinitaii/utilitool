import {llmConfigRepository} from "./llm-config.repository";
import {encryptSecret, decryptSecret} from "../../lib/crypto.lib";
import {UpsertLlmConfigDTO, UpsertVisionLlmConfigDTO, LlmConfigResponseDTO} from "./llm-config.dto";
import {LlmConfig} from "./llm-config.model";
import {AppError} from "../../utils/error.util";
import {FieldValue} from "firebase-admin/firestore";

function toResponseDTO(config: LlmConfig): LlmConfigResponseDTO {
  const visionConfigured = Boolean(config.vision_provider && config.vision_model);
  const visionSharesChatKey = visionConfigured && config.vision_provider === config.provider && !config.encrypted_vision_api_key;

  return {
    provider: config.provider,
    model: config.model,
    hasKey: Boolean(config.encrypted_api_key),
    visionProvider: config.vision_provider ?? null,
    visionModel: config.vision_model ?? null,
    visionHasKey: visionConfigured && (visionSharesChatKey || Boolean(config.encrypted_vision_api_key)),
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
   * Upserts the vision (OCR) provider/model, independent of the chat
   * provider — some providers (e.g. Ollama Cloud) have no usable free vision
   * model, so users may want Groq for vision and Ollama Cloud for chat (or
   * vice versa). When visionProvider matches the chat provider, the chat API
   * key is reused and apiKey is optional; when it differs, apiKey is
   * required (on first set, or when switching to yet another provider).
   */
  async upsertVision(userId: string, data: UpsertVisionLlmConfigDTO): Promise<LlmConfigResponseDTO> {
    const existing = await llmConfigRepository.getByUserId(userId);
    if (!existing) {
      throw new AppError(400, "Configure the chat provider first, then set up the vision model.");
    }

    const sharesChatProvider = data.provider === existing.provider;

    if (sharesChatProvider) {
      const payload: Partial<LlmConfig> = {
        vision_provider: data.provider,
        vision_model: data.model,
      };
      if (data.apiKey) {
        const {ciphertext, iv, authTag} = encryptSecret(data.apiKey);
        payload.encrypted_vision_api_key = ciphertext;
        payload.vision_iv = iv;
        payload.vision_auth_tag = authTag;
      } else if (existing.encrypted_vision_api_key) {
        // Provider now matches chat's — drop any previously-stored distinct
        // vision key so reads fall back to sharing the chat key. Firestore
        // is configured with ignoreUndefinedProperties, so `undefined` would
        // silently no-op here; FieldValue.delete() is required to actually
        // clear the field.
        payload.encrypted_vision_api_key = FieldValue.delete() as unknown as string;
        payload.vision_iv = FieldValue.delete() as unknown as string;
        payload.vision_auth_tag = FieldValue.delete() as unknown as string;
      }
      const result = await llmConfigRepository.update(userId, payload);
      return toResponseDTO(result);
    }

    const alreadyHasKeyForThisProvider = existing.vision_provider === data.provider && Boolean(existing.encrypted_vision_api_key);
    if (!data.apiKey && !alreadyHasKeyForThisProvider) {
      throw new AppError(400, "apiKey is required when the vision provider differs from the chat provider");
    }

    const payload: Partial<LlmConfig> = {
      vision_provider: data.provider,
      vision_model: data.model,
    };
    if (data.apiKey) {
      const {ciphertext, iv, authTag} = encryptSecret(data.apiKey);
      payload.encrypted_vision_api_key = ciphertext;
      payload.vision_iv = iv;
      payload.vision_auth_tag = authTag;
    }

    const result = await llmConfigRepository.update(userId, payload);
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

  /**
   * Decrypts and returns the plaintext API key + model for internal
   * server-side OCR use only. Throws 404 (no fallback) when unconfigured.
   * Reuses the chat API key when the vision provider matches the chat
   * provider and no distinct vision key was stored.
   */
  async getDecryptedVisionConfig(userId: string): Promise<{provider: LlmConfig["provider"]; model: string; apiKey: string}> {
    const config = await llmConfigRepository.getByUserId(userId);
    if (!config || !config.vision_provider || !config.vision_model) {
      throw new AppError(404, "Vision model not configured. Set it up in Settings first.");
    }

    if (config.vision_provider === config.provider && !config.encrypted_vision_api_key) {
      return {
        provider: config.vision_provider,
        model: config.vision_model,
        apiKey: decryptSecret({
          ciphertext: config.encrypted_api_key,
          iv: config.iv,
          authTag: config.auth_tag,
        }),
      };
    }

    if (config.encrypted_vision_api_key && config.vision_iv && config.vision_auth_tag) {
      return {
        provider: config.vision_provider,
        model: config.vision_model,
        apiKey: decryptSecret({
          ciphertext: config.encrypted_vision_api_key,
          iv: config.vision_iv,
          authTag: config.vision_auth_tag,
        }),
      };
    }

    throw new AppError(404, "Vision model not configured. Set it up in Settings first.");
  },
};
