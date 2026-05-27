import { apiPost } from './client';

export async function clearAllCaches(): Promise<void> {
  await Promise.all([
    apiPost<{ message: string }>('/properties/cache/clear', {}),
    apiPost<{ message: string }>('/meter-groups/cache/clear', {}),
    apiPost<{ message: string }>('/tenants/cache/clear', {}),
    apiPost<{ message: string }>('/readings/cache/clear', {}),
    apiPost<{ message: string }>('/billings/cache/clear', {}),
    apiPost<{ message: string }>('/billing-cycles/cache/clear', {})
  ]);
}
