<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties, createProperty, updateProperty, softDeleteProperty } from '$lib/api/properties';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getTenants } from '$lib/api/tenants';
  import { getReadings } from '$lib/api/readings';
  import { getBillings } from '$lib/api/billings';
  import type { Property, UpdatePropertyRequest } from '$lib/types/property.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Tenant } from '$lib/types/tenant.types';
  import type { Reading } from '$lib/types/reading.types';
  import type { Billing } from '$lib/types/billing.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency, formatReading, getReadingUnit } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import { Plus, Archive } from 'lucide-svelte';
  import ActionButtons from '$lib/components/shared/ActionButtons.svelte';

  let properties = $state<PaginatedResult<Property>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let electricityMeters = $state<MeterGroup[]>([]);
  let waterMeters = $state<MeterGroup[]>([]);
  let selectedProperty = $state<Property | null>(null);
  let tenants = $state<Tenant[]>([]);
  let readings = $state<PaginatedResult<Reading>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let billings = $state<PaginatedResult<Billing>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });

  let isLoading = $state(false);
  let error = $state('');
  let searchQuery = $state('');
  let activeTab = $state<'tenants' | 'readings' | 'billings' | 'history'>('tenants');
  let showNewPropertyForm = $state(false);
  let editModalOpen = $state(false);
  let editingProperty = $state<Property | null>(null);
  let deletingPropertyId = $state<string | null>(null);
  let selectedPropertyIds = $state<Set<string>>(new Set());
  let isBatchDeleting = $state(false);

  let newPropertyForm = $state({
    room_name: '',
    tenant_amount: 1,
    meter_groups: {
      electricity: '',
      water: ''
    }
  });

  let editPropertyForm = $state({
    room_name: '',
    tenant_amount: 1,
    meter_groups: {
      electricity: '',
      water: ''
    }
  });

  const filteredProperties = $derived(
    searchQuery
      ? properties.data.filter(p =>
          p.room_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : properties.data
  );

  onMount(async () => {
    await loadProperties();
  });

  // Re-fetch tab data whenever active tab or selected property changes
  $effect(() => {
    if (selectedProperty && activeTab) {
      loadPropertyDetails();
    }
  });

  async function loadProperties() {
    isLoading = true;
    error = '';
    try {
      const [propsResult, electricityResult, waterResult] = await Promise.all([
        getProperties({ limit: 100 }),
        getMeterGroups({ limit: 100, utilityType: 'electricity' }),
        getMeterGroups({ limit: 100, utilityType: 'water' })
      ]);

      properties = propsResult;
      electricityMeters = electricityResult.data;
      waterMeters = waterResult.data;

      if (properties.data.length > 0 && !selectedProperty) {
        selectedProperty = properties.data[0];
        await loadPropertyDetails();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load properties';
    } finally {
      isLoading = false;
    }
  }

  async function loadPropertyDetails() {
    if (!selectedProperty) return;

    try {
      if (activeTab === 'tenants') {
        tenants = await getTenants({ propertyId: selectedProperty.id, limit: 100 }).then(
          result => result.data
        );
      } else if (activeTab === 'readings') {
        // Load readings for both electricity and water meter groups
        const [electricityReadings, waterReadings] = await Promise.all([
          getReadings({ meterGroupId: selectedProperty.meter_groups.electricity, limit: 50 }),
          getReadings({ meterGroupId: selectedProperty.meter_groups.water, limit: 50 })
        ]);
        // Combine results
        readings = {
          data: [...electricityReadings.data, ...waterReadings.data],
          nextCursor: null,
          hasMore: false
        };
      } else if (activeTab === 'billings') {
        const [billingsResult, electricityReadings, waterReadings] = await Promise.all([
          getBillings({ propertyId: selectedProperty.id, limit: 50 }),
          getReadings({ meterGroupId: selectedProperty.meter_groups.electricity, limit: 100 }),
          getReadings({ meterGroupId: selectedProperty.meter_groups.water, limit: 100 })
        ]);
        billings = billingsResult;
        readings = {
          data: [...electricityReadings.data, ...waterReadings.data],
          nextCursor: null,
          hasMore: false
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load details';
    }
  }

  async function handleSelectProperty(property: Property) {
    selectedProperty = property;
    tenants = [];
    readings = { data: [], nextCursor: null, hasMore: false };
    billings = { data: [], nextCursor: null, hasMore: false };
    await loadPropertyDetails();
  }

  async function handleTabChange(tab: typeof activeTab) {
    activeTab = tab;
    tenants = [];
    readings = { data: [], nextCursor: null, hasMore: false };
    billings = { data: [], nextCursor: null, hasMore: false };
    await loadPropertyDetails();
  }

  async function handleCreateProperty() {
    if (
      !newPropertyForm.room_name.trim() ||
      !newPropertyForm.meter_groups.electricity ||
      !newPropertyForm.meter_groups.water
    ) {
      error = 'Room name, electricity meter group, and water meter group are required';
      return;
    }

    isLoading = true;
    error = '';
    try {
      const created = await createProperty({
        room_name: newPropertyForm.room_name,
        tenant_amount: newPropertyForm.tenant_amount,
        meter_groups: newPropertyForm.meter_groups
      });

      properties.data = [created, ...properties.data];
      selectedProperty = created;
      newPropertyForm = {
        room_name: '',
        tenant_amount: 1,
        meter_groups: { electricity: '', water: '' }
      };
      showNewPropertyForm = false;
      await loadPropertyDetails();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create property';
    } finally {
      isLoading = false;
    }
  }

  function openEditModal(property: Property) {
    editingProperty = property;
    editPropertyForm = {
      room_name: property.room_name,
      tenant_amount: property.tenant_amount,
      meter_groups: {
        electricity: property.meter_groups.electricity,
        water: property.meter_groups.water
      }
    };
    editModalOpen = true;
  }

  async function handleUpdateProperty() {
    if (!editingProperty) return;
    isLoading = true;
    error = '';
    try {
      await updateProperty(editingProperty.id, editPropertyForm);
      editModalOpen = false;
      editingProperty = null;
      await loadProperties();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update property';
    } finally {
      isLoading = false;
    }
  }

  async function handleSoftDeleteProperty(id: string) {
    if (confirm('Archive this property? It can be restored from the archive.')) {
      deletingPropertyId = id;
      error = '';
      try {
        await softDeleteProperty(id);
        await loadProperties();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive property';
      } finally {
        deletingPropertyId = null;
      }
    }
  }

  async function handleBatchDelete() {
    if (selectedPropertyIds.size === 0) return;
    if (!confirm(`Archive ${selectedPropertyIds.size} propert(ies)? They can be restored from the archive.`)) return;

    isBatchDeleting = true;
    try {
      await Promise.all(Array.from(selectedPropertyIds).map(id => softDeleteProperty(id)));
      selectedPropertyIds.clear();
      await loadProperties();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to archive properties';
    } finally {
      isBatchDeleting = false;
    }
  }

  function togglePropertySelection(id: string) {
    if (selectedPropertyIds.has(id)) {
      selectedPropertyIds.delete(id);
    } else {
      selectedPropertyIds.add(id);
    }
    selectedPropertyIds = selectedPropertyIds;
  }

  function toggleSelectAllProperties() {
    if (selectedPropertyIds.size === filteredProperties.length) {
      selectedPropertyIds.clear();
    } else {
      selectedPropertyIds = new Set(filteredProperties.map(item => item.id));
    }
    selectedPropertyIds = selectedPropertyIds;
  }
</script>

<div class="flex h-screen flex-col">
  <div class="space-y-4 border-b border-gray-200 bg-white p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Properties</h1>
        <p class="mt-1 text-gray-600">{filteredProperties.length} rooms</p>
      </div>
      <a
        href="/properties/archive"
        class="p-2 rounded hover:bg-gray-100 text-gray-700"
        title="View archive"
        aria-label="View properties archive"
      >
        <Archive size={20} />
      </a>
    </div>

    {#if error}
      <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    {/if}
  </div>

  <div class="flex flex-1 overflow-hidden">
    <!-- Left Panel: Property List -->
    <div class="w-64 border-r border-gray-200 bg-gray-50">
      <div class="space-y-3 border-b border-gray-200 p-4">
        <label class="sr-only" for="search-properties">Search properties</label>
        <input
          id="search-properties"
          type="text"
          placeholder="Search properties..."
          bind:value={searchQuery}
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onclick={() => (showNewPropertyForm = !showNewPropertyForm)}
          class="w-full flex items-center justify-center rounded bg-blue-600 p-2 text-white hover:bg-blue-700"
          disabled={isLoading}
          title="Create new property"
        >
          <Plus size={20} />
        </button>
      </div>

      {#if showNewPropertyForm}
        <div class="border-b border-gray-200 bg-white p-4">
          <div class="space-y-3">
            <div>
              <label for="room-name" class="block text-xs font-medium text-gray-700"
                >Room Name</label
              >
              <input
                id="room-name"
                type="text"
                bind:value={newPropertyForm.room_name}
                placeholder="e.g., Unit 101"
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label for="tenant-amount" class="block text-xs font-medium text-gray-700"
                >Tenant Amount</label
              >
              <input
                id="tenant-amount"
                type="number"
                bind:value={newPropertyForm.tenant_amount}
                min="1"
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label for="electricity-meter" class="block text-xs font-medium text-gray-700"
                >Electricity Meter Group *</label
              >
              <select
                id="electricity-meter"
                bind:value={newPropertyForm.meter_groups.electricity}
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">Select electricity meter...</option>
                {#each electricityMeters as group (group.id)}
                  <option value={group.id}>
                    {group.meter_name}
                  </option>
                {/each}
              </select>
            </div>
            <div>
              <label for="water-meter" class="block text-xs font-medium text-gray-700"
                >Water Meter Group *</label
              >
              <select
                id="water-meter"
                bind:value={newPropertyForm.meter_groups.water}
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">Select water meter...</option>
                {#each waterMeters as group (group.id)}
                  <option value={group.id}>
                    {group.meter_name}
                  </option>
                {/each}
              </select>
            </div>
            <div class="flex gap-2">
              <button
                onclick={handleCreateProperty}
                disabled={isLoading}
                class="flex-1 rounded bg-green-600 px-2 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onclick={() => (showNewPropertyForm = false)}
                class="flex-1 rounded bg-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if selectedPropertyIds.size > 0}
        <div class="flex items-center justify-between border-b border-gray-200 bg-blue-50 p-3">
          <span class="text-xs font-medium text-blue-900">{selectedPropertyIds.size} selected</span>
          <button
            onclick={handleBatchDelete}
            disabled={isBatchDeleting}
            class="px-2 py-1 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {isBatchDeleting ? 'Archiving...' : 'Archive'}
          </button>
        </div>
      {/if}

      <div class="flex-1 overflow-y-auto">
        {#if filteredProperties.length === 0}
          <div class="p-4">
            <EmptyState title="No properties" message="Create a property to get started" />
          </div>
        {:else}
          {#each filteredProperties as property (property.id)}
            <div class="border-b border-gray-200 p-3">
              <div class="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedPropertyIds.has(property.id)}
                  onchange={() => togglePropertySelection(property.id)}
                  class="mt-2 rounded"
                />
                <button
                  onclick={() => handleSelectProperty(property)}
                  class="flex-1 px-1 py-2 text-left transition {selectedProperty?.id === property.id
                    ? 'bg-blue-50 rounded'
                    : 'hover:bg-gray-100 rounded'}"
                >
                  <div class="font-medium text-gray-900">{property.room_name}</div>
                  <div class="text-xs text-gray-500">
                    {formatDate(toDate(property.created_at))}
                  </div>
                </button>
              </div>
              <div class="mt-2">
                <ActionButtons
                  onEdit={() => {
                    openEditModal(property);
                  }}
                  onSoftDelete={() => handleSoftDeleteProperty(property.id)}
                  isLoading={deletingPropertyId === property.id}
                />
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Main Panel: Property Detail -->
    <div class="flex-1 overflow-hidden bg-white">
      {#if selectedProperty}
        <div class="flex h-full flex-col">
          <!-- Property Header -->
          <div class="border-b border-gray-200 bg-gray-50 p-6">
            <h2 class="text-2xl font-bold text-gray-900">{selectedProperty.room_name}</h2>
            <div class="mt-2 space-y-1 text-sm text-gray-600">
              <p>
                <span class="font-medium">Electricity:</span>
                <span class="font-mono text-xs">{selectedProperty.meter_groups.electricity || 'N/A'}</span>
              </p>
              <p>
                <span class="font-medium">Water:</span>
                <span class="font-mono text-xs">{selectedProperty.meter_groups.water || 'N/A'}</span>
              </p>
            </div>
          </div>

          <!-- Tabs -->
          <div class="border-b border-gray-200">
            <div class="flex" role="tablist">
              {#each ['tenants', 'readings', 'billings', 'history'] as tab}
                <button
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`tab-panel-${tab}`}
                  id={`tab-${tab}`}
                  onclick={() => handleTabChange(tab as 'tenants' | 'readings' | 'billings' | 'history')}
                  class="px-6 py-3 font-medium text-sm transition {activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'}"
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              {/each}
            </div>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-y-auto">
            {#if activeTab === 'tenants'}
              <div role="tabpanel" id="tab-panel-tenants" aria-labelledby="tab-tenants">
              {#if tenants.length === 0}
                <div class="p-6">
                  <EmptyState
                    title="No tenants"
                    message="Add tenants to this property to track their usage and billing"
                  />
                </div>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
                          >Tenant Name</th
                        >
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Start Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each tenants as tenant (tenant.id)}
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                          <td class="px-6 py-4 font-medium text-gray-900">{tenant.tenant_name}</td>
                          <td class="px-6 py-4">
                            <span class="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
                              >Current</span
                            >
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {formatDate(toDate(tenant.tenant_start_date))}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
              </div>
            {:else if activeTab === 'readings'}
              <div role="tabpanel" id="tab-panel-readings" aria-labelledby="tab-readings">
              {#if readings.data.length === 0}
                <div class="p-6">
                  <EmptyState
                    title="No readings"
                    message="Create readings to track meter consumption"
                  />
                </div>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Meter Group</th>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Reading</th>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each readings.data as reading (reading.id)}
                        {@const meterGroup = electricityMeters.find(m => m.id === reading.meter_group_id) || waterMeters.find(m => m.id === reading.meter_group_id)}
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                          <td class="px-6 py-4 text-gray-700">
                            {meterGroup?.meter_name || 'Unknown'}
                          </td>
                          <td class="px-6 py-4 font-mono text-gray-700">
                            {formatReading(reading.reading_amount, meterGroup?.utility_type || 'electricity')}
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {formatDate(toDate(reading.reading_date))}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
              </div>
            {:else if activeTab === 'billings'}
              <div role="tabpanel" id="tab-panel-billings" aria-labelledby="tab-billings">
              {#if billings.data.length === 0}
                <div class="p-6">
                  <EmptyState title="No billings" message="Create a billing cycle to generate bills" />
                </div>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
                          >Previous Reading</th
                        >
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Current Reading</th>
                        <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Date Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each billings.data as billing (billing.id)}
                        {@const prevReading = readings.data.find(r => r.id === billing.previous_reading_id)}
                        {@const currReading = readings.data.find(r => r.id === billing.current_reading_id)}
                        {@const meterGroup = prevReading ? (electricityMeters.find(m => m.id === prevReading.meter_group_id) || waterMeters.find(m => m.id === prevReading.meter_group_id)) : null}
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                          <td class="px-6 py-4 font-mono text-gray-700">
                            {prevReading ? formatReading(prevReading.reading_amount, meterGroup?.utility_type || 'electricity') : 'N/A'}
                          </td>
                          <td class="px-6 py-4 font-mono text-gray-700">
                            {currReading ? formatReading(currReading.reading_amount, meterGroup?.utility_type || 'electricity') : 'N/A'}
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {prevReading && currReading ? formatDate(toDate(prevReading.reading_date)) + ' - ' + formatDate(toDate(currReading.reading_date)) : 'N/A'}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
              </div>
            {:else if activeTab === 'history'}
              <div role="tabpanel" id="tab-panel-history" aria-labelledby="tab-history">
                <div class="p-6">
                  <EmptyState title="History" message="Property history coming soon" />
                </div>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex h-full items-center justify-center">
          <EmptyState
            title="No property selected"
            message="Select or create a property to view details"
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Edit Modal -->
<EditModal
  bind:isOpen={editModalOpen}
  title="Edit Property"
  isLoading={isLoading}
  onClose={() => {
    editModalOpen = false;
    editingProperty = null;
  }}
  onSubmit={handleUpdateProperty}
>
  <div class="space-y-4">
    <div>
      <label for="edit-room-name" class="block text-sm font-medium text-gray-700">Room Name</label>
      <input
        id="edit-room-name"
        type="text"
        bind:value={editPropertyForm.room_name}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-tenant-amount" class="block text-sm font-medium text-gray-700">Tenant Amount</label>
      <input
        id="edit-tenant-amount"
        type="number"
        bind:value={editPropertyForm.tenant_amount}
        min="1"
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
    <div>
      <label for="edit-electricity-meter" class="block text-sm font-medium text-gray-700">Electricity Meter Group</label>
      <select
        id="edit-electricity-meter"
        value={editPropertyForm.meter_groups?.electricity || ''}
        onchange={(e) => {
          if (editPropertyForm.meter_groups) {
            editPropertyForm.meter_groups.electricity = (e.target as HTMLSelectElement).value;
          }
        }}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        <option value="">Select electricity meter...</option>
        {#each electricityMeters as group (group.id)}
          <option value={group.id}>{group.meter_name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-water-meter" class="block text-sm font-medium text-gray-700">Water Meter Group</label>
      <select
        id="edit-water-meter"
        value={editPropertyForm.meter_groups?.water || ''}
        onchange={(e) => {
          if (editPropertyForm.meter_groups) {
            editPropertyForm.meter_groups.water = (e.target as HTMLSelectElement).value;
          }
        }}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        <option value="">Select water meter...</option>
        {#each waterMeters as group (group.id)}
          <option value={group.id}>{group.meter_name}</option>
        {/each}
      </select>
    </div>
  </div>
</EditModal>

<style>
  :global(html, body) {
    overflow: hidden;
  }
</style>
