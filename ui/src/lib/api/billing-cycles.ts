import { apiPost } from './client';
import { createCrudApi } from './crud-api-factory';
import type {
	BillingCycle,
	CreateBillingCycleRequest,
	UpdateBillingCycleRequest
} from '$lib/types/billing-cycle.types';
import type { BatchCreateResult } from '$lib/types/api.types';

interface GetBillingCyclesParams {
	meterGroupId?: string;
	billingStartDate?: string;
	billingEndDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}

const billingCyclesApi = createCrudApi<
	BillingCycle,
	CreateBillingCycleRequest,
	UpdateBillingCycleRequest,
	GetBillingCyclesParams,
	BatchCreateResult<BillingCycle>
>('/billing-cycles');

export const getBillingCycles = billingCyclesApi.get;
export const getBillingCycleById = billingCyclesApi.getById;
export const createBillingCycle = billingCyclesApi.create;
export const createBillingCyclesBatch = billingCyclesApi.createBatch;
export const updateBillingCycle = billingCyclesApi.update;
export const updateBillingCyclesBatch = billingCyclesApi.updateBatch;
export const softDeleteBillingCycle = billingCyclesApi.softDelete;
export const restoreBillingCycle = billingCyclesApi.restore;
export const clearCache = billingCyclesApi.clearCache;

export interface BillingCycleOcrResult {
	billing_start_date: string;
	billing_end_date: string;
	billing_consumption: number;
	billing_rate: number;
	raw_amount: number;
}

export async function ocrBillingCycle(imageUrl: string): Promise<BillingCycleOcrResult> {
	return apiPost<BillingCycleOcrResult>('/billing-cycles/ocr', { image_url: imageUrl });
}
