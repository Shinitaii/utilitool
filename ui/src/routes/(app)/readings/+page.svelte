<script lang="ts">
  import { onMount } from 'svelte';
  import { getReadings, createReadingsBatch, updateReading, softDeleteReading, ocrReadingImage } from '$lib/api/readings';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getProperties } from '$lib/api/properties';
  import type { Reading, UpdateReadingRequest } from '$lib/types/reading.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatReading, getReadingUnit } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import { uploadToStorage } from '$lib/utils/firebase-storage';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';
  import { Archive, Plus, X } from 'lucide-svelte';

  interface BatchReadingRow {
    property: Property;
    meter_group_id: string;
    reading_amount: number | null;
    image_url: string | null;
    data_url: string | null;
    suggested_amount: number | null;
    is_processing: boolean;
    is_uploading: boolean;
  }

  let readings = $state<PaginatedResult<Reading>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let meterGroups = $state<MeterGroup[]>([]);
  let properties = $state<Property[]>([]);
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

  // Image preview modal
  let previewImageUrl = $state<string | null>(null);
  let previewZoom = $state(1);
  let previewRotation = $state(0);
  let previewDragX = $state(0);
  let previewDragY = $state(0);
  let previewIsDragging = $state(false);
  let previewDragStart = $state({ x: 0, y: 0 });

  let editFormData = $state<{
    reading_amount: number;
    reading_date: string;
  }>({
    reading_amount: 0,
    reading_date: ''
  });

  let editingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let selectedIds = $state<Set<string>>(new Set());
  let isBatchDeleting = $state(false);

  function getCumulativeOffset(meterGroup: MeterGroup | undefined, version: number): number {
    if (!meterGroup?.versions) return 0;
    let offset = 0;
    for (let v = 1; v < version; v++) {
      const versionData = meterGroup.versions[String(v)];
      if (versionData) offset += versionData.last_reading;
    }
    return offset;
  }

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const [meterGroupsResult, propertiesResult] = await Promise.all([
        getMeterGroups({ limit: 100 }),
        getProperties({ limit: 100 })
      ]);
      meterGroups = meterGroupsResult.data;
      properties = propertiesResult.data;

      if (selectedMeterGroup) {
        readings = await getReadings({ meterGroupId: selectedMeterGroup, limit: 100 });
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
          meter_group_id: selectedMeterGroup,
          reading_amount: null,
          image_url: null,
          data_url: null,
          suggested_amount: null,
          is_processing: false,
          is_uploading: false,
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

    row.is_uploading = true;
    try {
      // Read file to data URL (needed for OCR via Suggest button)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      // Show preview and enable Suggest immediately — don't wait for Storage
      row.data_url = dataUrl;
      row.image_url = dataUrl;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to process image';
    } finally {
      row.is_uploading = false;
    }

    // Silently upgrade to a persistent Storage URL in the background
    if (row.data_url) {
      uploadToStorage(file, `readings/${Date.now()}_${file.name}`)
        .then((url) => { row.image_url = url; })
        .catch(() => { /* keep data URL */ });
    }
  }

  async function handleBatchSuggest(rowIndex: number) {
    const row = batchRows[rowIndex];
    if (!row.data_url) return;

    row.is_processing = true;
    try {
      error = '';
      const ocrResult = await ocrReadingImage(row.data_url);
      row.suggested_amount = ocrResult.suggested_reading_amount ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to extract reading from image';
    } finally {
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
        meter_group_id: row.meter_group_id,
        property_id: row.property.id,
        reading_amount: row.reading_amount!,
        reading_date: {
          _seconds: Math.floor(dateObj.getTime() / 1000),
          _nanoseconds: 0,
        },
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

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Archive ${selectedIds.size} reading(s)? They can be restored from the archive.`)) return;

    isBatchDeleting = true;
    try {
      await Promise.all(Array.from(selectedIds).map(id => softDeleteReading(id)));
      selectedIds.clear();
      await handleMeterGroupChange();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to archive readings';
    } finally {
      isBatchDeleting = false;
    }
  }

  function toggleSelection(id: string) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = selectedIds;
  }

  function toggleSelectAll() {
    if (selectedIds.size === readings.data.length) {
      selectedIds.clear();
    } else {
      selectedIds = new Set(readings.data.map(item => item.id));
    }
    selectedIds = selectedIds;
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
        class="p-2 rounded hover:bg-gray-100 text-gray-700"
        title="View archive"
        aria-label="View readings archive"
      >
        <Archive size={20} />
      </a>
      <button
        onclick={() => (createFormOpen = !createFormOpen)}
        class="p-2 rounded text-white"
        style="background-color: var(--color-accent)"
        title={createFormOpen ? 'Cancel' : 'Create new reading'}
        aria-label={createFormOpen ? 'Cancel new reading' : 'Create new reading'}
      >
        {#if createFormOpen}
          <X size={20} />
        {:else}
          <Plus size={20} />
        {/if}
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
            <option value="">Select meter option</option>
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
                <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
                <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Reading Amount</th>
                <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Photo / Suggest</th>
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
                    {#if row.reading_amount !== null}
                      {@const selectedMg = meterGroups.find((g) => g.id === selectedMeterGroup)}
                      <!-- offset assumes new readings will be assigned current_version -->
                      {@const offset = getCumulativeOffset(selectedMg, selectedMg?.current_version ?? 1)}
                      {@const unit = getReadingUnit(selectedMg?.utility_type || 'electricity')}
                      <p class="mt-1 text-xs text-gray-400">
                        True total: {(offset + row.reading_amount).toLocaleString()} {unit}
                      </p>
                    {/if}
                  </td>
                  <td class="px-6 py-4">
                    <div class="grid grid-cols-3 gap-3">
                      <!-- Preview image (top, spanning all 3 cols) -->
                      <div class="col-span-3 h-48 w-full overflow-hidden rounded">
                        {#if row.image_url}
                          <button
                            type="button"
                            onclick={() => {
                              previewImageUrl = row.image_url;
                              previewZoom = 1;
                              previewRotation = 0;
                              previewDragX = 0;
                              previewDragY = 0;
                            }}
                            class="block h-full w-full cursor-pointer rounded transition hover:opacity-75"
                          >
                            <img
                              src={row.image_url}
                              alt="Meter reading"
                              class="h-full w-full rounded object-cover"
                            />
                          </button>
                        {:else}
                          <div class="h-full w-full rounded border-2 border-dashed border-gray-300 bg-gray-50"></div>
                        {/if}
                      </div>

                      <!-- Upload button (bottom left) -->
                      <label class={row.is_uploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={row.is_uploading}
                          onchange={(e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleBatchImageUpload(i, file);
                          }}
                          class="hidden"
                        />
                        <span class="block rounded bg-blue-100 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50 text-center">
                          {row.is_uploading ? 'Uploading...' : 'Upload'}
                        </span>
                      </label>

                      <!-- Suggest button (bottom center) -->
                      <button
                        type="button"
                        onclick={() => handleBatchSuggest(i)}
                        disabled={!row.data_url || row.is_processing}
                        class="rounded bg-blue-100 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed text-center"
                      >
                        {row.is_processing ? 'Suggesting...' : 'Suggest'}
                      </button>

                      <!-- Suggested text (bottom right) -->
                      <span class="text-xs text-gray-600 text-center self-center">
                        {#if row.suggested_amount !== null}
                          Suggested: {row.suggested_amount.toLocaleString()}
                        {:else}
                          &mdash;
                        {/if}
                      </span>
                    </div>
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
      <option value="">Select meter option</option>
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
      <div class="space-y-3 mb-4">
        {#if selectedIds.size > 0}
          <div class="flex items-center justify-between rounded-lg bg-blue-50 p-3 border border-blue-200">
            <span class="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
            <button
              onclick={handleBatchDelete}
              disabled={isBatchDeleting}
              class="px-3 py-1.5 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isBatchDeleting ? 'Archiving...' : 'Archive Selected'}
            </button>
          </div>
        {/if}
      </div>
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th scope="col" class="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={selectedIds.size === readings.data.length && readings.data.length > 0}
                onchange={toggleSelectAll}
                class="rounded"
              />
            </th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Meter Group</th>
            <th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">Reading</th>
            <th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">True Total</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Photo</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each readings.data as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-4 py-4 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onchange={() => toggleSelection(item.id)}
                  class="rounded"
                />
              </td>
              <td class="px-6 py-4 font-medium text-gray-900">
                {properties.find((p) => p.id === item.property_id)?.room_name || 'Unknown'}
              </td>
              <td class="px-6 py-4">
                {meterGroups.find((g) => g.id === item.meter_group_id)?.meter_name || 'Unknown'}
              </td>
              <td class="px-6 py-4 text-right font-mono text-gray-700">
                {formatReading(item.reading_amount, meterGroups.find((g) => g.id === item.meter_group_id)?.utility_type || 'electricity')}
              </td>
              <td class="px-6 py-4 text-right font-mono text-gray-400 text-xs">
                {(getCumulativeOffset(meterGroups.find((g) => g.id === item.meter_group_id), item.meter_version ?? 1) + item.reading_amount).toLocaleString()} {getReadingUnit(meterGroups.find((g) => g.id === item.meter_group_id)?.utility_type || 'electricity')}
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

<!-- Image Preview Modal -->
{#if previewImageUrl}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
    onclick={(e) => {
      if (e.target === e.currentTarget) previewImageUrl = null;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') previewImageUrl = null;
    }}
    role="dialog"
    aria-modal="true"
  >
    <div
      class="relative h-screen w-screen bg-black"
      onmousedown={(e) => {
        previewIsDragging = true;
        previewDragStart = { x: e.clientX, y: e.clientY };
      }}
      onmousemove={(e) => {
        if (previewIsDragging) {
          previewDragX += e.clientX - previewDragStart.x;
          previewDragY += e.clientY - previewDragStart.y;
          previewDragStart = { x: e.clientX, y: e.clientY };
        }
      }}
      onmouseup={() => {
        previewIsDragging = false;
      }}
      onmouseleave={() => {
        previewIsDragging = false;
      }}
    >
      <!-- Close button -->
      <button
        onclick={() => (previewImageUrl = null)}
        class="fixed right-6 top-6 z-10 rounded-full bg-white p-2 text-gray-700 hover:bg-gray-200"
        aria-label="Close preview"
      >
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Image container with zoom and rotation -->
      <div class="flex h-screen w-screen items-center justify-center" style="cursor: {previewIsDragging ? 'grabbing' : 'grab'};">
        <img
          src={previewImageUrl}
          alt="Preview"
          style="transform: translate({previewDragX}px, {previewDragY}px) scale({previewZoom}) rotate({previewRotation}deg); transition: {previewIsDragging ? 'none' : 'transform 0.2s ease-in-out'}; user-select: none;"
          class="select-none"
          onmousedown={(e) => e.preventDefault()}
        />
      </div>

      <!-- Zoom and Rotation controls -->
      <div class="fixed bottom-6 left-1/2 flex -translate-x-1/2 gap-4 rounded-lg bg-white p-3 shadow-lg">
        <!-- Rotation controls -->
        <div class="flex gap-2 border-r border-gray-300 pr-4">
          <button
            onclick={() => (previewRotation = (previewRotation - 90) % 360)}
            class="rounded px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
            title="Rotate left"
          >
            ↺
          </button>
          <button
            onclick={() => (previewRotation = (previewRotation + 90) % 360)}
            class="rounded px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
            title="Rotate right"
          >
            ↻
          </button>
        </div>

        <!-- Zoom controls -->
        <div class="flex gap-2">
          <button
            onclick={() => (previewZoom = Math.max(1, previewZoom - 0.2))}
            disabled={previewZoom <= 1}
            class="rounded px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            −
          </button>
          <span class="px-3 py-1 text-sm font-medium text-gray-700">{Math.round(previewZoom * 100)}%</span>
          <button
            onclick={() => (previewZoom = Math.min(3, previewZoom + 0.2))}
            disabled={previewZoom >= 3}
            class="rounded px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
