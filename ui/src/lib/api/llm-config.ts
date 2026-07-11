import { apiGet, apiPatch } from './client';
import type {
	LlmConfigResponse,
	UpsertLlmConfigRequest,
	UpsertVisionLlmConfigRequest
} from '$lib/types/llm-config.types';

export async function getLlmConfig(): Promise<LlmConfigResponse> {
	return apiGet<LlmConfigResponse>('/llm-config');
}

export async function upsertLlmConfig(data: UpsertLlmConfigRequest): Promise<LlmConfigResponse> {
	return apiPatch<LlmConfigResponse>('/llm-config', data);
}

export async function upsertVisionLlmConfig(
	data: UpsertVisionLlmConfigRequest
): Promise<LlmConfigResponse> {
	return apiPatch<LlmConfigResponse>('/llm-config/vision', data);
}
