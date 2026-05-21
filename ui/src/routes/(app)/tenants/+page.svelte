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
  import SelectionToolbar from '$lib/components/shared/SelectionToolbar.svelte';
  import { createCrudStore } from '$lib/stores/crud.svelte';
  import { Archive, Plus } from 'lucide-svelte';

  const crud = createCrudStore<Tenant>();

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
  let isUpdating = $state(false);

  let createFormData = $state<CreateTenantRequest>({
    tenant_name: '',
    property_id: '',
    tenant_start_date: new Date().toISOString().split('T')[0]
  });

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

  async function handleUpdate() {
    if (!crud.editingItem) return;
    isUpdating = true;
    try {
      await updateTenant(crud.editingItem.id, crud.editFormData as UpdateTenantRequest);
      crud.closeEditModal();
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update tenant';
    } finally {
      isUpdating = false;
    }
  }

  const filteredData = $derived(getFilteredData());
  const editData = $derived(crud.editFormData as unknown as { tenant_name: string; tenant_start_date: string; tenant_end_date?: string });
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
        class="p-2 rounded hover:bg-gray-100 text-gray-700"
        title="View archive"
        aria-label="View tenants archive"
      >
        <Archive size={20} />
      </a>
      <button
        onclick={() => (createFormOpen = !createFormOpen)}
        class="p-2 rounded text-white"
        style="background-color: var(--color-accent)"
        title="Create new tenant"
        aria-label={createFormOpen ? 'Cancel new tenant' : 'Create new tenant'}
      >
        <Plus size={20} />
      </button>
    </div>
  </div>

  {#if error || crud.error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error || crud.error}
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
    <label class="sr-only" for="search-tenants">Search tenants</label>
    <input
      id="search-tenants"
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
      <div class="space-y-3 mb-4">
        <SelectionToolbar
          selectedCount={crud.selectedIds.size}
          isBatchDeleting={crud.isBatchDeleting}
          onBatchDelete={() => crud.handleBatchDelete(softDeleteTenant, loadData)}
          entityLabel="tenant"
        />
      </div>
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            <th scope="col" class="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={crud.selectedIds.size === filteredData.length && filteredData.length > 0}
                onchange={() => crud.toggleSelectAll(filteredData.map(i => i.id), filteredData.map(i => i.id))}
                class="rounded"
              />
            </th>
            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Tenant Name</th>
            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Start Date</th>
            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredData as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-4 py-4 w-8">
                <input
                  type="checkbox"
                  checked={crud.selectedIds.has(item.id)}
                  onchange={() => crud.toggleSelection(item.id)}
                  class="rounded"
                />
              </td>
              <td class="px-6 py-4 font-medium">{item.tenant_name}</td>
              <td class="px-6 py-4 text-gray-600">{properties.find(p => p.id === item.property_id)?.room_name || 'Unknown'}</td>
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
                  onEdit={() => {
                    const startDate = toDate(item.tenant_start_date as any).toISOString().split('T')[0];
                    const endDate = item.tenant_end_date
                      ? toDate(item.tenant_end_date as any).toISOString().split('T')[0]
                      : undefined;
                    crud.openEditModal(item, { tenant_name: item.tenant_name, tenant_start_date: startDate, tenant_end_date: endDate } as any);
                  }}
                  onSoftDelete={() => crud.handleSoftDelete(item.id, softDeleteTenant, loadData, () => confirm('Archive this tenant? It can be restored from the archive.'))}
                  isLoading={crud.deletingId === item.id}
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
  bind:isOpen={crud.editModalOpen}
  title="Edit Tenant"
  isLoading={isUpdating}
  onClose={crud.closeEditModal}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-tenant-name" class="block text-sm font-medium text-gray-700">Tenant Name</label>
      <input
        id="edit-tenant-name"
        type="text"
        bind:value={editData.tenant_name}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-start-date" class="block text-sm font-medium text-gray-700">Start Date</label>
      <input
        id="edit-start-date"
        type="date"
        bind:value={editData.tenant_start_date}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-end-date" class="block text-sm font-medium text-gray-700">End Date (Optional)</label>
      <input
        id="edit-end-date"
        type="date"
        bind:value={editData.tenant_end_date}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
  </div>
</EditModal>
