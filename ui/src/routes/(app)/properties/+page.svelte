<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties, createProperty } from '$lib/api/properties';
  import { getTenants } from '$lib/api/tenants';
  import { getReadings } from '$lib/api/readings';
  import { getBillings } from '$lib/api/billings';
  import type { Property } from '$lib/types/property.types';
  import type { Tenant } from '$lib/types/tenant.types';
  import type { Reading } from '$lib/types/reading.types';
  import type { Billing } from '$lib/types/billing.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  let properties = $state<PaginatedResult<Property>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
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
  let newPropertyForm = $state({
    room_name: '',
    tenant_amount: 1,
    meter_group_id: ''
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

  async function loadProperties() {
    isLoading = true;
    error = '';
    try {
      properties = await getProperties({ limit: 100 });
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
        readings = await getReadings({ meterGroupId: selectedProperty.meter_group_id, limit: 50 });
      } else if (activeTab === 'billings') {
        billings = await getBillings({ propertyId: selectedProperty.id, limit: 50 });
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
    if (!newPropertyForm.room_name.trim() || !newPropertyForm.meter_group_id) {
      error = 'Room name and meter group are required';
      return;
    }

    isLoading = true;
    error = '';
    try {
      const created = await createProperty({
        room_name: newPropertyForm.room_name,
        tenant_amount: newPropertyForm.tenant_amount,
        meter_group_id: newPropertyForm.meter_group_id
      });

      properties.data = [created, ...properties.data];
      selectedProperty = created;
      newPropertyForm = { room_name: '', tenant_amount: 1, meter_group_id: '' };
      showNewPropertyForm = false;
      await loadPropertyDetails();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create property';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="flex h-screen flex-col">
  <div class="space-y-4 border-b border-gray-200 bg-white p-6">
    <div>
      <h1 class="text-3xl font-bold">Properties</h1>
      <p class="mt-1 text-gray-600">{filteredProperties.length} rooms</p>
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
        <input
          type="text"
          placeholder="Search properties..."
          bind:value={searchQuery}
          class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onclick={() => (showNewPropertyForm = !showNewPropertyForm)}
          class="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          disabled={isLoading}
        >
          + New Property
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
              <label for="meter-group-id" class="block text-xs font-medium text-gray-700"
                >Meter Group ID</label
              >
              <input
                id="meter-group-id"
                type="text"
                bind:value={newPropertyForm.meter_group_id}
                placeholder="Meter group ID"
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
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

      <div class="flex-1 overflow-y-auto">
        {#if filteredProperties.length === 0}
          <div class="p-4">
            <EmptyState title="No properties" message="Create a property to get started" />
          </div>
        {:else}
          {#each filteredProperties as property (property.id)}
            <button
              onclick={() => handleSelectProperty(property)}
              class="w-full border-b border-gray-200 px-4 py-3 text-left transition {selectedProperty?.id ===
              property.id
                ? 'bg-blue-100'
                : 'hover:bg-gray-100'}"
            >
              <div class="font-medium text-gray-900">{property.room_name}</div>
              <div class="text-xs text-gray-500">
                {formatDate(toDate(property.created_at))}
              </div>
            </button>
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
            <p class="mt-1 text-sm text-gray-600">
              Meter Group: <span class="font-mono">{selectedProperty.meter_group_id}</span>
            </p>
          </div>

          <!-- Tabs -->
          <div class="border-b border-gray-200">
            <div class="flex">
              {#each ['tenants', 'readings', 'billings', 'history'] as tab}
                <button
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
                        <th class="px-6 py-3 text-left font-semibold text-gray-700"
                          >Tenant Name</th
                        >
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Start Date</th>
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
            {:else if activeTab === 'readings'}
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
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Reading</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each readings.data as reading (reading.id)}
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                          <td class="px-6 py-4 font-mono text-gray-700">
                            {reading.reading_amount.toLocaleString()} kWh
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {formatDate(toDate(reading.reading_date))}
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {formatDate(toDate(reading.created_at))}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {:else if activeTab === 'billings'}
              {#if billings.data.length === 0}
                <div class="p-6">
                  <EmptyState title="No billings" message="Create a billing cycle to generate bills" />
                </div>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700"
                          >Billing ID</th
                        >
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Readings</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each billings.data as billing (billing.id)}
                        <tr class="border-b border-gray-200 hover:bg-gray-50">
                          <td class="px-6 py-4 font-mono text-xs text-gray-600">{billing.id.slice(0, 8)}...</td>
                          <td class="px-6 py-4 text-gray-700">
                            {billing.previous_reading_id.slice(0, 8)}... → {billing.current_reading_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-4 text-gray-600">
                            {formatDate(toDate(billing.created_at))}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {:else if activeTab === 'history'}
              <div class="p-6">
                <EmptyState title="History" message="Property history coming soon" />
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

<style>
  :global(html, body) {
    overflow: hidden;
  }
</style>
