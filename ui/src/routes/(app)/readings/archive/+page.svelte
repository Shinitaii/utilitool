<script lang="ts">
  import { onMount } from 'svelte';
  import { getReadings, restoreReading, clearCache } from '$lib/api/readings';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import type { Reading } from '$lib/types/reading.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
  import { Trash2 } from 'lucide-svelte';

  let data = $state<PaginatedResult<Reading>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let meterGroups = $state<Map<string, string>>(new Map());
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let isClearing = $state(false);

  const columns = [
    {
      key: 'meter_group_id',
      label: 'Meter Group',
      format: (v: string) => meterGroups.get(v) || 'Unknown'
    },
    {
      key: 'reading_amount',
      label: 'Reading (kWh)',
      format: (v: number) => v.toLocaleString()
    },
    {
      key: 'reading_date',
      label: 'Reading Date',
      format: (v: any) => formatDate(toDate(v))
    }
  ];

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const [readingsResult, meterGroupsResult] = await Promise.all([
        getReadings({ limit: 100, archived: true }),
        getMeterGroups({ limit: 100 })
      ]);

      // Build meter group name map
      meterGroups = new Map(
        meterGroupsResult.data.map((mg: MeterGroup) => [mg.id, mg.meter_name])
      );

      data = readingsResult;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived readings';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await restoreReading(id);
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore reading';
    } finally {
      restoringId = null;
    }
  }

  async function handleClearCache() {
    isClearing = true;
    try {
      const result = await clearCache();
      error = result.message;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to clear cache';
    } finally {
      isClearing = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex justify-end">
    <button
      onclick={handleClearCache}
      disabled={isClearing}
      class="flex items-center gap-2 px-3 py-2 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 font-medium text-sm"
    >
      <Trash2 size={16} />
      {isClearing ? 'Clearing...' : 'Clear Cache'}
    </button>
  </div>

  <ArchivePageTemplate
    title="Readings"
    isEmpty={data.data.length === 0}
    isLoading={isLoading}
    error={error}
    items={data.data}
    columns={columns}
    onRestore={handleRestore}
    restoringId={restoringId}
  />
</div>
