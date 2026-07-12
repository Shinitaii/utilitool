import type { PaginatedResult } from '$lib/types/api.types';

interface ArchivePageConfig<T> {
	listFn: (params: { limit: number; archived: true }) => Promise<PaginatedResult<T>>;
	restoreFn: (id: string) => Promise<unknown>;
	clearCacheFn: () => Promise<{ message: string }>;
	entityLabel: string;
	/** Optional side-fetch run alongside the main list (e.g. property/meter-group name lookups). */
	loadExtra?: () => Promise<unknown>;
}

export function createArchivePageState<T>(config: ArchivePageConfig<T>) {
	let data = $state<PaginatedResult<T>>({ data: [], nextCursor: null, hasMore: false });
	let isLoading = $state(false);
	let error = $state('');
	let restoringId = $state<string | null>(null);
	let isClearing = $state(false);

	async function loadData() {
		isLoading = true;
		error = '';
		try {
			const [result] = await Promise.all([
				config.listFn({ limit: 100, archived: true }),
				config.loadExtra?.() ?? Promise.resolve()
			]);
			data = result;
		} catch (err) {
			error = err instanceof Error ? err.message : `Failed to load archived ${config.entityLabel}s`;
		} finally {
			isLoading = false;
		}
	}

	async function handleRestore(id: string) {
		restoringId = id;
		try {
			await config.restoreFn(id);
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : `Failed to restore ${config.entityLabel}`;
		} finally {
			restoringId = null;
		}
	}

	async function handleClearCache() {
		isClearing = true;
		try {
			const result = await config.clearCacheFn();
			error = result.message;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to clear cache';
		} finally {
			isClearing = false;
		}
	}

	return {
		get data() {
			return data;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get restoringId() {
			return restoringId;
		},
		get isClearing() {
			return isClearing;
		},
		loadData,
		handleRestore,
		handleClearCache
	};
}
