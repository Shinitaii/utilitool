<script lang="ts">
  import { listReadings, type Reading } from '../lib/api/readings';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { listProperties, type Property } from '../lib/api/properties';
  import { getReadingUnit } from '../lib/utils/format';
  import { formatDate } from '../lib/utils/timestamp';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let readings: Reading[] = $state([]);
  let meterGroups: MeterGroup[] = $state([]);
  let properties: Property[] = $state([]);
  let propertyNames: Record<string, string> = $state({});
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let selectedReading: Reading | null = $state(null);
  let utilityFilter: 'all' | 'electricity' | 'water' = $state('all');
  let selectedPropertyId: string = $state('');

  const meterGroupMap = $derived(
    Object.fromEntries(meterGroups.map(g => [g.id, g]))
  );

  const utilityFilteredReadings = $derived(
    utilityFilter === 'all'
      ? readings
      : readings.filter(r => meterGroupMap[r.meter_group_id]?.utility_type === utilityFilter)
  );

  const availableProperties = $derived(() => {
    const ids = new Set(utilityFilteredReadings.map(r => r.property_id));
    return properties.filter(p => ids.has(p.id));
  });

  const filteredReadings = $derived(
    selectedPropertyId
      ? utilityFilteredReadings.filter(r => r.property_id === selectedPropertyId)
      : utilityFilteredReadings
  );

  $effect(async () => {
    try {
      // Fetch readings (always fresh, not cached)
      const readingsRes = await listReadings();
      readings = readingsRes.data || [];

      // Fetch meter groups from cache or API
      let cachedMeterGroups = sessionCache.getMeterGroups();
      if (!cachedMeterGroups) {
        const meterGroupsRes = await listMeterGroups();
        cachedMeterGroups = meterGroupsRes.data || [];
        sessionCache.setMeterGroups(cachedMeterGroups);
      }
      meterGroups = cachedMeterGroups;

      // Fetch properties from cache or API
      let cachedProperties = sessionCache.getProperties();
      if (!cachedProperties) {
        const propertiesRes = await listProperties();
        cachedProperties = propertiesRes.data || [];
        sessionCache.setProperties(cachedProperties);
      }
      properties = cachedProperties;

      const names: Record<string, string> = {};
      properties.forEach((p: Property) => { names[p.id] = p.room_name; });
      propertyNames = names;
    } catch (e) {
      error = 'Failed to load readings';
    } finally {
      isLoading = false;
    }
  });

  // Reset property filter when utility type changes
  $effect(() => {
    utilityFilter;
    selectedPropertyId = '';
  });

  function getUnit(meterGroupId: string): string {
    const utilityType = meterGroupMap[meterGroupId]?.utility_type || 'electricity';
    return getReadingUnit(utilityType);
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 border-b bg-white" style="border-color: var(--color-border)">
    <h1 class="text-xl font-bold mb-3" style="color: var(--color-text-primary)">Reading History</h1>

    <!-- Utility type tabs -->
    <div class="flex gap-2 mb-3">
      {#each [['all', 'All'], ['electricity', 'Electricity'], ['water', 'Water']] as [value, label]}
        <button
          onclick={() => { utilityFilter = value as typeof utilityFilter; }}
          class="px-3 py-1 rounded-full text-sm font-semibold border transition"
          style={utilityFilter === value
            ? 'background-color: var(--color-accent); color: white; border-color: var(--color-accent)'
            : 'background-color: transparent; color: var(--color-text-secondary); border-color: var(--color-border)'}
        >
          {label}
        </button>
      {/each}
    </div>

    <!-- Property filter -->
    {#if availableProperties().length > 0}
      <select
        bind:value={selectedPropertyId}
        class="input-base w-full text-sm"
      >
        <option value="">All properties</option>
        {#each availableProperties() as property (property.id)}
          <option value={property.id}>{property.room_name}</option>
        {/each}
      </select>
    {/if}
  </div>

  {#if error}
    <div class="p-3 rounded-lg text-sm m-4" style="background-color: #fde5e0; color: var(--color-status-alert); border: 1px solid var(--color-status-alert)">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">Loading...</div>
  {:else if filteredReadings.length === 0}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">No readings found</div>
  {:else}
    <div class="p-4 space-y-3">
      {#each filteredReadings as reading (reading.id)}
        <button
          onclick={() => (selectedReading = selectedReading?.id === reading.id ? null : reading)}
          class="card-base w-full text-left hover:opacity-90 transition"
        >
          <div class="flex justify-between items-start mb-2">
            <div>
              <h3 class="font-semibold" style="color: var(--color-text-primary)">
                {propertyNames[reading.property_id] || 'Unknown'}
              </h3>
              <p class="text-xs mt-0.5" style="color: var(--color-text-secondary)">
                {meterGroupMap[reading.meter_group_id]?.meter_name || ''}
                {#if meterGroupMap[reading.meter_group_id]?.utility_type}
                  · {meterGroupMap[reading.meter_group_id].utility_type}
                {/if}
              </p>
            </div>
            <span class="text-lg font-bold" style="color: var(--color-accent)">
              {reading.reading_amount} {getUnit(reading.meter_group_id)}
            </span>
          </div>
          <p class="text-xs" style="color: var(--color-text-secondary)">{formatDate(reading.reading_date)}</p>

          {#if selectedReading?.id === reading.id}
            <div class="mt-3 pt-3 border-t space-y-2 text-sm" style="border-color: var(--color-border)">
              {#if reading.image_url}
                <div class="mb-2">
                  <img src={reading.image_url} alt="Reading" class="w-full h-32 object-cover rounded" />
                </div>
              {/if}
              <p style="color: var(--color-text-secondary)">
                <strong>Created:</strong> {formatDate(reading.created_at)}
              </p>
              <p style="color: var(--color-text-secondary)">
                <strong>Meter Version:</strong> {reading.meter_version}
              </p>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <BottomNav active="history" />
</div>
