import { apiGet, apiPatch, buildQueryString } from './client';

export interface Billing {
  id: string;
  property_id: string;
  previous_reading_id: string;
  current_reading_id: string;
  current_reading_amount: number;
  payment_status: 'pending' | 'paid' | 'overdue';
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface BillingsListResponse {
  data: Billing[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export async function listBillings(propertyId?: string): Promise<BillingsListResponse> {
  return apiGet<BillingsListResponse>(`/billings${buildQueryString({ propertyId })}`);
}

export async function updateBillingStatus(id: string, paymentStatus: string): Promise<Billing> {
  return apiPatch<Billing>(`/billings/${id}`, { payment_status: paymentStatus });
}
