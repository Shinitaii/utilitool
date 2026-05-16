export interface PaginationOptions {
  limit: number;
  orderBy: string;
  orderDirection?: 'asc' | 'desc';
  cursor?: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}