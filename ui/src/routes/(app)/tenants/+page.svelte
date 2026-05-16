<script lang="ts">
  import { onMount } from 'svelte';
  import { getTenants } from '$lib/api/tenants';
  import type { Tenant } from '$lib/types/tenant.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let data = $state<PaginatedResult<Tenant>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');
  let searchTerm = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      data = await getTenants({ limit: 50 });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tenants';
    } finally {
      isLoading = false;
    }
  }

  function getFilteredData() {
    return data.data.filter(
      (t) =>
        t.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.property_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  const filteredData = getFilteredData();
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">All Tenants</h1>
    <p class="mt-1 text-gray-600">{data.data.length} total</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <input
      type="text"
      bind:value={searchTerm}
      placeholder="Search tenants..."
      class="w-full rounded border border-gray-300 px-3 py-2"
    />
  </div>

  <div class="overflow-x-auto rounded-lg border border-gray-200">
    {#if filteredData.length === 0}
      <div class="p-6">
        <EmptyState title="No tenants found" message="Create tenants to get started" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Tenant Name</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Property ID</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Start Date</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredData as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-6 py-4 font-medium">{item.tenant_name}</td>
              <td class="px-6 py-4 font-mono text-xs text-gray-600">{item.property_id.slice(0, 8)}</td>
              <td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.tenant_start_date))}</td>
              <td class="px-6 py-4">
                {#if item.tenant_end_date}
                  <span class="rounded bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                    Moving Out
                  </span>
                {:else}
                  <span class="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    Current
                  </span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
