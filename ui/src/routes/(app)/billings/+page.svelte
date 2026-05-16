<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillings } from '$lib/api/billings';
  import type { Billing } from '$lib/types/billing.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let data = $state<PaginatedResult<Billing>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      data = await getBillings({ limit: 50 });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load billings';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Billings</h1>
    <p class="mt-1 text-gray-600">{data.data.length} total</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <div class="overflow-x-auto rounded-lg border border-gray-200">
    {#if data.data.length === 0}
      <div class="p-6">
        <EmptyState title="No billings" message="Create billings to track property charges" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Property ID</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Previous Reading</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Current Reading</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
          </tr>
        </thead>
        <tbody>
          {#each data.data as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-6 py-4 font-mono text-xs text-gray-600">{item.property_id.slice(0, 8)}</td>
              <td class="px-6 py-4 font-mono text-xs text-gray-600">{item.previous_reading_id.slice(0, 8)}</td>
              <td class="px-6 py-4 font-mono text-xs text-gray-600">{item.current_reading_id.slice(0, 8)}</td>
              <td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.created_at))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
