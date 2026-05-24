import { getMeterGroups } from '$lib/api/meter-groups';
import type { MeterGroup } from '$lib/types/meter-group.types';

let _data = $state<MeterGroup[]>([]);
let _lastFetched = $state<number | null>(null);
let _isLoading = $state(false);
const STALE_MS = 5 * 60 * 1000; // 5 minutes

export const meterGroupsStore = {
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
      const result = await getMeterGroups({ limit: 1000 });
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
