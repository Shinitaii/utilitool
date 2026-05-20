<script lang="ts">
  import { onMount } from 'svelte';
  import { getReadings, createReadingsBatch, updateReading, softDeleteReading, ocrReadingImage } from '$lib/api/readings';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getProperties } from '$lib/api/properties';
  import type { Reading, UpdateReadingRequest } from '$lib/types/reading.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import { uploadToStorage } from '$lib/utils/firebase-storage';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';

  interface BatchReadingRow {
    property: Property;
    reading_amount: number | null;
    image_url: string | null;
    suggested_amount: number | null;
    is_processing: boolean;
    meter_reset: boolean;
  }

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

  // Batch reading form
  let batchDate = $state(new Date().toISOString().split('T')[0]);
  let batchRows = $state<BatchReadingRow[]>([]);
  let batchLoading = $state(false);

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

  function openCreateForm() {
    createFormOpen = true;
    batchRows = [];
    batchDate = new Date().toISOString().split('T')[0];
    loadBatchProperties();
  }

  async function loadBatchProperties() {
    if (!selectedMeterGroup) {
      error = 'Please select a meter group first';
      return;
    }

    batchLoading = true;
    error = '';
    try {
      const result = await getProperties({ limit: 100, meterGroupId: selectedMeterGroup });

      if (result.data.length === 0) {
        error = 'No properties found for this meter group';
        batchRows = [];
      } else {
        batchRows = result.data.map((property) => ({
          property,
          reading_amount: null,
          image_url: null,
          suggested_amount: null,
          is_processing: false,
          meter_reset: false,
        }));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load properties';
      batchRows = [];
    } finally {
      batchLoading = false;
    }
  }

  async function handleBatchImageUpload(rowIndex: number, file: File | null) {
    if (!file) return;

    const row = batchRows[rowIndex];
    row.is_processing = true;

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;

        try {
          const ocrResult = await ocrReadingImage(dataUrl);
          row.suggested_amount = ocrResult.suggested_reading_amount;
          if (ocrResult.suggested_reading_amount) {
            row.reading_amount = ocrResult.suggested_reading_amount;
          }

          const timestamp = Date.now();
          const path = `readings/${timestamp}_${file.name}`;
          const url = await uploadToStorage(file, path);
          row.image_url = url;
        } catch (err) {
          error = err instanceof Error ? err.message : 'Failed to extract reading or upload image';
        } finally {
          row.is_processing = false;
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to process image';
      row.is_processing = false;
    }
  }

  async function handleCreateBatch() {
    if (!selectedMeterGroup || !batchDate) {
      error = 'Please select a meter group and reading date';
      return;
    }

    const invalidRows = batchRows.filter((r) => r.reading_amount === null || r.reading_amount === undefined);
    if (invalidRows.length > 0) {
      error = `Please enter reading amounts for all properties (${invalidRows.length} missing)`;
      return;
    }

    batchLoading = true;
    error = '';

    try {
      const dateObj = new Date(batchDate);
      const readingsData = batchRows.map((row) => ({
        meter_group_id: selectedMeterGroup,
        reading_amount: row.reading_amount!,
        reading_date: {
          _seconds: Math.floor(dateObj.getTime() / 1000),
          _nanoseconds: 0,
        },
        image_url: row.image_url || '',
        meter_reset: row.meter_reset,
      }));

      await createReadingsBatch(readingsData);

      createFormOpen = false;
      batchRows = [];
      batchDate = new Date().toISOString().split('T')[0];
      await handleMeterGroupChange();
      alert('Readings created successfully! If a previous-month reading exists for this meter group, billings have been auto-created for each property.');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create readings';
    } finally {
      batchLoading = false;
    }
  }

  function openEditModal(item: Reading) {
    editingItem = item;
    const readingDate = toDate(item.reading_date as any).toISOString().split('T')[0];
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

  function canBatchSubmit(): boolean {
    return (
      selectedMeterGroup.length > 0 &&
      batchDate.length > 0 &&
      batchRows.length > 0 &&
      batchRows.every((r) => r.reading_amount !== null && r.reading_amount !== undefined)
    );
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
        {createFormOpen ? '✕ Cancel' : '+ New'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <!-- Batch Reading Form -->
  {#if createFormOpen}
    <div class="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 class="font-semibold">Create Readings</h2>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="batch-meter-group" class="block text-sm font-medium text-gray-700">Meter Group *</label>
          <select
            id="batch-meter-group"
            bind:value={selectedMeterGroup}
            onchange={loadBatchProperties}
            disabled={batchLoading}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select meter group...</option>
            {#each meterGroups as group (group.id)}
              <option value={group.id}>
                {group.meter_name} ({group.utility_type})
              </option>
            {/each}
          </select>
        </div>

        <div>
          <label for="batch-date" class="block text-sm font-medium text-gray-700">Reading Date (Shared) *</label>
          <input
            id="batch-date"
            type="date"
            bind:value={batchDate}
            disabled={batchLoading}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      {#if batchRows.length === 0 && selectedMeterGroup}
        <div class="rounded-lg border border-gray-200 p-6">
          <EmptyState title="No properties" message="No properties found for this meter group" />
        </div>
      {:else if batchRows.length > 0}
        <div class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
                <th class="px-6 py-3 text-left font-semibold text-gray-700">Reading Amount</th>
                <th class="px-6 py-3 text-left font-semibold text-gray-700">Meter Reset</th>
                <th class="px-6 py-3 text-left font-semibold text-gray-700">Image Upload</th>
                <th class="px-6 py-3 text-left font-semibold text-gray-700">Suggested</th>
              </tr>
            </thead>
            <tbody>
              {#each batchRows as row, i (row.property.id)}
                <tr class="border-b border-gray-200 hover:bg-gray-50">
                  <td class="px-6 py-4 font-medium text-gray-900">{row.property.room_name}</td>
                  <td class="px-6 py-4">
                    <input
                      type="number"
                      bind:value={row.reading_amount}
                      placeholder="0"
                      step="0.01"
                      min="0"
                      class="w-32 rounded border border-gray-300 px-3 py-2"
                    />
                  </td>
                  <td class="px-6 py-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        bind:checked={row.meter_reset}
                        class="h-4 w-4 rounded border-gray-300"
                      />
                      <span class="text-xs text-gray-600">Replaced</span>
                    </label>
                  </td>
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                      <label class="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onchange={(e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleBatchImageUpload(i, file);
                          }}
                          disabled={row.is_processing}
                          class="hidden"
                        />
                        <span class="rounded bg-blue-100 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-200">
                          {row.is_processing ? 'Processing...' : 'Upload'}
                        </span>
                      </label>
                      {#if row.image_url}
                        <span class="text-xs text-green-600">✓</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-gray-600">
                    {row.suggested_amount ? `${row.suggested_amount}` : '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="flex gap-2">
          <button
            onclick={handleCreateBatch}
            disabled={!canBatchSubmit() || batchLoading}
            class="rounded px-4 py-2 text-white font-medium disabled:opacity-50"
            style="background-color: var(--color-accent)"
          >
            {batchLoading ? 'Creating...' : 'Create All Readings'}
          </button>
          <button
            onclick={() => (createFormOpen = false)}
            disabled={batchLoading}
            class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      {/if}
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
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Photo</th>
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
              <td class="px-6 py-4">
                {#if item.image_url}
                  <a href={item.image_url} target="_blank" rel="noreferrer">
                    <img
                      src={item.image_url}
                      alt="Meter reading"
                      class="h-12 w-12 rounded object-cover hover:opacity-75"
                    />
                  </a>
                {:else}
                  <span class="text-gray-400">No image</span>
                {/if}
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
