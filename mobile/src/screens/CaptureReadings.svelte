<script lang="ts">
  import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
  import type { MeterGroup } from '../lib/api/meter-groups';
  import type { Property } from '../lib/api/properties';
  import { createReadingsBatch, createSeedReading, listReadings, ocrReadingImage, type CreateReadingRequest, type Reading } from '../lib/api/readings';
  import { getReadingUnit } from '../lib/utils/format';
  import { getUtilityTypeBadgeClasses } from '../lib/utils/utility-colors';
  import { findMeterGroupEntry, needsSeedReading } from '../lib/utils/readings-wizard.util';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let step = $state(1);
  let isLoading = $state(false);
  let error: string | null = $state(null);

  // A captured photo is only ever used in-memory to suggest a reading value via OCR —
  // it's never included in the submit payload.
  let suggestingFor: string | null = $state(null);

  // Step 1: Session setup
  let meterGroups: MeterGroup[] = $state([]);
  let selectedMeterGroupId: string = $state('');
  let readingDate: string = $state(new Date().toISOString().split('T')[0]);
  let meterGroupsLoaded = $state(false);

  // Step 2: Property iteration
  let properties: Property[] = $state([]);
  let propertyReadings: Record<string, { amount: number; image_url: string }> = $state({});
  // Main-meter properties with no reading yet at the meter group's current_version need a
  // baseline "seed" reading (POST /readings/seed) instead of a regular batch reading — this
  // mirrors the web Readings page's shouldSeedReading() auto-detection, so seeding a main
  // meter no longer needs a separate Settings form.
  let propertyNeedsSeed: Record<string, boolean> = $state({});

  const selectedMeterGroup = $derived(meterGroups.find(g => g.id === selectedMeterGroupId));
  const readingUnit = $derived(selectedMeterGroup ? getReadingUnit(selectedMeterGroup.utility_type) : 'kWh');

  // Effects
  $effect(() => {
    if (!meterGroupsLoaded) {
      (async () => {
        try {
          meterGroups = await sessionCache.getOrFetchMeterGroups();
          meterGroupsLoaded = true;
        } catch (e) {
          error = 'Failed to load meter groups';
        }
      })();
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
      const allProperties = await sessionCache.getOrFetchProperties();

      const currentVersion = selectedMeterGroup?.current_version ?? 1;
      const existingReadingsRes = await listReadings({ meterGroupId: selectedMeterGroupId, limit: 1000 });
      const existingReadings: Reading[] = existingReadingsRes.data || [];

      const hasCurrentVersionReading = (propertyId: string) =>
        existingReadings.some((r) => r.property_id === propertyId && r.meter_version === currentVersion);

      // Regular (non-main-meter) properties always show up. Main-meter properties only
      // show up if they haven't been seeded yet at the current meter version — once
      // seeded, their readings are derived automatically at billing-cycle creation.
      properties = (allProperties ?? []).filter((p: Property) => {
        const entry = findMeterGroupEntry(p, selectedMeterGroupId);
        if (!entry) return false;
        if (entry.is_main_meter !== true) return true;
        return !hasCurrentVersionReading(p.id);
      });

      // Initialize readings object + seed flags
      propertyReadings = {};
      propertyNeedsSeed = {};
      properties.forEach((p: Property) => {
        propertyReadings[p.id] = { amount: 0, image_url: '' };
        propertyNeedsSeed[p.id] = needsSeedReading(p, selectedMeterGroupId);
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
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });

      if (!image.base64String) return;

      const dataUrl = `data:image/${image.format};base64,${image.base64String}`;
      propertyReadings[propertyId].image_url = dataUrl;

      // Auto-suggest a reading value from the photo — no separate Suggest button.
      // The photo itself is only kept in the payload later if savePhotos is on;
      // this OCR call works either way since it never persists anything.
      suggestingFor = propertyId;
      try {
        const result = await ocrReadingImage(dataUrl);
        if (result.suggested_reading_amount !== null) {
          propertyReadings[propertyId].amount = result.suggested_reading_amount;
        }
      } catch (e) {
        // Non-fatal — the photo is still captured, user can enter the amount manually.
      } finally {
        suggestingFor = null;
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

      const seedEntries = Object.entries(propertyReadings).filter(([propertyId]) => propertyNeedsSeed[propertyId]);
      const regularEntries = Object.entries(propertyReadings).filter(([propertyId]) => !propertyNeedsSeed[propertyId]);

      const toRequest = ([propertyId, data]: [string, { amount: number; image_url: string }]): CreateReadingRequest => ({
        meter_group_id: selectedMeterGroupId,
        property_id: propertyId,
        reading_amount: data.amount,
        reading_date: `${readingDate}T00:00:00Z`
      });

      const failedSummaries: string[] = [];
      let createdCount = 0;
      const totalCount = seedEntries.length + regularEntries.length;

      // Seed readings establish a main meter's baseline — create individually via
      // POST /readings/seed (not eligible for the regular batch endpoint).
      const seedResults = await Promise.allSettled(
        seedEntries.map(([propertyId, data]) =>
          createSeedReading(toRequest([propertyId, data])).then(() => propertyId)
        )
      );
      seedResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          createdCount += 1;
        } else {
          const propertyId = seedEntries[i][0];
          const name = properties.find((p) => p.id === propertyId)?.room_name ?? propertyId;
          failedSummaries.push(`${name} (seed): ${result.reason?.message || 'Failed to create seed reading'}`);
        }
      });

      if (regularEntries.length > 0) {
        const result = await createReadingsBatch({ readings: regularEntries.map(toRequest) });
        createdCount += result.created.length;
        result.failed.forEach((f) => {
          const name = properties.find((p) => p.id === regularEntries[f.index][0])?.room_name ?? regularEntries[f.index][0];
          failedSummaries.push(`${name}: ${f.error}`);
        });
      }

      if (failedSummaries.length > 0) {
        error = `${createdCount} of ${totalCount} readings saved. ${failedSummaries.length} skipped:\n${failedSummaries.join('\n')}`;
        isLoading = false;
        return;
      }

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
        {#if selectedMeterGroup}
          <span class="inline-block mt-2 rounded-full px-2 py-0.5 text-xs font-medium capitalize {getUtilityTypeBadgeClasses(selectedMeterGroup.utility_type)}">
            {selectedMeterGroup.utility_type}
          </span>
        {/if}
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
          <div class="flex items-center gap-2">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">{property.room_name}</h3>
            {#if propertyNeedsSeed[property.id]}
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" style="background-color: #f5eee5; color: var(--color-accent)">
                Seed (baseline)
              </span>
            {/if}
          </div>

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
            disabled={suggestingFor === property.id}
            class="w-full p-4 border-2 border-dashed rounded-lg font-semibold text-center disabled:opacity-60"
            style={propertyReadings[property.id]?.image_url
              ? `background-color: var(--color-accent); color: white`
              : `border-color: var(--color-border); background-color: #f5eee5; color: var(--color-text-primary)`}
          >
            {#if suggestingFor === property.id}
              Suggesting reading...
            {:else if propertyReadings[property.id]?.image_url}
              📷 Retake
            {:else}
              📷 Capture Photo
            {/if}
          </button>
          {#if propertyReadings[property.id]?.image_url}
            <p class="text-xs" style="color: var(--color-text-secondary)">
              Photo used only to suggest the amount above — it isn't saved.
            </p>
          {/if}

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
          <p class="font-semibold" style="color: var(--color-text-primary)">
            {property.room_name}
            {#if propertyNeedsSeed[property.id]}
              <span class="ml-1 text-xs font-medium" style="color: var(--color-accent)">(seed baseline)</span>
            {/if}
          </p>
          <p class="text-sm" style="color: var(--color-text-secondary)">
            Amount: <strong style="color: var(--color-accent)">{propertyReadings[property.id]?.amount}</strong>
            {#if propertyReadings[property.id]?.image_url}
              <span class="ml-2" style="color: var(--color-text-tertiary)">📷 Photo used for suggestion only</span>
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
