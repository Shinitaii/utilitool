import type { BaseModel, FirestoreTimestamp } from './api.types';

export interface Tenant extends BaseModel {
  tenant_name: string;
  property_id: string;
  tenant_start_date: FirestoreTimestamp;
  tenant_end_date?: FirestoreTimestamp;
}

export interface CreateTenantRequest {
  tenant_name: string;
  property_id: string;
}

export interface UpdateTenantRequest {
  tenant_name?: string;
  property_id?: string;
}
