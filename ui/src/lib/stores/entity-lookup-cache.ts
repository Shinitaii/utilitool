import { getBillingsByIds as fetchBillingsByIds } from '$lib/api/billings';
import { getReadingsByIds as fetchReadingsByIds } from '$lib/api/readings';
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

// Server caps a single batch-get call at 100 IDs (batch-get.dto.ts) — chunk larger
// requests instead of failing validation.
const BATCH_GET_CHUNK_SIZE = 100;

async function resolveByIds<T extends { id: string }>(
	ids: string[],
	cache: Map<string, T>,
	fetchByIds: (ids: string[]) => Promise<T[]>
): Promise<Map<string, T>> {
	const uniqueIds = Array.from(new Set(ids.filter((id) => id && id.trim())));
	const missing = uniqueIds.filter((id) => !cache.has(id));

	if (missing.length > 0) {
		const chunks: string[][] = [];
		for (let i = 0; i < missing.length; i += BATCH_GET_CHUNK_SIZE) {
			chunks.push(missing.slice(i, i + BATCH_GET_CHUNK_SIZE));
		}

		try {
			const fetchedChunks = await Promise.all(chunks.map((chunk) => fetchByIds(chunk)));
			for (const entity of fetchedChunks.flat()) {
				cache.set(entity.id, entity);
			}
		} catch {
			// A batch call failing (e.g. all-missing/soft-deleted IDs) resolves to
			// "nothing newly cached" rather than aborting — callers already treat
			// absent IDs as "unknown".
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
	return resolveByIds(ids, billingCache, fetchBillingsByIds);
}

export async function getReadingsByIds(ids: string[]): Promise<Map<string, Reading>> {
	return resolveByIds(ids, readingCache, fetchReadingsByIds);
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
