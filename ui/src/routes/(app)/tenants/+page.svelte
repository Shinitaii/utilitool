<script lang="ts">
  import { onMount } from 'svelte';
  import { getTenants, createTenant, updateTenant, softDeleteTenant } from '$lib/api/tenants';
  import { getProperties } from '$lib/api/properties';
  import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '$lib/types/tenant.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';

  let data = $state<PaginatedResult<Tenant>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let properties = $state<Property[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let searchTerm = $state('');

  let createFormOpen = $state(false);
  let editModalOpen = $state(false);
  let editingItem = $state<Tenant | null>(null);

  let createFormData = $state<{
    tenant_name: string;
    property_id: string;
    tenant_start_date: string;
  }>({
    tenant_name: '',
    property_id: '',
    tenant_start_date: new Date().toISOString().split('T')[0]
  });

  let editFormData = $state<{
    tenant_name: string;
    tenant_start_date: string;
    tenant_end_date?: string;
  }>({
    tenant_name: '',
    tenant_start_date: '',
    tenant_end_date: undefined
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
      const [tenantsResult, propertiesResult] = await Promise.all([
        getTenants({ limit: 100 }),
        getProperties({ limit: 100 })
      ]);
      data = tenantsResult;
      properties = propertiesResult.data;
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

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    try {
      await createTenant(createFormData);
      createFormOpen = false;
      createFormData = {
        tenant_name: '',
        property_id: '',
        tenant_start_date: new Date().toISOString().split('T')[0]
      };
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create tenant';
    }
  }

  function openEditModal(item: Tenant) {
    editingItem = item;
    const startValue = item.tenant_start_date as any;
    let startDate = '';
    if (typeof startValue === 'string') {
      startDate = startValue.split('T')[0];
    } else {
      startDate = toDate(startValue).toISOString().split('T')[0];
    }

    let endDate: string | undefined = undefined;
    if (item.tenant_end_date) {
      const endValue = item.tenant_end_date as any;
      if (typeof endValue === 'string') {
        endDate = endValue.split('T')[0];
      } else {
        endDate = toDate(endValue).toISOString().split('T')[0];
      }
    }

    editFormData = {
      tenant_name: item.tenant_name,
      tenant_start_date: startDate,
      tenant_end_date: endDate
    };
    editModalOpen = true;
  }

  async function handleUpdate() {
    if (!editingItem) return;
    editingId = editingItem.id;
    try {
      await updateTenant(editingItem.id, editFormData);
      editModalOpen = false;
      editingItem = null;
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update tenant';
    } finally {
      editingId = null;
    }
  }

  async function handleSoftDelete(id: string) {
    if (confirm('Archive this tenant? It can be restored from the archive.')) {
      deletingId = id;
      try {
        await softDeleteTenant(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive tenant';
      } finally {
        deletingId = null;
      }
    }
  }

  const filteredData = getFilteredData();
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold">All Tenants</h1>
      <p class="mt-1 text-gray-600">{data.data.length} total</p>
    </div>
    <div class="flex gap-3">
      <a
        href="/tenants/archive"
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
      <h2 class="font-semibold">New Tenant</h2>
      <form onsubmit={handleCreate} class="mt-4 space-y-4">
        <div>
          <label for="tenant-name" class="block text-sm font-medium text-gray-700">Tenant Name</label>
          <input
            id="tenant-name"
            type="text"
            bind:value={createFormData.tenant_name}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            placeholder="e.g., John Doe"
          />
        </div>
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
          <label for="start-date" class="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            id="start-date"
            type="date"
            bind:value={createFormData.tenant_start_date}
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
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
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
  title="Edit Tenant"
  isLoading={editingId === editingItem?.id}
  onClose={() => {
    editModalOpen = false;
    editingItem = null;
  }}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-tenant-name" class="block text-sm font-medium text-gray-700">Tenant Name</label>
      <input
        id="edit-tenant-name"
        type="text"
        bind:value={editFormData.tenant_name}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-start-date" class="block text-sm font-medium text-gray-700">Start Date</label>
      <input
        id="edit-start-date"
        type="date"
        bind:value={editFormData.tenant_start_date}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-end-date" class="block text-sm font-medium text-gray-700">End Date (Optional)</label>
      <input
        id="edit-end-date"
        type="date"
        bind:value={editFormData.tenant_end_date}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
  </div>
</EditModal>
