interface PaginatedResult<T> {
	data: T[];
	hasMore?: boolean;
	nextCursor?: string | null;
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 100;

/** Shared cache-with-staleness pattern behind meterGroupsStore/propertiesStore/tenantsStore. */
export function createListStore<T>(
	fetchFn: (params: { limit: number; cursor?: string }) => Promise<PaginatedResult<T>>
) {
	let _data = $state<T[]>([]);
	let _lastFetched = $state<number | null>(null);
	let _isLoading = $state(false);

	return {
		get data() {
			return _data;
		},
		get isLoading() {
			return _isLoading;
		},
		get isStale() {
			return _lastFetched === null || Date.now() - _lastFetched > STALE_MS;
		},

		async fetch(force = false) {
			if (!force && !this.isStale && _data.length > 0) {
				return _data;
			}

			if (_isLoading) {
				return _data;
			}

			_isLoading = true;
			try {
				// Page through with cursors at a uniform limit instead of one oversized request,
				// matching the pattern used everywhere else. Consumers still get the full list in
				// _data — these collections are small, so assembling all pages is cheap.
				const all: T[] = [];
				let cursor: string | undefined;
				do {
					const result = await fetchFn({ limit: PAGE_SIZE, cursor });
					all.push(...result.data);
					cursor = result.hasMore ? (result.nextCursor ?? undefined) : undefined;
				} while (cursor);
				_data = all;
				_lastFetched = Date.now();
				return _data;
			} finally {
				_isLoading = false;
			}
		},

		invalidate() {
			_lastFetched = null;
		},

		async refresh() {
			return this.fetch(true);
		}
	};
}
