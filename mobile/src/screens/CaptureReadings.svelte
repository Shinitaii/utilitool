<script lang="ts">
  import { Camera } from '@capacitor/camera';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { listProperties, type Property } from '../lib/api/properties';
  import { createReadingsBatch, type CreateReadingRequest } from '../lib/api/readings';

  let step = $state(1);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Step 1: Session setup
  let meterGroups = $state<MeterGroup[]>([]);
  let selectedMeterGroupId = $state<string>('');
  let readingDate = $state<string>(new Date().toISOString().split('T')[0]);
  let meterGroupsLoaded = $state(false);

  // Step 2: Property iteration
  let properties = $state<Property[]>([]);
  let propertyReadings = $state<Record<string, { amount: number; image_url: string }>({});

  // Effects
  $effect.pre(async () => {
    if (!meterGroupsLoaded) {
      try {
        const res = await listMeterGroups();
        meterGroups = res.data || [];
        meterGroupsLoaded = true;
      } catch (e) {
        error = 'Failed to load meter groups';
      }
    }
  });

  async function proceedToStep2() {
    if (!selectedMeterGroupId) {
      error = 'Please select a meter group';
      return;
    }
    if (!readingDate) {
      error = 'Please select a reading date';
      return;
    }

    try {
      isLoading = true;
      error = null;
      const res = await listProperties();
      // Filter properties that have the selected meter group
      properties = (res.data || []).filter((p: Property) =>
        selectedMeterGroupId in p.meter_groups
      );

      // Initialize readings object
      propertyReadings = {};
      properties.forEach((p: Property) => {
        propertyReadings[p.id] = { amount: 0, image_url: '' };
      });

      step = 2;
    } catch (e) {
      error = 'Failed to load properties';
    } finally {
      isLoading = false;
    }
  }

  async function capturePhoto(propertyId: string) {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: 'base64',
        promptLabelPicture: 'Select photo'
      });

      // In production, upload to Cloud Storage and get URL
      // For now, use data URL
      if (image.base64String) {
        propertyReadings[propertyId].image_url = `data:image/${image.format};base64,${image.base64String}`;
      }
    } catch (e) {
      error = 'Failed to capture photo';
    }
  }

  function proceedToStep3() {
    // Validate all readings have amounts
    for (const propId of Object.keys(propertyReadings)) {
      if (propertyReadings[propId].amount <= 0) {
        error = `Please enter reading for ${properties.find(p => p.id === propId)?.room_name}`;
        return;
      }
    }
    error = null;
    step = 3;
  }

  async function submitReadings() {
    try {
      isLoading = true;
      error = null;

      const readings: CreateReadingRequest[] = Object.entries(propertyReadings).map(
        ([propertyId, data]) => ({
          meter_group_id: selectedMeterGroupId,
          property_id: propertyId,
          reading_amount: data.amount,
          reading_date: `${readingDate}T00:00:00Z`,
          image_url: data.image_url || undefined
        })
      );

      await createReadingsBatch({ readings });

      // Success - return to home
      window.location.hash = '#/home';
    } catch (e: any) {
      error = e.message || 'Failed to submit readings';
    } finally {
      isLoading = false;
    }
  }

  function goBack() {
    if (step === 1) {
      window.location.hash = '#/home';
    } else {
      step -= 1;
    }
  }
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <div class="bg-blue-600 text-white p-4 flex items-center gap-3">
    <button onclick={goBack} class="text-xl">←</button>
    <h1 class="text-xl font-bold">New Reading Session</h1>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 p-4 m-4 rounded">
      {error}
    </div>
  {/if}

  <!-- Step 1: Session Setup -->
  {#if step === 1}
    <div class="p-4 space-y-4">
      <div>
        <label for="meter-group" class="block text-sm font-medium text-gray-700 mb-2">
          Select Meter Group
        </label>
        <select
          id="meter-group"
          bind:value={selectedMeterGroupId}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Choose meter group --</option>
          {#each meterGroups as group (group.id)}
            <option value={group.id}>
              {group.meter_name} ({group.utility_type})
            </option>
          {/each}
        </select>
      </div>

      <div>
        <label for="reading-date" class="block text-sm font-medium text-gray-700 mb-2">
          Reading Date
        </label>
        <input
          id="reading-date"
          type="date"
          bind:value={readingDate}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        onclick={proceedToStep2}
        disabled={isLoading}
        class="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
      >
        {isLoading ? 'Loading...' : 'Next'}
      </button>
    </div>
  {/if}

  <!-- Step 2: Property Cards & Photo Capture -->
  {#if step === 2}
    <div class="p-4 space-y-4">
      <p class="text-sm text-gray-600">
        Reading date: <strong>{readingDate}</strong>
      </p>

      {#each properties as property (property.id)}
        <div class="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
          <h3 class="font-semibold text-gray-900">{property.room_name}</h3>

          {#if propertyReadings[property.id]?.image_url}
            <div class="relative w-full h-32 bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={propertyReadings[property.id].image_url}
                alt="Meter reading"
                class="w-full h-full object-cover"
              />
              <button
                onclick={() => (propertyReadings[property.id].image_url = '')}
                class="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-sm"
              >
                Remove
              </button>
            </div>
          {/if}

          <button
            onclick={() => capturePhoto(property.id)}
            class="w-full px-3 py-2 bg-gray-200 text-gray-900 rounded-lg font-semibold hover:bg-gray-300"
          >
            {propertyReadings[property.id]?.image_url ? '📷 Retake' : '📷 Capture Photo'}
          </button>

          <div>
            <label for={`amount-${property.id}`} class="block text-sm font-medium text-gray-700 mb-1">
              Reading Amount (kWh/m³)
            </label>
            <input
              id={`amount-${property.id}`}
              type="number"
              bind:value={propertyReadings[property.id].amount}
              placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      {/each}

      <button
        onclick={proceedToStep3}
        disabled={isLoading}
        class="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
      >
        Review & Submit
      </button>
    </div>
  {/if}

  <!-- Step 3: Confirmation -->
  {#if step === 3}
    <div class="p-4 space-y-4">
      <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg">
        <p class="text-sm text-blue-900">
          <strong>Ready to submit {properties.length} readings</strong>
        </p>
        <p class="text-xs text-blue-800 mt-1">
          Reading date: {readingDate}
        </p>
      </div>

      {#each properties as property (property.id)}
        <div class="bg-white p-3 rounded-lg border border-gray-200">
          <p class="font-semibold text-gray-900">{property.room_name}</p>
          <p class="text-sm text-gray-600">
            Amount: <strong>{propertyReadings[property.id]?.amount}</strong>
            {#if propertyReadings[property.id]?.image_url}
              <span class="ml-2 text-green-600">📷 Photo attached</span>
            {/if}
          </p>
        </div>
      {/each}

      <button
        onclick={submitReadings}
        disabled={isLoading}
        class="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
      >
        {isLoading ? 'Submitting...' : '✓ Submit Readings'}
      </button>
    </div>
  {/if}

  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>
</div>
