import { apiGet, apiPost, apiPatch, apiDelete, toQueryString } from './client';
import type { PaginatedResult } from '$lib/types/api.types';

/**
 * Shared CRUD shape behind the feature API modules (meter-groups, properties, tenants,
 * readings, billings, billing-cycles) — each previously hand-wrote the same
 * get/getById/create/createBatch/update/updateBatch/softDelete/restore/clearCache set against
 * apiGet/apiPost/apiPatch/apiDelete + toQueryString. Feature-specific extras (OCR endpoints,
 * meter-group reset, batch-get-by-ids) stay as additional exports in each module, not here.
 *
 * `BatchCreateResp` defaults to `T[]` (the common case) — pass e.g. `BatchCreateResult<T>` for
 * modules whose batch-create endpoint reports partial failures instead.
 */
export function createCrudApi<
	T,
	CreateReq,
	UpdateReq,
	Params extends object = Record<string, unknown>,
	BatchCreateResp = T[]
>(basePath: string) {
	return {
		async get(params?: Params): Promise<PaginatedResult<T>> {
			return apiGet<PaginatedResult<T>>(`${basePath}${toQueryString(params)}`);
		},
		async getById(id: string): Promise<T> {
			return apiGet<T>(`${basePath}/${id}`);
		},
		async create(data: CreateReq): Promise<T> {
			return apiPost<T>(basePath, data);
		},
		async createBatch(data: CreateReq[]): Promise<BatchCreateResp> {
			return apiPost<BatchCreateResp>(`${basePath}/batch`, data);
		},
		async update(id: string, data: UpdateReq): Promise<T> {
			return apiPatch<T>(`${basePath}/${id}`, data);
		},
		async updateBatch(data: { id: string; data: UpdateReq }[]): Promise<T[]> {
			return apiPatch<T[]>(`${basePath}/batch`, data);
		},
		async softDelete(id: string): Promise<T> {
			return apiDelete<T>(`${basePath}/${id}`);
		},
		async restore(id: string): Promise<T> {
			return apiPatch<T>(`${basePath}/${id}/restore`, {});
		},
		async clearCache(): Promise<{ message: string }> {
			return apiPost<{ message: string }>(`${basePath}/cache/clear`, {});
		}
	};
}
