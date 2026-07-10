import {z} from "zod";

export const LLM_PROVIDERS = ["groq", "ollama_cloud"] as const;

export const UpsertLlmConfigDTOSchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(255),
  apiKey: z.string().trim().min(0).max(500).optional(),
});
export type UpsertLlmConfigDTO = z.infer<typeof UpsertLlmConfigDTOSchema>;

export interface LlmConfigResponseDTO {
  provider: (typeof LLM_PROVIDERS)[number];
  model: string;
  hasKey: boolean;
}
