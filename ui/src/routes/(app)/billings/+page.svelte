<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillingCycles } from '$lib/api/billing-cycles';
  import { getBillings } from '$lib/api/billings';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { Billing } from '$lib/types/billing.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let cycles = $state<PaginatedResult<BillingCycle>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let billings = $state<Map<string, Billing[]>>(new Map());
  let isLoading = $state(false);
  let error = $state('');
  let expandedCycleId = $state<string | null>(null);

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      cycles = await getBillingCycles({ limit: 100 });
      billings = new Map();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load billing cycles';
    } finally {
      isLoading = false;
    }
  }

  async function toggleCycleExpand(cycleId: string) {
    if (expandedCycleId === cycleId) {
      expandedCycleId = null;
      return;
    }

    expandedCycleId = cycleId;

    if (billings.has(cycleId)) {
      return;
    }

    try {
      const result = await getBillings({ limit: 100 });
      const cycle = cycles.data.find(c => c.id === cycleId);
      if (cycle) {
        const cycleByillings = result.data.filter(b => cycleId in cycle.billing_ids);
        billings.set(cycleId, cycleByillings);
        billings = billings;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load billings for cycle';
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Billings</h1>
    <p class="mt-1 text-gray-600">Billing cycles with included billings</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <div class="space-y-4">
    {#if cycles.data.length === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <EmptyState title="No billing cycles" message="Create cycles to manage billing periods" />
      </div>
    {:else}
      {#each cycles.data as cycle (cycle.id)}
        <div class="rounded-lg border border-gray-200 bg-white">
          <!-- Cycle Header Row -->
          <button
            onclick={() => toggleCycleExpand(cycle.id)}
            class="w-full px-6 py-4 text-left hover:bg-gray-50 transition"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3">
                  <div
                    class="text-gray-400 transition {expandedCycleId === cycle.id ? 'rotate-90' : ''}"
                  >
                    ▶
                  </div>
                  <div>
                    <div class="font-medium text-gray-900">
                      {formatDate(toDate(cycle.billing_start_date))} –
                      {formatDate(toDate(cycle.billing_end_date))}
                    </div>
                    <div class="text-sm text-gray-500">
                      {Object.keys(cycle.billing_ids).length} billing
                      {Object.keys(cycle.billing_ids).length === 1 ? 'record' : 'records'}
                    </div>
                  </div>
                </div>
              </div>
              <div class="ml-6 grid grid-cols-3 gap-8 text-right">
                <div>
                  <div class="text-xs font-medium text-gray-600">Consumption</div>
                  <div class="font-mono font-semibold text-gray-900">
                    {cycle.billing_consumption.toLocaleString()} kWh
                  </div>
                </div>
                <div>
                  <div class="text-xs font-medium text-gray-600">Rate</div>
                  <div class="font-mono font-semibold text-gray-900">
                    ₱{cycle.billing_rate.toFixed(2)}/kWh
                  </div>
                </div>
                <div>
                  <div class="text-xs font-medium text-gray-600">Total Amount</div>
                  <div class="font-mono font-semibold text-gray-900">
                    {formatCurrency(cycle.billing_consumption * cycle.billing_rate)}
                  </div>
                </div>
              </div>
            </div>
          </button>

          <!-- Expanded Billings Table -->
          {#if expandedCycleId === cycle.id}
            <div class="border-t border-gray-200 bg-gray-50">
              {#if billings.get(cycle.id)?.length === 0}
                <div class="px-6 py-4">
                  <EmptyState title="No billings" message="No billings in this cycle yet" />
                </div>
              {:else if billings.has(cycle.id)}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Previous Reading</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Current Reading</th>
                        <th class="px-6 py-3 text-right font-semibold text-gray-700">
                          Consumption
                        </th>
                        <th class="px-6 py-3 text-right font-semibold text-gray-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each billings.get(cycle.id) || [] as billing (billing.id)}
                        <tr class="border-b border-gray-100 hover:bg-white">
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.property_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.previous_reading_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.current_reading_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 text-right font-mono text-gray-700">
                            {(cycle.billing_ids[billing.id] ?? 0).toLocaleString()} kWh
                          </td>
                          <td class="px-6 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(
                              (cycle.billing_ids[billing.id] ?? 0) * cycle.billing_rate
                            )}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <div class="px-6 py-4 text-center text-sm text-gray-500">
                  Loading billings...
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
