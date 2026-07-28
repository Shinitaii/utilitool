export interface FirestoreTimestamp {
	_seconds: number;
	_nanoseconds: number;
}

// The API's global JSON replacer converts timestamps to ISO strings and unconditionally strips
// is_deleted/deleted_at before they ever reach the client — those fields are server-internal
// only and never appear on a response the UI can observe.
export interface BaseModel {
	id: string;
	created_at: string;
	updated_at?: string;
}

export interface PaginatedResult<T> {
	data: T[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface BatchCreateResult<T> {
	created: T[];
	failed: { index: number; error: string }[];
}

export interface AuthResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

export interface ApiError {
	status: number;
	message: string;
	details?: Record<string, unknown>;
}
