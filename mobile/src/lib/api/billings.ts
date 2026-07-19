import { apiGet, apiPatch } from './client';

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

export async function listBillings(propertyId?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.append('propertyId', propertyId);
  return apiGet(`/billings${params.toString() ? '?' + params.toString() : ''}`);
}

export async function updateBillingStatus(id: string, paymentStatus: string) {
  return apiPatch(`/billings/${id}`, { payment_status: paymentStatus });
}
