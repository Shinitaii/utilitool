export interface BatchCreateResult<T> {
  created: T[];
  failed: {index: number; error: string}[];
}
