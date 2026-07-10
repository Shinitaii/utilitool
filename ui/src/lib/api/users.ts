import { apiPost } from './client';

export interface CreateUserRequest {
	uid: string;
	role: 'admin' | 'landlord' | 'assistant';
}

export async function createUser(data: CreateUserRequest) {
	return apiPost('/users', data);
}
