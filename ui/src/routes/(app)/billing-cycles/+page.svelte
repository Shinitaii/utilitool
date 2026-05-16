<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillingCycles } from '$lib/api/billing-cycles';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let data = $state<PaginatedResult<BillingCycle>>({
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
      data = await getBillingCycles({ limit: 50 });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load billing cycles';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Billing Cycles</h1>
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
        <EmptyState title="No billing cycles" message="Create cycles to manage billing periods" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Period</th>
            <th class="px-6 py-3 text-right font-semibold text-gray-700">Consumption (kWh)</th>
            <th class="px-6 py-3 text-right font-semibold text-gray-700">Rate (₱/kWh)</th>
            <th class="px-6 py-3 text-right font-semibold text-gray-700">Total Amount</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Billings</th>
          </tr>
        </thead>
        <tbody>
          {#each data.data as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-6 py-4 text-gray-700">
                {formatDate(toDate(item.billing_start_date))} –
                {formatDate(toDate(item.billing_end_date))}
              </td>
              <td class="px-6 py-4 text-right font-mono text-gray-700">
                {item.billing_consumption.toLocaleString()}
              </td>
              <td class="px-6 py-4 text-right font-mono text-gray-700">
                {item.billing_rate.toFixed(2)}
              </td>
              <td class="px-6 py-4 text-right font-semibold text-gray-900">
                {formatCurrency(item.billing_consumption * item.billing_rate)}
              </td>
              <td class="px-6 py-4 text-gray-600">
                {Object.keys(item.billing_ids).length}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
