export type LlmProvider = 'groq' | 'ollama_cloud';

export interface LlmConfigResponse {
	provider: LlmProvider | null;
	model: string | null;
	hasKey: boolean;
	visionProvider: LlmProvider | null;
	visionModel: string | null;
	visionHasKey: boolean;
}

export interface UpsertLlmConfigRequest {
	provider: LlmProvider;
	model: string;
	apiKey: string;
}

export interface UpsertVisionLlmConfigRequest {
	provider: LlmProvider;
	model: string;
	apiKey?: string;
}
