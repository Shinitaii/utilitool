interface PaginatedResult<T> {
	data: T[];
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

/** Shared cache-with-staleness pattern behind meterGroupsStore/propertiesStore/tenantsStore. */
export function createListStore<T>(
	fetchFn: (params: { limit: number }) => Promise<PaginatedResult<T>>
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
				const result = await fetchFn({ limit: 1000 });
				_data = result.data;
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
