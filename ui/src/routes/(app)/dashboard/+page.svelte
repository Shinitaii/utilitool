<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties } from '$lib/api/properties';
  import { getTenants } from '$lib/api/tenants';
  import { getBillings } from '$lib/api/billings';
  import { getBillingCycles } from '$lib/api/billing-cycles';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { formatCurrency, formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import { getCyclePaidAmount, getCycleOutstandingAmount } from '$lib/utils/billing-cycle.util';
  import { getUtilityTypeBadgeClasses } from '$lib/utils/utility-colors';
  import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { Billing } from '$lib/types/billing.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';

  let isLoading = $state(true);
  let error = $state('');

  let propertyCount = $state(0);
  let tenantCount = $state(0);
  let totalBilled = $state(0);
  let totalCollected = $state(0);
  let totalOutstanding = $state(0);
  let recentCycles = $state<BillingCycle[]>([]);
  let meterGroups = $state<MeterGroup[]>([]);
  let billingMap = $state<Map<string, Billing>>(new Map());

  onMount(async () => {
    try {
      const [propertiesResult, tenantsResult, billingCyclesResult, billingsResult, meterGroupsResult] = await Promise.all([
        getProperties({ limit: 100 }),
        getTenants({ limit: 100 }),
        getBillingCycles({ limit: 50 }),
        getBillings({ limit: 100 }),
        getMeterGroups({ limit: 100 }),
      ]);

      propertyCount = propertiesResult.data.length;
      tenantCount = tenantsResult.data.length;
      recentCycles = billingCyclesResult.data;
      meterGroups = meterGroupsResult.data;

      // Build billing map for lookup
      const allBillings: Billing[] = billingsResult.data;
      billingMap = new Map(allBillings.map(b => [b.id, b]));

      // Calculate global totals and per-cycle amounts
      recentCycles.forEach(cycle => {
        const cycleTotal = Object.values(cycle.billing_ids).reduce((sum, consumption) => {
          return sum + consumption * cycle.billing_rate;
        }, 0);
        totalBilled += cycleTotal;
        totalCollected += getCyclePaidAmount(cycle, billingMap);
        totalOutstanding += getCycleOutstandingAmount(cycle, billingMap);
      });

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load dashboard data';
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Welcome back</h1>
    <p class="mt-2 text-gray-600">Dashboard · Property Utility Management</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
  {/if}

  {#if isLoading}
    <div class="grid grid-cols-4 gap-4">
      {#each [1,2,3,4] as _}
        <div class="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-24 mb-3"></div>
          <div class="h-8 bg-gray-200 rounded w-20 mb-2"></div>
          <div class="h-3 bg-gray-200 rounded w-16"></div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-4 gap-4">
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">This Month Billed</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(totalBilled)}</p>
        <p class="mt-1 text-xs text-gray-500">From recent cycles</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">Collected</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(totalCollected)}</p>
        <p class="mt-1 text-xs text-gray-500">
          {totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0}%
        </p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6" style="background-color: var(--color-status-unpaid-bg)">
        <p class="text-sm font-medium text-gray-600">Outstanding</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(totalOutstanding)}</p>
        <p class="mt-1 text-xs text-gray-500">Pending payments</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">Properties</p>
        <p class="mt-2 text-3xl font-bold">{propertyCount}</p>
        <p class="mt-1 text-xs text-gray-500">{tenantCount} tenant(s)</p>
      </div>
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-6">
    <h2 class="font-semibold">Recent Billing Cycles</h2>
    {#if isLoading}
      <TableSkeleton rows={4} cols={4} />
    {:else if recentCycles.length === 0}
      <p class="mt-4 text-sm text-gray-600">No billing cycles yet. Create one from the Billings page.</p>
    {:else}
      <table class="mt-4 w-full text-sm">
        <caption class="sr-only">Recent billing cycles</caption>
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-100">
            <th scope="col" class="pb-2 font-medium">Period</th>
            <th scope="col" class="pb-2 font-medium">Meter Group</th>
            <th scope="col" class="pb-2 font-medium">Consumption</th>
            <th scope="col" class="pb-2 font-medium text-right">Paid</th>
            <th scope="col" class="pb-2 font-medium text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {#each recentCycles as cycle}
            {@const meterGroup = meterGroups.find(m => m.id === cycle.meter_group_id)}
            <tr class="border-b border-gray-50">
              <td class="py-2 text-gray-700">
                {formatDate(toDate(cycle.billing_start_date))} – {formatDate(toDate(cycle.billing_end_date))}
              </td>
              <td class="py-2">
                <div class="flex items-center gap-2">
                  <span>{meterGroup?.meter_name ?? 'Unknown'}</span>
                  {#if meterGroup?.utility_type}
                    <span class="rounded {getUtilityTypeBadgeClasses(meterGroup.utility_type)} px-2 py-0.5 text-xs font-medium capitalize">{meterGroup.utility_type}</span>
                  {/if}
                </div>
              </td>
              <td class="py-2">{cycle.billing_consumption.toLocaleString()}</td>
              <td class="py-2 text-right font-semibold text-green-700">{formatCurrency(getCyclePaidAmount(cycle, billingMap))}</td>
              <td class="py-2 text-right font-semibold text-amber-700">{formatCurrency(getCycleOutstandingAmount(cycle, billingMap))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
