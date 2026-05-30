<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties } from '$lib/api/properties';
  import { getTenants } from '$lib/api/tenants';
  import { getBillings } from '$lib/api/billings';
  import { getBillingCycles } from '$lib/api/billing-cycles';
  import { formatCurrency } from '$lib/utils/format';
  import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { Billing } from '$lib/types/billing.types';

  let isLoading = $state(true);
  let error = $state('');

  let propertyCount = $state(0);
  let tenantCount = $state(0);
  let totalBilled = $state(0);
  let totalCollected = $state(0);
  let totalOutstanding = $state(0);
  let recentCycles = $state<BillingCycle[]>([]);

  onMount(async () => {
    try {
      const [propertiesResult, tenantsResult, billingCyclesResult, billingsResult] = await Promise.all([
        getProperties({ limit: 100 }),
        getTenants({ limit: 100 }),
        getBillingCycles({ limit: 50 }),
        getBillings({ limit: 100 }),
      ]);

      propertyCount = propertiesResult.data.length;
      tenantCount = tenantsResult.data.length;
      recentCycles = billingCyclesResult.data;

      // Aggregate billing totals from current page
      const allBillings: Billing[] = billingsResult.data;
      allBillings.forEach(b => {
        // We don't have amounts on billings directly — sum via billing cycle rates
        // For now we track paid vs pending counts
      });

      // Calculate totals from billing cycles
      recentCycles.forEach(cycle => {
        const cycleTotal = Object.values(cycle.billing_ids).reduce((sum, consumption) => {
          return sum + consumption * cycle.billing_rate;
        }, 0);
        totalBilled += cycleTotal;
      });

      // Calculate collected from paid billings
      const paidBillings = allBillings.filter(b => b.payment_status === 'paid');
      const pendingBillings = allBillings.filter(b => b.payment_status === 'pending');

      // For each paid billing, find its cycle to compute amount
      const cycleMap = new Map(recentCycles.map(c => [c.id, c]));
      paidBillings.forEach(b => {
        // Find which cycle this billing belongs to
        for (const cycle of recentCycles) {
          const consumption = cycle.billing_ids[b.id];
          if (consumption !== undefined) {
            totalCollected += consumption * cycle.billing_rate;
            break;
          }
        }
      });
      pendingBillings.forEach(b => {
        for (const cycle of recentCycles) {
          const consumption = cycle.billing_ids[b.id];
          if (consumption !== undefined) {
            totalOutstanding += consumption * cycle.billing_rate;
            break;
          }
        }
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
            <th scope="col" class="pb-2 font-medium">Cycle ID</th>
            <th scope="col" class="pb-2 font-medium">Rate</th>
            <th scope="col" class="pb-2 font-medium">Consumption</th>
            <th scope="col" class="pb-2 font-medium">Billings</th>
          </tr>
        </thead>
        <tbody>
          {#each recentCycles as cycle}
            <tr class="border-b border-gray-50">
              <td class="py-2 font-mono text-xs text-gray-400">{cycle.id.slice(0, 8)}…</td>
              <td class="py-2">₱{cycle.billing_rate.toFixed(2)}/kWh</td>
              <td class="py-2">{cycle.billing_consumption.toLocaleString()} kWh</td>
              <td class="py-2">{Object.keys(cycle.billing_ids).length}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
