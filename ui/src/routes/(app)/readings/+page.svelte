<script lang="ts">
  import { onMount } from 'svelte';
  import { getReadings, createReading, updateReading, softDeleteReading } from '$lib/api/readings';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import type { Reading, CreateReadingRequest, UpdateReadingRequest } from '$lib/types/reading.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';

  let readings = $state<PaginatedResult<Reading>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let meterGroups = $state<MeterGroup[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let selectedMeterGroup = $state('');

  let createFormOpen = $state(false);
  let editModalOpen = $state(false);
  let editingItem = $state<Reading | null>(null);

  let createFormData = $state({
    meter_group_id: '',
    reading_amount: 0,
    reading_date: new Date().toISOString().split('T')[0]
  });

  let editFormData = $state<{
    reading_amount: number;
    reading_date: string;
  }>({
    reading_amount: 0,
    reading_date: ''
  });

  let editingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

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
        readings = await getReadings({ meterGroupId: selectedMeterGroup, limit: 100 });
      } else if (meterGroups.length > 0) {
        selectedMeterGroup = meterGroups[0].id;
        readings = await getReadings({ meterGroupId: meterGroups[0].id, limit: 100 });
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
        readings = await getReadings({ meterGroupId: selectedMeterGroup, limit: 100 });
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to load readings';
      } finally {
        isLoading = false;
      }
    }
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    try {
      await createReading(createFormData);
      createFormOpen = false;
      createFormData = {
        meter_group_id: selectedMeterGroup,
        reading_amount: 0,
        reading_date: new Date().toISOString().split('T')[0]
      };
      await handleMeterGroupChange();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create reading';
    }
  }

  function openEditModal(item: Reading) {
    editingItem = item;
    const dateValue = item.reading_date as any;
    let readingDate = '';
    if (typeof dateValue === 'string') {
      readingDate = dateValue.split('T')[0];
    } else {
      readingDate = toDate(dateValue).toISOString().split('T')[0];
    }
    editFormData = {
      reading_amount: item.reading_amount,
      reading_date: readingDate
    };
    editModalOpen = true;
  }

  async function handleUpdate() {
    if (!editingItem) return;
    editingId = editingItem.id;
    try {
      await updateReading(editingItem.id, editFormData);
      editModalOpen = false;
      editingItem = null;
      await handleMeterGroupChange();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update reading';
    } finally {
      editingId = null;
    }
  }

  async function handleSoftDelete(id: string) {
    if (confirm('Archive this reading? It can be restored from the archive.')) {
      deletingId = id;
      try {
        await softDeleteReading(id);
        await handleMeterGroupChange();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive reading';
      } finally {
        deletingId = null;
      }
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold">Meter Readings</h1>
      <p class="mt-1 text-gray-600">{readings.data.length} readings</p>
    </div>
    <div class="flex gap-3">
      <a
        href="/readings/archive"
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
      <h2 class="font-semibold">New Reading</h2>
      <form onsubmit={handleCreate} class="mt-4 space-y-4">
        <div>
          <label for="meter-group" class="block text-sm font-medium text-gray-700">Meter Group</label>
          <select
            id="meter-group"
            bind:value={createFormData.meter_group_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a meter group</option>
            {#each meterGroups as group (group.id)}
              <option value={group.id}>
                {group.meter_name} ({group.utility_type})
              </option>
            {/each}
          </select>
        </div>
        <div>
          <label for="reading-amount" class="block text-sm font-medium text-gray-700">Reading Amount</label>
          <input
            id="reading-amount"
            type="number"
            bind:value={createFormData.reading_amount}
            required
            step="0.01"
            min="0"
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            placeholder="e.g., 1234.56"
          />
        </div>
        <div>
          <label for="reading-date" class="block text-sm font-medium text-gray-700">Reading Date</label>
          <input
            id="reading-date"
            type="date"
            bind:value={createFormData.reading_date}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
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
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
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
              <td class="px-6 py-4">
                <ActionButtons
                  onEdit={() => openEditModal(item)}
                  onSoftDelete={() => handleSoftDelete(item.id)}
                  isLoading={deletingId === item.id}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Edit Modal -->
<EditModal
  bind:isOpen={editModalOpen}
  title="Edit Reading"
  isLoading={editingId === editingItem?.id}
  onClose={() => {
    editModalOpen = false;
    editingItem = null;
  }}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-reading-amount" class="block text-sm font-medium text-gray-700">Reading Amount</label>
      <input
        id="edit-reading-amount"
        type="number"
        bind:value={editFormData.reading_amount}
        step="0.01"
        min="0"
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-reading-date" class="block text-sm font-medium text-gray-700">Reading Date</label>
      <input
        id="edit-reading-date"
        type="date"
        bind:value={editFormData.reading_date}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
  </div>
</EditModal>
