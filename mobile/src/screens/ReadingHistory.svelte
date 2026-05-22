<script lang="ts">
  import { listReadings, type Reading } from '../lib/api/readings';
  import { getProperty } from '../lib/api/properties';

  let readings = $state<Reading[]>([]);
  let propertyNames = $state<Record<string, string>>({});
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedReading = $state<Reading | null>(null);

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

<div class="min-h-screen bg-gray-50 pb-20">
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-xl font-bold">Reading History</h1>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 p-4 m-4 rounded">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="p-4 text-center text-gray-500 py-8">Loading...</div>
  {:else if readings.length === 0}
    <div class="p-4 text-center text-gray-500 py-8">No readings found</div>
  {:else}
    <div class="p-4 space-y-3">
      {#each readings as reading (reading.id)}
        <button
          onclick={() => (selectedReading = selectedReading?.id === reading.id ? null : reading)}
          class="w-full bg-white p-4 rounded-lg border border-gray-200 text-left hover:border-blue-300 transition"
        >
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold text-gray-900">
              {propertyNames[reading.property_id] || 'Loading...'}
            </h3>
            <span class="text-lg font-bold text-blue-600">{reading.reading_amount}</span>
          </div>
          <p class="text-xs text-gray-500">{formatDate(reading.reading_date)}</p>

          {#if selectedReading?.id === reading.id}
            <div class="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
              {#if reading.image_url}
                <div class="mb-2">
                  <img src={reading.image_url} alt="Reading" class="w-full h-32 object-cover rounded" />
                </div>
              {/if}
              <p class="text-gray-600">
                <strong>Created:</strong> {formatDate(reading.created_at)}
              </p>
              <p class="text-gray-600">
                <strong>Meter Version:</strong> {reading.meter_version}
              </p>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-blue-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>
</div>
