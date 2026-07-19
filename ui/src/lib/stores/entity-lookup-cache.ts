import { getBillingById } from '$lib/api/billings';
import { getReadingById } from '$lib/api/readings';
import type { Billing } from '$lib/types/billing.types';
import type { Reading } from '$lib/types/reading.types';

/**
 * Plain (non-Svelte-state) in-memory ID → entity caches for billings and readings.
 *
 * The denormalized meter_group_id/billing_period_date fields (Landing 1) let the pages
 * fetch scoped *lists* directly, so this only handles ID-based lookups: resolving the
 * billing/reading IDs a set of visible billing cycles references, without pulling whole
 * collections. Per-ID reads hit the API's CachedRepository.getById cache, which is far
 * less prone to invalidation churn than the per-collection list cache (a single mark-paid
 * invalidates the whole list, but only one ID entry).
 *
 * Only uncached IDs are fetched; results are merged into a persistent module-level cache.
 * Call invalidateEntityLookupCache() after mutations, alongside the existing reload paths.
 */

const billingCache = new Map<string, Billing>();
const readingCache = new Map<string, Reading>();

async function resolveByIds<T extends { id: string }>(
	ids: string[],
	cache: Map<string, T>,
	fetchById: (id: string) => Promise<T>
): Promise<Map<string, T>> {
	const uniqueIds = Array.from(new Set(ids.filter((id) => id && id.trim())));
	const missing = uniqueIds.filter((id) => !cache.has(id));

	if (missing.length > 0) {
		const fetched = await Promise.all(
			missing.map(async (id) => {
				try {
					return await fetchById(id);
				} catch {
					// A missing/soft-deleted entity resolves to undefined rather than aborting
					// the whole batch — callers already treat absent IDs as "unknown".
					return undefined;
				}
			})
		);
		for (const entity of fetched) {
			if (entity) cache.set(entity.id, entity);
		}
	}

	// Return only the requested subset, in a fresh map the caller owns.
	const result = new Map<string, T>();
	for (const id of uniqueIds) {
		const entity = cache.get(id);
		if (entity) result.set(id, entity);
	}
	return result;
}

export async function getBillingsByIds(ids: string[]): Promise<Map<string, Billing>> {
	return resolveByIds(ids, billingCache, getBillingById);
}

export async function getReadingsByIds(ids: string[]): Promise<Map<string, Reading>> {
	return resolveByIds(ids, readingCache, getReadingById);
}

/** Update a single cached billing in place (e.g. after a local mark-as-paid) without a refetch. */
export function setCachedBilling(billing: Billing): void {
	billingCache.set(billing.id, billing);
}

/** Clear both caches. Call after mutations that may change billing/reading data. */
export function invalidateEntityLookupCache(): void {
	billingCache.clear();
	readingCache.clear();
}
