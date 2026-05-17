<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillingCycles } from '$lib/api/billing-cycles';
  import { getBillings, createBilling, updateBilling, softDeleteBilling } from '$lib/api/billings';
  import { getReadings } from '$lib/api/readings';
  import { getProperties } from '$lib/api/properties';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { Billing, CreateBillingRequest, UpdateBillingRequest } from '$lib/types/billing.types';
  import type { Reading } from '$lib/types/reading.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';

  let cycles = $state<PaginatedResult<BillingCycle>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let billings = $state<Map<string, Billing[]>>(new Map());
  let allBillings = $state<Billing[]>([]);
  let readings = $state<Reading[]>([]);
  let properties = $state<Property[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let expandedCycleId = $state<string | null>(null);

  let createFormOpen = $state(false);
  let editModalOpen = $state(false);
  let editingBilling = $state<Billing | null>(null);

  let createFormData = $state<CreateBillingRequest>({
    property_id: '',
    previous_reading_id: '',
    current_reading_id: ''
  });

  let editFormData = $state<UpdateBillingRequest>({
    property_id: '',
    previous_reading_id: '',
    current_reading_id: ''
  });

  let editingBillingId = $state<string | null>(null);
  let deletingBillingId = $state<string | null>(null);

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const [cyclesResult, billingsResult, readingsResult, propertiesResult] = await Promise.all([
        getBillingCycles({ limit: 100 }),
        getBillings({ limit: 100 }),
        getReadings({ limit: 100 }),
        getProperties({ limit: 100 })
      ]);
      cycles = cyclesResult;
      allBillings = billingsResult.data;
      readings = readingsResult.data;
      properties = propertiesResult.data;
      billings = new Map();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
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

    const cycle = cycles.data.find(c => c.id === cycleId);
    if (cycle) {
      const cycleBillings = allBillings.filter(b => cycleId in cycle.billing_ids);
      billings.set(cycleId, cycleBillings);
      billings = billings;
    }
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    try {
      await createBilling(createFormData);
      createFormOpen = false;
      createFormData = {
        property_id: '',
        previous_reading_id: '',
        current_reading_id: ''
      };
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create billing';
    }
  }

  function openEditModal(billing: Billing) {
    editingBilling = billing;
    editFormData = {
      property_id: billing.property_id,
      previous_reading_id: billing.previous_reading_id,
      current_reading_id: billing.current_reading_id
    };
    editModalOpen = true;
  }

  async function handleUpdate() {
    if (!editingBilling) return;
    editingBillingId = editingBilling.id;
    try {
      await updateBilling(editingBilling.id, editFormData);
      editModalOpen = false;
      editingBilling = null;
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update billing';
    } finally {
      editingBillingId = null;
    }
  }

  async function handleSoftDelete(id: string) {
    if (confirm('Archive this billing? It can be restored from the archive.')) {
      deletingBillingId = id;
      try {
        await softDeleteBilling(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive billing';
      } finally {
        deletingBillingId = null;
      }
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold">Billings</h1>
      <p class="mt-1 text-gray-600">Billing cycles with included billings</p>
    </div>
    <div class="flex gap-3">
      <a
        href="/billings/archive"
        class="rounded px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
      >
        Archive
      </a>
      <button
        onclick={() => (createFormOpen = !createFormOpen)}
        class="rounded px-4 py-2 text-white font-medium"
        style="background-color: var(--color-accent)"
      >
        + New
      </button>
    </div>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if createFormOpen}
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <h2 class="font-semibold">New Billing</h2>
      <form onsubmit={handleCreate} class="mt-4 space-y-4">
        <div>
          <label for="property-id" class="block text-sm font-medium text-gray-700">Property</label>
          <select
            id="property-id"
            bind:value={createFormData.property_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a property</option>
            {#each properties as prop (prop.id)}
              <option value={prop.id}>{prop.room_name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="previous-reading" class="block text-sm font-medium text-gray-700">Previous Reading</label>
          <select
            id="previous-reading"
            bind:value={createFormData.previous_reading_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select previous reading</option>
            {#each readings as reading (reading.id)}
              <option value={reading.id}>
                {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
              </option>
            {/each}
          </select>
        </div>
        <div>
          <label for="current-reading" class="block text-sm font-medium text-gray-700">Current Reading</label>
          <select
            id="current-reading"
            bind:value={createFormData.current_reading_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select current reading</option>
            {#each readings as reading (reading.id)}
              <option value={reading.id}>
                {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
              </option>
            {/each}
          </select>
        </div>
        <div class="flex space-x-2">
          <button
            type="submit"
            class="rounded px-4 py-2 text-white font-medium"
            style="background-color: var(--color-accent)"
          >
            Create
          </button>
          <button
            type="button"
            onclick={() => (createFormOpen = false)}
            class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
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
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
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
                          <td class="px-6 py-3">
                            <div class="flex gap-2">
                              <button
                                onclick={() => openEditModal(billing)}
                                disabled={isLoading || editingBillingId === billing.id}
                                class="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-sm disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                onclick={() => handleSoftDelete(billing.id)}
                                disabled={isLoading || deletingBillingId === billing.id}
                                class="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium text-sm disabled:opacity-50"
                              >
                                {deletingBillingId === billing.id ? 'Archiving...' : 'Archive'}
                              </button>
                            </div>
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

<!-- Edit Modal -->
<EditModal
  bind:isOpen={editModalOpen}
  title="Edit Billing"
  isLoading={editingBillingId === editingBilling?.id}
  onClose={() => {
    editModalOpen = false;
    editingBilling = null;
  }}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-property" class="block text-sm font-medium text-gray-700">Property</label>
      <select
        id="edit-property"
        bind:value={editFormData.property_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each properties as prop (prop.id)}
          <option value={prop.id}>{prop.room_name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-previous-reading" class="block text-sm font-medium text-gray-700">Previous Reading</label>
      <select
        id="edit-previous-reading"
        bind:value={editFormData.previous_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each readings as reading (reading.id)}
          <option value={reading.id}>
            {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-current-reading" class="block text-sm font-medium text-gray-700">Current Reading</label>
      <select
        id="edit-current-reading"
        bind:value={editFormData.current_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each readings as reading (reading.id)}
          <option value={reading.id}>
            {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
  </div>
</EditModal>
