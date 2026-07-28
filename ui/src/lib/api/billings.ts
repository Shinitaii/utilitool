import { apiGet } from './client';
import { createCrudApi } from './crud-api-factory';
import type { Billing, CreateBillingRequest, UpdateBillingRequest } from '$lib/types/billing.types';

interface GetBillingsParams {
	propertyId?: string;
	meterGroupId?: string;
	startDate?: string;
	endDate?: string;
	limit?: number;
	cursor?: string;
	archived?: boolean;
}

const billingsApi = createCrudApi<
	Billing,
	CreateBillingRequest,
	UpdateBillingRequest,
	GetBillingsParams
>('/billings');

export const getBillings = billingsApi.get;
export const getBillingById = billingsApi.getById;
export const createBilling = billingsApi.create;
export const createBillingsBatch = billingsApi.createBatch;
export const updateBilling = billingsApi.update;
export const updateBillingsBatch = billingsApi.updateBatch;
export const softDeleteBilling = billingsApi.softDelete;
export const restoreBilling = billingsApi.restore;
export const clearCache = billingsApi.clearCache;

export async function getBillingsByIds(ids: string[]): Promise<Billing[]> {
	return apiGet<Billing[]>(`/billings/batch-get?ids=${ids.map(encodeURIComponent).join(',')}`);
}
