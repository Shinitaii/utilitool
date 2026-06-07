import { apiGet } from './client';

export interface BillingCycle {
  id: string;
  meter_group_id: string;
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  overdue_date?: string;
  billing_ids: Record<string, number>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface BillingCyclesResponse {
  data: BillingCycle[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export async function listBillingCycles(params?: {
  limit?: number;
  cursor?: string;
}): Promise<BillingCyclesResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);

  const path = query.toString() ? `/billing-cycles?${query}` : '/billing-cycles';
  return apiGet<BillingCyclesResponse>(path);
}

export async function getBillingCycle(id: string): Promise<BillingCycle> {
  return apiGet<BillingCycle>(`/billing-cycles/${id}`);
}
