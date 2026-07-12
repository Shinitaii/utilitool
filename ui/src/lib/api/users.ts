import { apiPost } from './client';

export interface CreateUserRequest {
	email: string;
	password: string;
	displayName?: string;
	role: 'admin' | 'landlord' | 'assistant';
}

export async function createUser(data: CreateUserRequest) {
	return apiPost('/users', data);
}
