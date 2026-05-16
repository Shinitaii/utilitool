<script lang="ts">
  import { onMount } from 'svelte';
  import { getReadings } from '$lib/api/readings';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import type { Reading } from '$lib/types/reading.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let readings = $state<PaginatedResult<Reading>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let meterGroups = $state<MeterGroup[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let selectedMeterGroup = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const result = await getMeterGroups({ limit: 100 });
      meterGroups = result.data;

      if (selectedMeterGroup) {
        readings = await getReadings({ meterGroupId: selectedMeterGroup, limit: 20 });
      } else if (meterGroups.length > 0) {
        selectedMeterGroup = meterGroups[0].id;
        readings = await getReadings({ meterGroupId: meterGroups[0].id, limit: 20 });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load readings';
    } finally {
      isLoading = false;
    }
  }

  async function handleMeterGroupChange() {
    if (selectedMeterGroup) {
      isLoading = true;
      try {
        readings = await getReadings({ meterGroupId: selectedMeterGroup, limit: 20 });
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to load readings';
      } finally {
        isLoading = false;
      }
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Meter Readings</h1>
    <p class="mt-1 text-gray-600">{readings.data.length} readings</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <label for="meter-filter" class="block text-sm font-medium text-gray-700">Filter by Meter Group</label>
    <select
      id="meter-filter"
      bind:value={selectedMeterGroup}
      onchange={handleMeterGroupChange}
      class="mt-2 block w-full rounded border border-gray-300 px-3 py-2 md:w-80"
      disabled={isLoading}
    >
      {#each meterGroups as group (group.id)}
        <option value={group.id}>
          {group.meter_name} ({group.utility_type})
        </option>
      {/each}
    </select>
  </div>

  <div class="overflow-x-auto rounded-lg border border-gray-200">
    {#if readings.data.length === 0}
      <div class="p-6">
        <EmptyState title="No readings" message="Create readings to track meter consumption" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Meter Group</th>
            <th class="px-6 py-3 text-right font-semibold text-gray-700">Reading (kWh)</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
          </tr>
        </thead>
        <tbody>
          {#each readings.data as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-6 py-4">
                {meterGroups.find((g) => g.id === item.meter_group_id)?.meter_name || 'Unknown'}
              </td>
              <td class="px-6 py-4 text-right font-mono text-gray-700">
                {item.reading_amount.toLocaleString()}
              </td>
              <td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.reading_date))}</td>
              <td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.created_at))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
