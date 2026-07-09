export interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

export interface BaseModel {
  id: string;
  created_at: FirestoreTimestamp;
  updated_at?: FirestoreTimestamp;
  deleted_at?: FirestoreTimestamp | null;
  is_deleted: boolean;
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
