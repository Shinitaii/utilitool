<script lang="ts">
  import { Camera } from '@capacitor/camera';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { listProperties, type Property } from '../lib/api/properties';
  import { createReadingsBatch, type CreateReadingRequest } from '../lib/api/readings';
  import { getReadingUnit } from '../lib/utils/format';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let step = $state(1);
  let isLoading = $state(false);
  let error: string | null = $state(null);

  // Step 1: Session setup
  let meterGroups: MeterGroup[] = $state([]);
  let selectedMeterGroupId: string = $state('');
  let readingDate: string = $state(new Date().toISOString().split('T')[0]);
  let meterGroupsLoaded = $state(false);

  // Step 2: Property iteration
  let properties: Property[] = $state([]);
  let propertyReadings: Record<string, { amount: number; image_url: string }> = $state({});

  const selectedMeterGroup = $derived(meterGroups.find(g => g.id === selectedMeterGroupId));
  const readingUnit = $derived(selectedMeterGroup ? getReadingUnit(selectedMeterGroup.utility_type) : 'kWh');

  // Effects
  $effect(async () => {
    if (!meterGroupsLoaded) {
      try {
        let cached = sessionCache.getMeterGroups();
        if (!cached) {
          const res = await listMeterGroups();
          cached = res.data || [];
          sessionCache.setMeterGroups(cached);
        }
        meterGroups = cached;
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
      let allProperties = sessionCache.getProperties();
      if (!allProperties) {
        const res = await listProperties();
        allProperties = res.data || [];
        sessionCache.setProperties(allProperties);
      }
      // Filter properties that have the selected meter group
      properties = allProperties.filter((p: Property) =>
        Object.values(p.meter_groups).some(
          (entry) => entry.meter_group_id === selectedMeterGroupId
        )
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

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 flex items-center gap-3 bg-white border-b" style="border-color: var(--color-border); color: var(--color-text-primary)">
    <button onclick={goBack} class="text-xl" style="color: var(--color-text-primary)">←</button>
    <h1 class="text-xl font-bold">New Reading Session</h1>
  </div>

  {#if error}
    <div class="p-4 m-4 rounded border" style="background-color: #fff0f0; border-color: var(--color-status-alert); color: var(--color-status-alert)">
      {error}
    </div>
  {/if}

  <!-- Step 1: Session Setup -->
  {#if step === 1}
    <div class="p-4 space-y-4">
      <div>
        <label for="meter-group" class="label-base mb-2">
          Select Meter Group
        </label>
        <select
          id="meter-group"
          bind:value={selectedMeterGroupId}
          class="input-base w-full"
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
        <label for="reading-date" class="label-base mb-2">
          Reading Date
        </label>
        <input
          id="reading-date"
          type="date"
          bind:value={readingDate}
          class="input-base w-full"
        />
      </div>

      <button
        onclick={proceedToStep2}
        disabled={isLoading}
        class="btn-primary w-full py-3 text-base font-semibold rounded-lg disabled:opacity-50"
      >
        {isLoading ? 'Loading...' : 'Next'}
      </button>
    </div>
  {/if}

  <!-- Step 2: Property Cards & Photo Capture -->
  {#if step === 2}
    <div class="p-4 space-y-4">
      <p class="text-sm" style="color: var(--color-text-secondary)">
        Reading date: <strong>{readingDate}</strong>
      </p>

      {#each properties as property (property.id)}
        <div class="card-base space-y-3">
          <h3 class="font-semibold" style="color: var(--color-text-primary)">{property.room_name}</h3>

          {#if propertyReadings[property.id]?.image_url}
            <div class="relative w-full h-32 bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={propertyReadings[property.id].image_url}
                alt="Meter reading"
                class="w-full h-full object-cover"
              />
              <button
                onclick={() => (propertyReadings[property.id].image_url = '')}
                class="absolute top-2 right-2 text-white px-2 py-1 rounded text-sm"
                style="background-color: var(--color-status-alert)"
              >
                Remove
              </button>
            </div>
          {/if}

          <button
            onclick={() => capturePhoto(property.id)}
            class="w-full p-4 border-2 border-dashed rounded-lg font-semibold text-center"
            style={propertyReadings[property.id]?.image_url
              ? `background-color: var(--color-accent); color: white`
              : `border-color: var(--color-border); background-color: #f5eee5; color: var(--color-text-primary)`}
          >
            {propertyReadings[property.id]?.image_url ? '📷 Retake' : '📷 Capture Photo'}
          </button>

          <div>
            <label for={`amount-${property.id}`} class="label-base mb-1">
              Reading Amount ({readingUnit})
            </label>
            <input
              id={`amount-${property.id}`}
              type="number"
              bind:value={propertyReadings[property.id].amount}
              placeholder="0"
              class="input-base w-full"
            />
          </div>
        </div>
      {/each}

      <button
        onclick={proceedToStep3}
        disabled={isLoading}
        class="btn-primary w-full py-3 text-base font-semibold rounded-lg disabled:opacity-50"
      >
        Review & Submit
      </button>
    </div>
  {/if}

  <!-- Step 3: Confirmation -->
  {#if step === 3}
    <div class="p-4 space-y-4">
      <div class="card-base">
        <p class="text-sm" style="color: var(--color-text-primary)">
          <strong>Ready to submit {properties.length} readings</strong>
        </p>
        <p class="text-xs mt-1" style="color: var(--color-text-secondary)">
          Reading date: {readingDate}
        </p>
      </div>

      {#each properties as property (property.id)}
        <div class="card-base">
          <p class="font-semibold" style="color: var(--color-text-primary)">{property.room_name}</p>
          <p class="text-sm" style="color: var(--color-text-secondary)">
            Amount: <strong style="color: var(--color-accent)">{propertyReadings[property.id]?.amount}</strong>
            {#if propertyReadings[property.id]?.image_url}
              <span class="ml-2" style="color: var(--color-status-good)">📷 Photo attached</span>
            {/if}
          </p>
        </div>
      {/each}

      <div class="flex gap-2">
        <button
          onclick={() => (step = 2)}
          disabled={isLoading}
          class="flex-1 btn-secondary py-3 font-semibold rounded-lg"
        >
          Back
        </button>
        <button
          onclick={submitReadings}
          disabled={isLoading}
          class="flex-1 btn-primary py-3 text-base font-semibold rounded-lg disabled:opacity-50"
        >
          {isLoading ? 'Submitting...' : '✓ Submit'}
        </button>
      </div>
    </div>
  {/if}

  <BottomNav active="home" />
</div>
