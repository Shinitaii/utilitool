export type LlmProvider = 'groq' | 'ollama_cloud';

export interface LlmConfigResponse {
	provider: LlmProvider | null;
	model: string | null;
	hasKey: boolean;
}

export interface UpsertLlmConfigRequest {
	provider: LlmProvider;
	model: string;
	apiKey: string;
}
