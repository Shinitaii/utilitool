import {z} from "zod";

export const LLM_PROVIDERS = ["groq", "ollama_cloud"] as const;

export const UpsertLlmConfigDTOSchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(255),
  apiKey: z.string().trim().min(0).max(500).optional(),
});
export type UpsertLlmConfigDTO = z.infer<typeof UpsertLlmConfigDTOSchema>;

export const UpsertVisionLlmConfigDTOSchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(255),
  apiKey: z.string().trim().min(0).max(500).optional(),
});
export type UpsertVisionLlmConfigDTO = z.infer<typeof UpsertVisionLlmConfigDTOSchema>;

export interface LlmConfigResponseDTO {
  provider: (typeof LLM_PROVIDERS)[number] | null;
  model: string | null;
  hasKey: boolean;
  visionProvider: (typeof LLM_PROVIDERS)[number] | null;
  visionModel: string | null;
  // True when a vision config is set up — either via its own API key, or
  // (when visionProvider === provider) by reusing the chat API key.
  visionHasKey: boolean;
}
