<script lang="ts">
  import { page } from '$app/stores';
  import { clearAllCaches } from '$lib/api/cache';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getProperties } from '$lib/api/properties';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Property } from '$lib/types/property.types';
  import { createSeedReading, getReadings } from '$lib/api/readings';
  import { uploadToStorage } from '$lib/utils/firebase-storage';
  import { authStore } from '$lib/stores/auth.svelte';

  let isClearingCache = $state(false);
  let cacheCleared = $state(false);
  let error = $state('');

  // Seed readings form state
  let seedMeterGroups = $state<MeterGroup[]>([]);
  let seedProperties = $state<Property[]>([]);
  let selectedSeedMeterGroupId = $state('');
  let selectedSeedPropertyId = $state('');
  let seedReadingAmount = $state<number | null>(null);
  let seedReadingDate = $state('');
  let seedImageFile = $state<File | null>(null);
  let seedImageUrl = $state('');
  let isSubmittingSeed = $state(false);
  let seedFormError = $state('');
  let seedFormSuccess = $state(false);
  let seedUploadingImage = $state(false);

  async function handleClearAllCaches() {
    isClearingCache = true;
    error = '';
    cacheCleared = false;

    try {
      await clearAllCaches();
      cacheCleared = true;
      setTimeout(() => {
        cacheCleared = false;
      }, 3000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to clear cache';
    } finally {
      isClearingCache = false;
    }
  }

  async function handleSignOut() {
    error = '';
    try {
      await authStore.logout();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to sign out';
    }
  }

  async function loadSeedMeterGroups() {
    try {
      const result = await getMeterGroups();
      seedMeterGroups = result.data || [];
      selectedSeedMeterGroupId = '';
      seedProperties = [];
      selectedSeedPropertyId = '';
    } catch (err) {
      seedFormError = err instanceof Error ? err.message : 'Failed to load meter groups';
    }
  }

  async function loadSeedProperties() {
    if (!selectedSeedMeterGroupId) {
      seedProperties = [];
      return;
    }

    try {
      seedFormError = '';

      // Get all properties for this meter group
      const result = await getProperties();
      const allProperties = result.data || [];

      // Filter to main meters only for the selected meter group
      const mainMeterProperties = allProperties.filter((p) => {
        const meterGroupEntry = Object.entries(p.meter_groups).find(
          ([_, entry]) => {
            // Handle both structured entry and string for backward compatibility
            if (typeof entry === 'string') return false;
            return entry.meter_group_id === selectedSeedMeterGroupId;
          }
        );
        return meterGroupEntry && typeof meterGroupEntry[1] === 'object' && meterGroupEntry[1].is_main_meter === true;
      });

      // Get current meter version from the selected meter group
      const meterGroup = seedMeterGroups.find(g => g.id === selectedSeedMeterGroupId);
      const currentVersion = meterGroup?.current_version || 1;

      // Fetch existing readings for this meter group
      const readingsResponse = await getReadings({ meterGroupId: selectedSeedMeterGroupId, limit: 1000 });
      const existingReadings = readingsResponse.data || [];

      // Filter out properties that already have a reading for this version
      const unseededProperties = mainMeterProperties.filter((p) => {
        const hasExistingReading = existingReadings.some(
          (r) => r.property_id === p.id && r.meter_version === currentVersion
        );
        return !hasExistingReading;
      });

      seedProperties = unseededProperties;
      selectedSeedPropertyId = '';

      // If none available, show message
      if (unseededProperties.length === 0) {
        seedFormError = 'All main meters for this meter group have been seeded';
      }
    } catch (err) {
      seedFormError = err instanceof Error ? err.message : 'Failed to load properties';
    }
  }

  async function uploadSeedImage(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    seedImageFile = file;
    seedUploadingImage = true;
    seedFormError = '';

    try {
      // Store data URL for immediate preview
      const reader = new FileReader();
      reader.onload = (loadEvent: any) => {
        seedImageUrl = loadEvent.target.result;
      };
      reader.readAsDataURL(file);

      // Upload to storage in background
      const url = await uploadToStorage(file, `seed-readings/${Date.now()}_${file.name}`);
      seedImageUrl = url;
    } catch (err) {
      seedFormError = err instanceof Error ? err.message : 'Failed to upload image';
      seedImageFile = null;
      seedImageUrl = '';
    } finally {
      seedUploadingImage = false;
    }
  }

  async function submitSeedReadings() {
    seedFormError = '';
    seedFormSuccess = false;

    if (!selectedSeedMeterGroupId || !selectedSeedPropertyId || !seedReadingAmount || !seedReadingDate) {
      seedFormError = 'Please fill in all required fields';
      return;
    }

    isSubmittingSeed = true;

    try {
      // Convert date string to ISO format for API
      const dateObj = new Date(`${seedReadingDate}T00:00:00Z`);

      await createSeedReading({
        meter_group_id: selectedSeedMeterGroupId,
        property_id: selectedSeedPropertyId,
        reading_amount: seedReadingAmount,
        reading_date: dateObj.toISOString(),
        image_url: seedImageUrl || undefined
      });

      seedFormSuccess = true;
      seedReadingAmount = null;
      seedReadingDate = '';
      seedImageFile = null;
      seedImageUrl = '';
      selectedSeedPropertyId = '';

      setTimeout(() => {
        seedFormSuccess = false;
      }, 3000);
    } catch (err) {
      seedFormError = err instanceof Error ? err.message : 'Failed to create seed reading';
    } finally {
      isSubmittingSeed = false;
    }
  }
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-3xl font-bold">Settings</h1>
    <p class="text-gray-600">Manage your account and application settings</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if cacheCleared}
    <div class="rounded-lg bg-green-50 p-4 text-sm text-green-700">
      ✓ All caches cleared successfully
    </div>
  {/if}

  <!-- TIER 1: ACCOUNT -->
  <section>
    <h2 class="text-2xl font-bold text-gray-900 mb-4">Account</h2>
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">User Profile</h3>
      <p class="text-sm text-gray-600 mb-4">
        Email: <span class="font-medium">{$authStore.user?.email || 'Not signed in'}</span>
      </p>
      <button
        onclick={handleSignOut}
        class="rounded bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700"
      >
        Sign Out
      </button>
    </div>
  </section>

  <!-- TIER 2: READING OPERATIONS -->
  <section>
    <h2 class="text-2xl font-bold text-gray-900 mb-4">Reading Operations</h2>
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Seed Readings</h3>
      <p class="text-sm text-gray-600 mb-6">
        Create initial meter readings for properties. Use this to seed historical data or bootstrap new properties.
      </p>

      {#if seedFormError}
        <div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {seedFormError}
        </div>
      {/if}

      {#if seedFormSuccess}
        <div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700">
          ✓ Seed reading created successfully
        </div>
      {/if}

      <div class="space-y-6">
        <!-- Meter Group Selection -->
        <div>
          <label for="seed-meter-group" class="block text-sm font-medium text-gray-700 mb-2">
            Meter Group <span class="text-red-600">*</span>
          </label>
          <button
            onclick={loadSeedMeterGroups}
            class="w-full rounded border border-gray-300 bg-white px-4 py-2 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {selectedSeedMeterGroupId
              ? seedMeterGroups.find((mg) => mg.id === selectedSeedMeterGroupId)?.meter_name || 'Select meter group'
              : 'Click to select meter group'}
          </button>

          {#if seedMeterGroups.length > 0 && !selectedSeedMeterGroupId}
            <div class="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
              <div class="space-y-2">
                {#each seedMeterGroups as mg (mg.id)}
                  <button
                    onclick={() => {
                      selectedSeedMeterGroupId = mg.id;
                      loadSeedProperties();
                    }}
                    class="w-full rounded px-3 py-2 text-left text-sm font-medium hover:bg-gray-200"
                  >
                    {mg.meter_name} ({mg.utility_type})
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Property Selection -->
        <div>
          <label for="seed-property" class="block text-sm font-medium text-gray-700 mb-2">
            Property <span class="text-red-600">*</span>
          </label>
          <button
            disabled={!selectedSeedMeterGroupId}
            class="w-full rounded border border-gray-300 bg-white px-4 py-2 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            {selectedSeedPropertyId
              ? seedProperties.find((p) => p.id === selectedSeedPropertyId)?.room_name || 'Select property'
              : 'Select meter group first'}
          </button>

          {#if seedProperties.length > 0 && !selectedSeedPropertyId}
            <div class="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
              <div class="space-y-2">
                {#each seedProperties as prop (prop.id)}
                  <button
                    onclick={() => {
                      selectedSeedPropertyId = prop.id;
                    }}
                    class="w-full rounded px-3 py-2 text-left text-sm font-medium hover:bg-gray-200"
                  >
                    {prop.room_name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Reading Date -->
        <div>
          <label for="seed-reading-date" class="block text-sm font-medium text-gray-700 mb-2">
            Reading Date <span class="text-red-600">*</span>
          </label>
          <input
            id="seed-reading-date"
            type="date"
            bind:value={seedReadingDate}
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <!-- Reading Amount -->
        <div>
          <label for="seed-reading-amount" class="block text-sm font-medium text-gray-700 mb-2">
            Reading Amount <span class="text-red-600">*</span>
          </label>
          <input
            id="seed-reading-amount"
            type="number"
            bind:value={seedReadingAmount}
            placeholder="Enter reading amount"
            step="0.01"
            min="0"
            class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <!-- Image Upload (Optional) -->
        <div>
          <label for="seed-image-upload" class="block text-sm font-medium text-gray-700 mb-2">
            Meter Image (optional)
          </label>
          <div class="rounded border border-dashed border-gray-300 p-4">
            {#if seedImageUrl}
              <div class="mb-4">
                <img src={seedImageUrl} alt="Uploaded meter image" class="h-32 w-auto rounded" />
              </div>
            {/if}

            <input
              id="seed-image-upload"
              type="file"
              accept="image/*"
              onchange={uploadSeedImage}
              disabled={seedUploadingImage}
              class="w-full text-sm"
            />

            {#if seedUploadingImage}
              <p class="mt-2 text-sm text-gray-500">Uploading image...</p>
            {/if}
          </div>
        </div>

        <!-- Submit Button -->
        <button
          onclick={submitSeedReadings}
          disabled={isSubmittingSeed || !selectedSeedMeterGroupId || !selectedSeedPropertyId || !seedReadingAmount || !seedReadingDate}
          class="w-full rounded bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmittingSeed ? 'Creating seed reading...' : 'Create Seed Reading'}
        </button>
      </div>
    </div>
  </section>

  <!-- TIER 3: SYSTEM -->
  <section>
    <h2 class="text-2xl font-bold text-gray-900 mb-4">System</h2>
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Cache Management</h3>
      <p class="text-sm text-gray-600 mb-4">
        Clear all cached data to refresh information from the server. This will clear caches for all features in parallel.
      </p>
      <button
        onclick={handleClearAllCaches}
        disabled={isClearingCache}
        class="rounded bg-amber-600 text-white px-4 py-2 font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {isClearingCache ? 'Clearing caches...' : 'Clear All Caches'}
      </button>
    </div>
  </section>

  <!-- TIER 4: CONFIGURATION -->
  <section>
    <h2 class="text-2xl font-bold text-gray-900 mb-4">Configuration</h2>
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Payment QR Code Card -->
      <a
        href="/settings/payment"
        class="rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <h3 class="text-lg font-semibold text-gray-900">Payment QR Code</h3>
        <p class="mt-2 text-sm text-gray-600">
          Configure payment QR code for tenant receipts
        </p>
        <div class="mt-4 text-sm font-medium" style="color: var(--color-accent)">
          Go to settings →
        </div>
      </a>

      <!-- Users Management Card -->
      <a
        href="/settings/users"
        class="rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <h3 class="text-lg font-semibold text-gray-900">Users</h3>
        <p class="mt-2 text-sm text-gray-600">
          Create and manage user accounts
        </p>
        <div class="mt-4 text-sm font-medium" style="color: var(--color-accent)">
          Go to settings →
        </div>
      </a>
    </div>
  </section>
</div>
