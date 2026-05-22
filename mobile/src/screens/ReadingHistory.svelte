<script lang="ts">
  import { listReadings, type Reading } from '../lib/api/readings';
  import { getProperty } from '../lib/api/properties';

  let readings: Reading[] = $state([]);
  let propertyNames: Record<string, string> = $state({});
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let selectedReading: Reading | null = $state(null);

  $effect.pre(async () => {
    try {
      const res = await listReadings();
      readings = res.data || [];

      // Fetch property names for each reading
      const names: Record<string, string> = {};
      const propertyIds = new Set(readings.map(r => r.property_id));

      for (const propId of propertyIds) {
        try {
          const prop = await getProperty(propId);
          names[propId] = prop.room_name;
        } catch (e) {
          names[propId] = `Property ${propId.slice(0, 6)}`;
        }
      }

      propertyNames = names;
    } catch (e) {
      error = 'Failed to load readings';
    } finally {
      isLoading = false;
    }
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 border-b bg-white" style="border-color: var(--color-border)">
    <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Reading History</h1>
  </div>

  {#if error}
    <div class="p-3 rounded-lg text-sm m-4" style="background-color: #fde5e0; color: var(--color-status-alert); border: 1px solid var(--color-status-alert)">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">Loading...</div>
  {:else if readings.length === 0}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">No readings found</div>
  {:else}
    <div class="p-4 space-y-3">
      {#each readings as reading (reading.id)}
        <button
          onclick={() => (selectedReading = selectedReading?.id === reading.id ? null : reading)}
          class="card-base w-full text-left hover:opacity-90 transition"
        >
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">
              {propertyNames[reading.property_id] || 'Loading...'}
            </h3>
            <span class="text-lg font-bold" style="color: var(--color-accent)">{reading.reading_amount}</span>
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

  <div class="fixed bottom-0 left-0 right-0 border-t flex justify-around" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <button onclick={() => { window.location.hash = '#/home'; }} class="flex-1 py-3 text-center font-semibold border-none cursor-pointer" style="color: var(--color-text-secondary)">🏠 Home</button>
    <button onclick={() => { window.location.hash = '#/history'; }} class="flex-1 py-3 text-center font-semibold border-none cursor-pointer" style="color: var(--color-accent)">📋 History</button>
    <button onclick={() => { window.location.hash = '#/billings'; }} class="flex-1 py-3 text-center font-semibold border-none cursor-pointer" style="color: var(--color-text-secondary)">💰 Billings</button>
  </div>
</div>
