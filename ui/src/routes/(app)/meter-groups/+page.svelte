<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getMeterGroups, createMeterGroup, updateMeterGroup, softDeleteMeterGroup } from '$lib/api/meter-groups';
  import type { MeterGroup, CreateMeterGroupRequest, UpdateMeterGroupRequest } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';

  let data = $state<PaginatedResult<MeterGroup>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');

  let createFormOpen = $state(false);
  let editModalOpen = $state(false);
  let editingItem = $state<MeterGroup | null>(null);

  let createFormData = $state({
    meter_name: '',
    utility_type: 'electricity' as const
  });

  let editFormData = $state<UpdateMeterGroupRequest>({
    meter_name: '',
    utility_type: 'electricity'
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
      data = await getMeterGroups({ limit: 100 });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load meter groups';
    } finally {
      isLoading = false;
    }
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    try {
      await createMeterGroup(createFormData);
      createFormOpen = false;
      createFormData = { meter_name: '', utility_type: 'electricity' };
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create meter group';
    }
  }

  function openEditModal(item: MeterGroup) {
    editingItem = item;
    editFormData = { meter_name: item.meter_name, utility_type: item.utility_type };
    editModalOpen = true;
  }

  async function handleUpdate() {
    if (!editingItem) return;
    editingId = editingItem.id;
    try {
      await updateMeterGroup(editingItem.id, editFormData);
      editModalOpen = false;
      editingItem = null;
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update meter group';
    } finally {
      editingId = null;
    }
  }

  async function handleSoftDelete(id: string) {
    if (confirm('Archive this meter group? It can be restored from the archive.')) {
      deletingId = id;
      try {
        await softDeleteMeterGroup(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive meter group';
      } finally {
        deletingId = null;
      }
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold">Meter Groups</h1>
      <p class="mt-1 text-gray-600">{data.data.length} total</p>
    </div>
    <div class="flex gap-3">
      <a
        href="/meter-groups/archive"
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
      <h2 class="font-semibold">New Meter Group</h2>
      <form onsubmit={handleCreate} class="mt-4 space-y-4">
        <div>
          <label for="meter-name" class="block text-sm font-medium text-gray-700">Meter Name</label>
          <input
            id="meter-name"
            type="text"
            bind:value={createFormData.meter_name}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            placeholder="e.g., Main Meter"
          />
        </div>
        <div>
          <label for="utility-type" class="block text-sm font-medium text-gray-700">Utility Type</label>
          <select
            id="utility-type"
            bind:value={createFormData.utility_type}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="electricity">Electricity</option>
            <option value="water">Water</option>
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

  <div class="overflow-x-auto rounded-lg border border-gray-200">
    {#if data.data.length === 0}
      <div class="p-6">
        <EmptyState title="No meter groups" message="Create your first meter group to get started" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Meter Name</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Utility Type</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.data as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-6 py-4">{item.meter_name}</td>
              <td class="px-6 py-4">
                <span class="rounded bg-gray-100 px-2 py-1 text-xs font-medium capitalize">
                  {item.utility_type}
                </span>
              </td>
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
  title="Edit Meter Group"
  isLoading={editingId === editingItem?.id}
  onClose={() => {
    editModalOpen = false;
    editingItem = null;
  }}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-meter-name" class="block text-sm font-medium text-gray-700">Meter Name</label>
      <input
        id="edit-meter-name"
        type="text"
        bind:value={editFormData.meter_name}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-utility-type" class="block text-sm font-medium text-gray-700">Utility Type</label>
      <select
        id="edit-utility-type"
        bind:value={editFormData.utility_type}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        <option value="electricity">Electricity</option>
        <option value="water">Water</option>
      </select>
    </div>
  </div>
</EditModal>
