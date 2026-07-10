import { apiPost } from './client';

export interface ChatHistoryMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface ChatResponse {
	reply: string;
}

export async function sendChatMessage(
	message: string,
	history: ChatHistoryMessage[] = []
): Promise<ChatResponse> {
	return apiPost<ChatResponse>('/chatbot', { message, history });
}
