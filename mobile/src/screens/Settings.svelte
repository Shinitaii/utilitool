<script lang="ts">
  import { auth } from '../firebase';
  import { signOut } from 'firebase/auth';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';
  import { Camera } from '@capacitor/camera';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { listProperties, type Property } from '../lib/api/properties';
  import { createSeedReading } from '../lib/api/readings';
  import { listReadings, type Reading } from '../lib/api/readings';
  import { getReadingUnit } from '../lib/utils/format';

  let showSeedForm = $state(false);
  let isSigningOut = $state(false);
  let error: string | null = $state(null);

  let seedMeterGroups: MeterGroup[] = $state([]);
  let seedSelectedMeterGroupId: string = $state('');
  let seedReadingDate: string = $state(new Date().toISOString().split('T')[0]);
  let seedProperties: Property[] = $state([]);
  let seedReadings: Record<string, { amount: number; image_url: string }> = $state({});
  let seedIsLoading = $state(false);
  let seedError: string | null = $state(null);
  let seedMeterGroupsLoaded = $state(false);

  async function handleSignOut() {
    try {
      isSigningOut = true;
      await signOut(auth);
      sessionCache.clear();
      window.location.hash = '#/login';
    } catch (e: any) {
      error = e.message || 'Failed to sign out';
    } finally {
      isSigningOut = false;
    }
  }

  function clearCache() {
    sessionCache.clear();
    error = null;
  }

  // Load meter groups on first open
  $effect(() => {
    if (showSeedForm && !seedMeterGroupsLoaded) {
      (async () => {
        try {
          let cached = sessionCache.getMeterGroups();
          if (!cached) {
            const res = await listMeterGroups();
            cached = res.data || [];
            sessionCache.setMeterGroups(cached);
          }
          seedMeterGroups = cached;
        } catch (e) {
          seedError = 'Failed to load meter groups';
        } finally {
          seedMeterGroupsLoaded = true;
        }
      })();
    }
  });

  async function loadSeedProperties() {
    if (!seedSelectedMeterGroupId) {
      seedError = 'Please select a meter group';
      return;
    }

    try {
      seedIsLoading = true;
      seedError = null;

      const meterGroup = seedMeterGroups.find(g => g.id === seedSelectedMeterGroupId);
      if (!meterGroup) {
        seedError = 'Meter group not found';
        return;
      }

      // Get all properties
      let allProperties = sessionCache.getProperties();
      if (!allProperties) {
        const res = await listProperties();
        allProperties = res.data || [];
        sessionCache.setProperties(allProperties);
      }

      // Filter to properties that have this meter group
      const propertiesWithMeterGroup = allProperties.filter((p: Property) =>
        Object.values(p.meter_groups).some(
          (entry) => entry.meter_group_id === seedSelectedMeterGroupId
        )
      );

      // Get main meter properties only
      const mainMeterProperties = propertiesWithMeterGroup.filter((p: Property) => {
        const meterGroupEntry = Object.entries(p.meter_groups).find(
          ([_, entry]) => entry.meter_group_id === seedSelectedMeterGroupId
        );
        return meterGroupEntry && meterGroupEntry[1].is_main_meter === true;
      });

      // Fetch existing readings to filter out already-seeded
      const readingsRes = await listReadings({ meterGroupId: seedSelectedMeterGroupId });
      const existingReadings = readingsRes.data || [];

      // Get current meter version from meter group
      const currentVersion = meterGroup.current_version || 1;

      // Filter to unseeded main meters
      seedProperties = mainMeterProperties.filter((p: Property) => {
        const hasExistingSeedForVersion = existingReadings.some(
          (r: Reading) => r.property_id === p.id && r.meter_version === currentVersion
        );
        return !hasExistingSeedForVersion;
      });

      // Initialize readings object
      seedReadings = {};
      seedProperties.forEach((p: Property) => {
        seedReadings[p.id] = { amount: 0, image_url: '' };
      });

      if (seedProperties.length === 0) {
        seedError = 'All main meters for this meter group have been seeded';
      }
    } catch (e) {
      seedError = 'Failed to load properties';
    } finally {
      seedIsLoading = false;
    }
  }

  async function captureSeedPhoto(propertyId: string) {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: 'base64',
        promptLabelPicture: 'Select photo'
      });

      if (image.base64String) {
        seedReadings[propertyId].image_url = `data:image/${image.format};base64,${image.base64String}`;
      }
    } catch (e) {
      seedError = 'Failed to capture photo';
    }
  }

  async function submitSeedReadings() {
    try {
      seedIsLoading = true;
      seedError = null;

      const seedsToSubmit = Object.entries(seedReadings)
        .filter(([_, data]) => data.amount > 0)
        .map(([propertyId, data]) => ({
          meter_group_id: seedSelectedMeterGroupId,
          property_id: propertyId,
          reading_amount: data.amount,
          reading_date: `${seedReadingDate}T00:00:00Z`,
          image_url: data.image_url || undefined
        }));

      if (seedsToSubmit.length === 0) {
        seedError = 'Please enter at least one reading';
        return;
      }

      await Promise.all(seedsToSubmit.map(seed => createSeedReading(seed)));

      // Reset form
      seedSelectedMeterGroupId = '';
      seedReadingDate = new Date().toISOString().split('T')[0];
      seedProperties = [];
      seedReadings = {};
      showSeedForm = false;
      error = 'Seed readings created successfully';
    } catch (e: any) {
      seedError = e.message || 'Failed to submit seed readings';
    } finally {
      seedIsLoading = false;
    }
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 flex items-center gap-3 bg-white border-b" style="border-color: var(--color-border); color: var(--color-text-primary)">
    <button onclick={() => window.history.back()} class="text-xl" style="color: var(--color-text-primary)">←</button>
    <h1 class="text-xl font-bold">Settings</h1>
  </div>

  {#if error}
    <div class="p-4 m-4 rounded border flex items-center justify-between" style="background-color: #fff0f0; border-color: var(--color-status-alert); color: var(--color-status-alert)">
      <span>{error}</span>
      <button onclick={() => (error = null)} class="text-lg leading-none" style="color: var(--color-status-alert)">✕</button>
    </div>
  {/if}

  <div class="p-4 space-y-6">
    <!-- Account Section -->
    <div>
      <h2 class="text-lg font-semibold mb-3" style="color: var(--color-text-primary)">Account</h2>
      <div class="card-base space-y-3">
        <p class="text-sm" style="color: var(--color-text-secondary)">User profile and authentication</p>
        <button
          onclick={handleSignOut}
          disabled={isSigningOut}
          class="w-full py-2 px-3 rounded font-semibold disabled:opacity-50"
          style="background-color: var(--color-accent); color: white"
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>

    <!-- Reading Operations Section -->
    <div>
      <h2 class="text-lg font-semibold mb-3" style="color: var(--color-text-primary)">Reading Operations</h2>
      <div class="card-base space-y-3">
        <p class="text-sm" style="color: var(--color-text-secondary)">Setup and manage meter readings</p>
        <button
          onclick={() => (showSeedForm = !showSeedForm)}
          class="w-full py-2 px-3 rounded font-semibold"
          style="background-color: var(--color-accent); color: white"
        >
          {showSeedForm ? '✕ Close' : '+ Seed Readings'}
        </button>
      </div>
      {#if showSeedForm}
        <div class="mt-4 card-base space-y-4">
          {#if seedError}
            <div class="p-3 rounded text-sm" style="background-color: #fff0f0; color: var(--color-status-alert)">
              {seedError}
            </div>
          {/if}

          <div>
            <label for="seed-meter-group" class="label-base mb-2">
              Meter Group
            </label>
            <select
              id="seed-meter-group"
              bind:value={seedSelectedMeterGroupId}
              onchange={loadSeedProperties}
              class="input-base w-full"
            >
              <option value="">-- Select meter group --</option>
              {#each seedMeterGroups as group (group.id)}
                <option value={group.id}>
                  {group.meter_name} ({group.utility_type})
                </option>
              {/each}
            </select>
          </div>

          <div>
            <label for="seed-reading-date" class="label-base mb-2">
              Seed Date
            </label>
            <input
              id="seed-reading-date"
              type="date"
              bind:value={seedReadingDate}
              class="input-base w-full"
            />
          </div>

          {#if seedProperties.length > 0}
            <div class="space-y-3 mt-4">
              {#each seedProperties as property (property.id)}
                <div class="border-l-4 pl-3" style="border-color: var(--color-accent)">
                  <h4 class="font-semibold text-sm mb-2" style="color: var(--color-text-primary)">{property.room_name}</h4>

                  {#if seedReadings[property.id]?.image_url}
                    <div class="relative w-full h-24 bg-gray-100 rounded-lg overflow-hidden mb-2">
                      <img
                        src={seedReadings[property.id].image_url}
                        alt="Meter reading"
                        class="w-full h-full object-cover"
                      />
                      <button
                        onclick={() => (seedReadings[property.id].image_url = '')}
                        class="absolute top-1 right-1 text-white px-2 py-1 rounded text-xs"
                        style="background-color: var(--color-status-alert)"
                      >
                        ✕
                      </button>
                    </div>
                  {/if}

                  <button
                    onclick={() => captureSeedPhoto(property.id)}
                    class="w-full p-2 border-2 border-dashed rounded text-sm font-semibold mb-2"
                    style={seedReadings[property.id]?.image_url
                      ? `background-color: var(--color-accent); color: white; border-color: var(--color-accent)`
                      : `border-color: var(--color-border); color: var(--color-text-primary)`}
                  >
                    {seedReadings[property.id]?.image_url ? '📷 Retake' : '📷 Photo'}
                  </button>

                  <input
                    type="number"
                    bind:value={seedReadings[property.id].amount}
                    placeholder="Reading amount"
                    class="input-base w-full text-sm"
                  />
                </div>
              {/each}
            </div>

            <button
              onclick={submitSeedReadings}
              disabled={seedIsLoading}
              class="w-full py-2 px-3 rounded font-semibold disabled:opacity-50 mt-4"
              style="background-color: var(--color-accent); color: white"
            >
              {seedIsLoading ? 'Submitting...' : '✓ Submit Seed Readings'}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- System Section -->
    <div>
      <h2 class="text-lg font-semibold mb-3" style="color: var(--color-text-primary)">System</h2>
      <div class="card-base space-y-3">
        <p class="text-sm" style="color: var(--color-text-secondary)">System maintenance and cache</p>
        <button
          onclick={clearCache}
          class="w-full py-2 px-3 rounded font-semibold"
          style="background-color: var(--color-text-secondary); color: white"
        >
          Clear Cache
        </button>
      </div>
    </div>

    <!-- Configuration Section -->
    <div>
      <h2 class="text-lg font-semibold mb-3" style="color: var(--color-text-primary)">Configuration</h2>
      <div class="card-base">
        <p class="text-sm" style="color: var(--color-text-secondary)">Reserved for future settings</p>
      </div>
    </div>
  </div>

  <BottomNav active="settings" />
</div>
