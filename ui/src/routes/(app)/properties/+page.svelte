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
  import SelectionToolbar from '$lib/components/shared/SelectionToolbar.svelte';
  import { createCrudStore } from '$lib/stores/crud.svelte';

  const crud = createCrudStore<Property>();

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
  let isUpdating = $state(false);

  let newPropertyForm = $state({
    room_name: '',
    tenant_amount: 1,
    meter_groups: {
      electricity: '',
      water: ''
    },
    is_main_meter: {
      electricity: false,
      water: false
    }
  });

  let editPropertyForm = $state({
    room_name: '',
    tenant_amount: 1,
    meter_groups: {
      electricity: '',
      water: ''
    },
    is_main_meter: {
      electricity: false,
      water: false
    }
  });

  const filteredProperties = $derived(
    searchQuery
      ? properties.data.filter(p =>
          p.room_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : properties.data
  );

  function getMeterGroupName(meterGroupId: string): string {
    const found = electricityMeters.find(m => m.id === meterGroupId) || waterMeters.find(m => m.id === meterGroupId);
    return found?.meter_name || meterGroupId;
  }

  function getMainMeterPropertyForMeterGroup(meterGroupId: string): string | null {
    if (!meterGroupId) return null;
    for (const prop of properties.data) {
      const elecEntry = prop.meter_groups.electricity;
      const waterEntry = prop.meter_groups.water;

      const elecId = typeof elecEntry === 'string' ? elecEntry : elecEntry?.meter_group_id;
      const waterId = typeof waterEntry === 'string' ? waterEntry : waterEntry?.meter_group_id;

      if (elecId === meterGroupId && typeof elecEntry !== 'string' && elecEntry?.is_main_meter) {
        return prop.id;
      }
      if (waterId === meterGroupId && typeof waterEntry !== 'string' && waterEntry?.is_main_meter) {
        return prop.id;
      }
    }
    return null;
  }

  function getMainMeterPropertyName(meterGroupId: string): string | null {
    const mainMeterId = getMainMeterPropertyForMeterGroup(meterGroupId);
    if (!mainMeterId) return null;
    return properties.data.find(p => p.id === mainMeterId)?.room_name || null;
  }

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
        // Load readings for all available meter groups
        const promises = [];
        const electricityId = selectedProperty.meter_groups.electricity
          ? (typeof selectedProperty.meter_groups.electricity === 'string'
            ? selectedProperty.meter_groups.electricity
            : selectedProperty.meter_groups.electricity.meter_group_id)
          : null;
        const waterId = selectedProperty.meter_groups.water
          ? (typeof selectedProperty.meter_groups.water === 'string'
            ? selectedProperty.meter_groups.water
            : selectedProperty.meter_groups.water.meter_group_id)
          : null;

        if (electricityId) promises.push(getReadings({ meterGroupId: electricityId, propertyId: selectedProperty.id, limit: 50 }));
        if (waterId) promises.push(getReadings({ meterGroupId: waterId, propertyId: selectedProperty.id, limit: 50 }));

        const results = await Promise.all(promises);
        const allReadings = results.flatMap(r => r.data);
        readings = {
          data: allReadings,
          nextCursor: null,
          hasMore: false
        };
      } else if (activeTab === 'billings') {
        const billingsPromise = getBillings({ propertyId: selectedProperty.id, limit: 50 });
        const electricityId = selectedProperty.meter_groups.electricity
          ? (typeof selectedProperty.meter_groups.electricity === 'string'
            ? selectedProperty.meter_groups.electricity
            : selectedProperty.meter_groups.electricity.meter_group_id)
          : null;
        const waterId = selectedProperty.meter_groups.water
          ? (typeof selectedProperty.meter_groups.water === 'string'
            ? selectedProperty.meter_groups.water
            : selectedProperty.meter_groups.water.meter_group_id)
          : null;

        const readingPromises = [];
        if (electricityId) readingPromises.push(getReadings({ meterGroupId: electricityId, propertyId: selectedProperty.id, limit: 100 }));
        if (waterId) readingPromises.push(getReadings({ meterGroupId: waterId, propertyId: selectedProperty.id, limit: 100 }));

        const [billingsResult, ...readingResults] = await Promise.all([billingsPromise, ...readingPromises]);
        billings = billingsResult;
        const allReadings = readingResults.flatMap(r => r?.data ?? []);
        readings = {
          data: allReadings,
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
    if (!newPropertyForm.room_name.trim()) {
      error = 'Room name is required';
      return;
    }

    if (!newPropertyForm.meter_groups.electricity && !newPropertyForm.meter_groups.water) {
      error = 'At least one meter group (electricity or water) is required';
      return;
    }

    isLoading = true;
    error = '';
    try {
      const meter_groups: Record<string, any> = {};

      if (newPropertyForm.meter_groups.electricity && newPropertyForm.meter_groups.electricity.trim()) {
        meter_groups.electricity = {
          meter_group_id: newPropertyForm.meter_groups.electricity.trim(),
          is_main_meter: newPropertyForm.is_main_meter.electricity
        };
      }
      if (newPropertyForm.meter_groups.water && newPropertyForm.meter_groups.water.trim()) {
        meter_groups.water = {
          meter_group_id: newPropertyForm.meter_groups.water.trim(),
          is_main_meter: newPropertyForm.is_main_meter.water
        };
      }

      const created = await createProperty({
        room_name: newPropertyForm.room_name,
        tenant_amount: newPropertyForm.tenant_amount,
        meter_groups
      });

      properties.data = [created, ...properties.data];
      selectedProperty = created;
      newPropertyForm = {
        room_name: '',
        tenant_amount: 1,
        meter_groups: { electricity: '', water: '' },
        is_main_meter: { electricity: false, water: false }
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
    const electricityId = property.meter_groups.electricity
      ? (typeof property.meter_groups.electricity === 'string'
        ? property.meter_groups.electricity
        : property.meter_groups.electricity.meter_group_id)
      : '';
    const waterId = property.meter_groups.water
      ? (typeof property.meter_groups.water === 'string'
        ? property.meter_groups.water
        : property.meter_groups.water.meter_group_id)
      : '';
    const electricityIsMain = property.meter_groups.electricity
      ? (typeof property.meter_groups.electricity === 'string'
        ? false
        : property.meter_groups.electricity?.is_main_meter ?? false)
      : false;
    const waterIsMain = property.meter_groups.water
      ? (typeof property.meter_groups.water === 'string'
        ? false
        : property.meter_groups.water?.is_main_meter ?? false)
      : false;

    editPropertyForm = {
      room_name: property.room_name,
      tenant_amount: property.tenant_amount,
      meter_groups: {
        electricity: electricityId,
        water: waterId
      },
      is_main_meter: {
        electricity: electricityIsMain,
        water: waterIsMain
      }
    };
    crud.openEditModal(property, editPropertyForm as any);
  }

  async function handleUpdateProperty() {
    if (!crud.editingItem) return;
    isUpdating = true;
    error = '';
    try {
      const meter_groups: Record<string, any> = {};

      if (editPropertyForm.meter_groups.electricity && editPropertyForm.meter_groups.electricity.trim()) {
        meter_groups.electricity = {
          meter_group_id: editPropertyForm.meter_groups.electricity.trim(),
          is_main_meter: editPropertyForm.is_main_meter.electricity
        };
      }
      if (editPropertyForm.meter_groups.water && editPropertyForm.meter_groups.water.trim()) {
        meter_groups.water = {
          meter_group_id: editPropertyForm.meter_groups.water.trim(),
          is_main_meter: editPropertyForm.is_main_meter.water
        };
      }

      await updateProperty(crud.editingItem.id, {
        room_name: editPropertyForm.room_name,
        tenant_amount: editPropertyForm.tenant_amount,
        meter_groups
      });
      crud.closeEditModal();
      await loadProperties();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update property';
    } finally {
      isUpdating = false;
    }
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
    <div class="flex flex-col w-64 border-r border-gray-200 bg-gray-50">
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
                >Electricity Meter Group</label
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
                >Water Meter Group</label
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
            {#if newPropertyForm.meter_groups.electricity || newPropertyForm.meter_groups.water}
              <div class="space-y-2">
                {#if newPropertyForm.meter_groups.electricity}
                  <label class="flex items-center gap-2 text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      bind:checked={newPropertyForm.is_main_meter.electricity}
                      disabled={newPropertyForm.meter_groups.electricity !== '' && getMainMeterPropertyForMeterGroup(newPropertyForm.meter_groups.electricity) !== null && !newPropertyForm.is_main_meter.electricity}
                      class="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span>Main Meter (Electricity)</span>
                  </label>
                  {#if newPropertyForm.meter_groups.electricity !== '' && getMainMeterPropertyForMeterGroup(newPropertyForm.meter_groups.electricity) !== null && !newPropertyForm.is_main_meter.electricity}
                    <p class="text-xs text-amber-700 ml-6">
                      {getMainMeterPropertyName(newPropertyForm.meter_groups.electricity)} is already the main meter
                    </p>
                  {/if}
                {/if}
                {#if newPropertyForm.meter_groups.water}
                  <label class="flex items-center gap-2 text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      bind:checked={newPropertyForm.is_main_meter.water}
                      disabled={newPropertyForm.meter_groups.water !== '' && getMainMeterPropertyForMeterGroup(newPropertyForm.meter_groups.water) !== null && !newPropertyForm.is_main_meter.water}
                      class="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span>Main Meter (Water)</span>
                  </label>
                  {#if newPropertyForm.meter_groups.water !== '' && getMainMeterPropertyForMeterGroup(newPropertyForm.meter_groups.water) !== null && !newPropertyForm.is_main_meter.water}
                    <p class="text-xs text-amber-700 ml-6">
                      {getMainMeterPropertyName(newPropertyForm.meter_groups.water)} is already the main meter
                    </p>
                  {/if}
                {/if}
              </div>
            {/if}
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
                disabled={isLoading}
                class="flex-1 rounded bg-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      {/if}

      <SelectionToolbar
        selectedCount={crud.selectedIds.size}
        isBatchDeleting={crud.isBatchDeleting}
        onBatchDelete={() => crud.handleBatchDelete(softDeleteProperty, loadProperties)}
        entityLabel="property"
      />

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
                  checked={crud.selectedIds.has(property.id)}
                  onchange={() => crud.toggleSelection(property.id)}
                  class="mt-2 rounded"
                />
                <button
                  onclick={() => handleSelectProperty(property)}
                  class="flex-1 px-1 py-2 text-left transition {selectedProperty?.id === property.id
                    ? 'bg-blue-50 rounded'
                    : 'hover:bg-gray-100 rounded'}"
                >
                  <div class="flex items-start gap-1 overflow-hidden">
                    <span class="font-medium text-gray-900 truncate flex-1">
                      {property.room_name}
                    </span>
                    {#if (typeof property.meter_groups.electricity !== 'string' && property.meter_groups.electricity?.is_main_meter) || (typeof property.meter_groups.water !== 'string' && property.meter_groups.water?.is_main_meter)}
                      <span class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Main
                      </span>
                    {/if}
                  </div>
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
                  onSoftDelete={() => crud.handleSoftDelete(property.id, softDeleteProperty, loadProperties, () => confirm('Archive this property? It can be restored from the archive.'))}
                  isLoading={crud.deletingId === property.id}
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
              {#if selectedProperty.meter_groups.electricity}
                <p>
                  <span class="font-medium">Electricity:</span>
                  <span class="text-gray-900">
                    {getMeterGroupName(typeof selectedProperty.meter_groups.electricity === 'string'
                      ? selectedProperty.meter_groups.electricity
                      : selectedProperty.meter_groups.electricity?.meter_group_id || '')}
                  </span>
                  {#if typeof selectedProperty.meter_groups.electricity !== 'string' && selectedProperty.meter_groups.electricity?.is_main_meter}
                    <span class="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Main Meter
                    </span>
                  {/if}
                </p>
              {/if}
              {#if selectedProperty.meter_groups.water}
                <p>
                  <span class="font-medium">Water:</span>
                  <span class="text-gray-900">
                    {getMeterGroupName(typeof selectedProperty.meter_groups.water === 'string'
                      ? selectedProperty.meter_groups.water
                      : selectedProperty.meter_groups.water?.meter_group_id || '')}
                  </span>
                  {#if typeof selectedProperty.meter_groups.water !== 'string' && selectedProperty.meter_groups.water?.is_main_meter}
                    <span class="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Main Meter
                    </span>
                  {/if}
                </p>
              {/if}
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
  bind:isOpen={crud.editModalOpen}
  title="Edit Property"
  isLoading={isUpdating}
  onClose={crud.closeEditModal}
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
    {#if editPropertyForm.meter_groups.electricity || editPropertyForm.meter_groups.water}
      <div class="space-y-2">
        {#if editPropertyForm.meter_groups.electricity}
          <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              bind:checked={editPropertyForm.is_main_meter.electricity}
              disabled={editPropertyForm.meter_groups.electricity !== '' && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.electricity) !== null && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.electricity) !== crud.editingItem?.id && !editPropertyForm.is_main_meter.electricity}
              class="rounded disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span>Main Meter (Electricity)</span>
          </label>
          {#if editPropertyForm.meter_groups.electricity !== '' && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.electricity) !== null && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.electricity) !== crud.editingItem?.id && !editPropertyForm.is_main_meter.electricity}
            <p class="text-xs text-amber-700 ml-6">
              {getMainMeterPropertyName(editPropertyForm.meter_groups.electricity)} is already the main meter
            </p>
          {/if}
        {/if}
        {#if editPropertyForm.meter_groups.water}
          <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              bind:checked={editPropertyForm.is_main_meter.water}
              disabled={editPropertyForm.meter_groups.water !== '' && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.water) !== null && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.water) !== crud.editingItem?.id && !editPropertyForm.is_main_meter.water}
              class="rounded disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span>Main Meter (Water)</span>
          </label>
          {#if editPropertyForm.meter_groups.water !== '' && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.water) !== null && getMainMeterPropertyForMeterGroup(editPropertyForm.meter_groups.water) !== crud.editingItem?.id && !editPropertyForm.is_main_meter.water}
            <p class="text-xs text-amber-700 ml-6">
              {getMainMeterPropertyName(editPropertyForm.meter_groups.water)} is already the main meter
            </p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</EditModal>

<style>
  :global(html, body) {
    overflow: hidden;
  }
</style>
