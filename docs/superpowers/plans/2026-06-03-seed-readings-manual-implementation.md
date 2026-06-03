# Seed Readings Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move seed readings to Settings pages on both mobile and website, reorganize Settings with 4-tier structure, and remove seed form from website readings page.

**Architecture:** Both mobile and website Settings follow identical 4-tier organization (Account, Reading Operations, System, Configuration). Seed Readings form lives in Reading Operations section on both platforms. Form auto-detects main meters when user selects a meter group, filters out already-seeded properties, and submits via `POST /readings/seed`. Website readings page loses seed functionality entirely.

**Tech Stack:** Svelte 5 (mobile), SvelteKit (website), Tailwind CSS, TypeScript, REST API via existing client

---

## Task 1: Mobile Settings Page Reorganization

**Files:**
- Modify: `mobile/src/screens/Settings.svelte`

### Step 1: Review current Settings structure

Read the current file to understand existing sections (Account, etc.).

Run: `grep -n "script\|h2\|button\|sign out" mobile/src/screens/Settings.svelte`

Expected output: See current layout sections and buttons

### Step 2: Create 4-tier Settings structure

Replace the entire Settings.svelte with the new 4-tier structure. The file should have:
- Account section (user profile, sign out)
- Reading Operations section (placeholder for Seed Readings form — will add in next task)
- System section (Clear Cache button)
- Configuration section (reserved for future)

```svelte
<script lang="ts">
  import { auth } from '../firebase';
  import { signOut } from 'firebase/auth';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let showSeedForm = $state(false);
  let isSigningOut = $state(false);
  let error: string | null = $state(null);

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
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 flex items-center gap-3 bg-white border-b" style="border-color: var(--color-border); color: var(--color-text-primary)">
    <button onclick={() => (window.location.hash = '#/home')} class="text-xl" style="color: var(--color-text-primary)">←</button>
    <h1 class="text-xl font-bold">Settings</h1>
  </div>

  {#if error}
    <div class="p-4 m-4 rounded border" style="background-color: #fff0f0; border-color: var(--color-status-alert); color: var(--color-status-alert)">
      {error}
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
        <!-- Seed Readings form will be inserted here in Task 2 -->
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
          style="background-color: #888; color: white"
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
```

### Step 3: Commit

```bash
git add mobile/src/screens/Settings.svelte
git commit -m "refactor: reorganize mobile settings into 4-tier structure"
```

---

## Task 2: Mobile Seed Readings Form

**Files:**
- Modify: `mobile/src/screens/Settings.svelte`
- Modify: `mobile/src/lib/api/readings.ts`

### Step 1: Add createSeedReading export to readings API module

Read `mobile/src/lib/api/readings.ts` and check if `createSeedReading` is exported. If not, add it.

```typescript
export async function createSeedReading(data: CreateSeedReadingRequest) {
  return apiPost('/readings/seed', data);
}

export interface CreateSeedReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string;
  image_url?: string;
}
```

### Step 2: Replace Seed Readings form placeholder in Settings.svelte

Find the comment `<!-- Seed Readings form will be inserted here in Task 2 -->` in Settings.svelte and replace it with the full Seed Readings form implementation:

```svelte
<script lang="ts">
  import { Camera } from '@capacitor/camera';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { listProperties, type Property } from '../lib/api/properties';
  import { createSeedReading, type CreateSeedReadingRequest } from '../lib/api/readings';
  import { listReadings, type Reading } from '../lib/api/readings';
  import { getReadingUnit } from '../lib/utils/format';
  import { sessionCache } from '../lib/stores/session';

  // Add these state variables at the top of the script tag, after existing state
  let seedMeterGroups: MeterGroup[] = $state([]);
  let seedSelectedMeterGroupId: string = $state('');
  let seedReadingDate: string = $state(new Date().toISOString().split('T')[0]);
  let seedProperties: Property[] = $state([]);
  let seedReadings: Record<string, { amount: number; image_url: string }> = $state({});
  let seedIsLoading = $state(false);
  let seedError: string | null = $state(null);
  let seedMeterGroupsLoaded = $state(false);

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
          seedMeterGroupsLoaded = true;
        } catch (e) {
          seedError = 'Failed to load meter groups';
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
      const readingsRes = await listReadings({ meter_group_id: seedSelectedMeterGroupId });
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
```

Then add this form block in place of the comment:

```svelte
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
```

### Step 3: Commit

```bash
git add mobile/src/lib/api/readings.ts mobile/src/screens/Settings.svelte
git commit -m "feat: add seed readings form to mobile settings"
```

---

## Task 3: Website Settings Page Reorganization

**Files:**
- Modify: `ui/src/routes/(app)/settings/+page.svelte`

### Step 1: Review current Settings page

Read the current file to understand the existing structure.

Run: `grep -n "h2\|section\|Payment\|User" ui/src/routes/\(app\)/settings/+page.svelte`

Expected: See existing sections (Payment QR Code, Users)

### Step 2: Reorganize with 4-tier structure

Replace the entire settings page with the 4-tier structure. Keep Payment QR Code and Users in Configuration section:

```svelte
<script lang="ts">
  import { auth } from '$lib/firebase';
  import { signOut } from 'firebase/auth';
  import { onMount } from 'svelte';

  let showSeedForm = false;
  let error: string | null = null;

  async function handleSignOut() {
    try {
      await signOut(auth);
      window.location.href = '/login';
    } catch (e: any) {
      error = e.message || 'Failed to sign out';
    }
  }

  function clearCache() {
    localStorage.clear();
    sessionStorage.clear();
    error = null;
  }
</script>

<div class="min-h-screen" style="background-color: var(--color-bg-primary)">
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <div class="p-6 border-b" style="border-color: var(--color-border)">
      <h1 class="text-3xl font-bold" style="color: var(--color-text-primary)">Settings</h1>
    </div>

    {#if error}
      <div class="p-4 m-6 rounded border" style="background-color: #fff0f0; border-color: var(--color-status-alert); color: var(--color-status-alert)">
        {error}
      </div>
    {/if}

    <div class="p-6 space-y-8">
      <!-- Account Section -->
      <section>
        <h2 class="text-xl font-semibold mb-4" style="color: var(--color-text-primary)">Account</h2>
        <div class="border rounded-lg p-4" style="border-color: var(--color-border)">
          <p class="text-sm mb-4" style="color: var(--color-text-secondary)">User profile and authentication</p>
          <button
            onclick={handleSignOut}
            class="px-4 py-2 rounded font-semibold"
            style="background-color: var(--color-accent); color: white"
          >
            Sign Out
          </button>
        </div>
      </section>

      <!-- Reading Operations Section -->
      <section>
        <h2 class="text-xl font-semibold mb-4" style="color: var(--color-text-primary)">Reading Operations</h2>
        <div class="border rounded-lg p-4" style="border-color: var(--color-border)">
          <p class="text-sm mb-4" style="color: var(--color-text-secondary)">Setup and manage meter readings</p>
          <button
            onclick={() => (showSeedForm = !showSeedForm)}
            class="px-4 py-2 rounded font-semibold"
            style="background-color: var(--color-accent); color: white"
          >
            {showSeedForm ? '✕ Close' : '+ Seed Readings'}
          </button>
          {#if showSeedForm}
            <!-- Seed Readings form will be inserted here in Task 4 -->
          {/if}
        </div>
      </section>

      <!-- System Section -->
      <section>
        <h2 class="text-xl font-semibold mb-4" style="color: var(--color-text-primary)">System</h2>
        <div class="border rounded-lg p-4" style="border-color: var(--color-border)">
          <p class="text-sm mb-4" style="color: var(--color-text-secondary)">System maintenance and cache</p>
          <button
            onclick={clearCache}
            class="px-4 py-2 rounded font-semibold"
            style="background-color: #888; color: white"
          >
            Clear Cache
          </button>
        </div>
      </section>

      <!-- Configuration Section -->
      <section>
        <h2 class="text-xl font-semibold mb-4" style="color: var(--color-text-primary)">Configuration</h2>
        
        <!-- Payment QR Code -->
        <div class="border rounded-lg p-4 mb-6" style="border-color: var(--color-border)">
          <h3 class="font-semibold mb-3" style="color: var(--color-text-primary)">Payment QR Code</h3>
          <div class="bg-gray-100 p-6 rounded-lg text-center">
            <p style="color: var(--color-text-secondary)">QR Code goes here</p>
          </div>
        </div>

        <!-- User Management -->
        <div class="border rounded-lg p-4" style="border-color: var(--color-border)">
          <h3 class="font-semibold mb-3" style="color: var(--color-text-primary)">User Management</h3>
          <p class="text-sm" style="color: var(--color-text-secondary)">User role management goes here</p>
        </div>
      </section>
    </div>
  </div>
</div>
```

### Step 3: Commit

```bash
git add ui/src/routes/\(app\)/settings/+page.svelte
git commit -m "refactor: reorganize website settings into 4-tier structure"
```

---

## Task 4: Website Seed Readings Form

**Files:**
- Modify: `ui/src/routes/(app)/settings/+page.svelte`
- Modify: `ui/src/lib/api/readings.ts`

### Step 1: Add createSeedReading export to readings API module

Read `ui/src/lib/api/readings.ts` and check if `createSeedReading` is exported. If not, add it:

```typescript
export async function createSeedReading(data: CreateSeedReadingRequest) {
  return apiPost('/readings/seed', data);
}

export interface CreateSeedReadingRequest {
  meter_group_id: string;
  property_id: string;
  reading_amount: number;
  reading_date: string;
  image_url?: string;
}
```

### Step 2: Import API functions and add seed form logic to settings page

Add these imports at the top of the script section:

```svelte
<script lang="ts">
  import { auth } from '$lib/firebase';
  import { signOut } from 'firebase/auth';
  import { listMeterGroups, type MeterGroup } from '$lib/api/meter-groups';
  import { listProperties, type Property } from '$lib/api/properties';
  import { createSeedReading, listReadings, type CreateSeedReadingRequest, type Reading } from '$lib/api/readings';
  import { getReadingUnit } from '$lib/utils/format';
```

Add these state variables after the existing ones:

```typescript
let seedMeterGroups: MeterGroup[] = [];
let seedSelectedMeterGroupId = '';
let seedReadingDate = new Date().toISOString().split('T')[0];
let seedProperties: Property[] = [];
let seedReadings: Record<string, { amount: number; image_url: string }> = {};
let seedIsLoading = false;
let seedError: string | null = null;
let seedMeterGroupsLoaded = false;

async function loadSeedMeterGroups() {
  if (seedMeterGroupsLoaded) return;
  try {
    const res = await listMeterGroups();
    seedMeterGroups = res.data || [];
    seedMeterGroupsLoaded = true;
  } catch (e) {
    seedError = 'Failed to load meter groups';
  }
}

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
    const propsRes = await listProperties();
    const allProperties = propsRes.data || [];

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
    const readingsRes = await listReadings({ meter_group_id: seedSelectedMeterGroupId });
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
  } catch (e: any) {
    seedError = 'Failed to load properties';
  } finally {
    seedIsLoading = false;
  }
}

async function uploadSeedImage(propertyId: string) {
  // Open file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // For now, convert to data URL. In production, upload to Cloud Storage
      const reader = new FileReader();
      reader.onload = (event: any) => {
        seedReadings[propertyId].image_url = event.target.result;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      seedError = 'Failed to upload image';
    }
  };
  input.click();
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
```

### Step 3: Add Seed Readings form markup

Replace the comment `<!-- Seed Readings form will be inserted here in Task 4 -->` with:

```svelte
<div class="mt-4 border-t pt-4" style="border-color: var(--color-border)">
  {#if seedError}
    <div class="p-3 rounded text-sm mb-4" style="background-color: #fff0f0; color: var(--color-status-alert)">
      {seedError}
    </div>
  {/if}

  <div class="space-y-4">
    <div>
      <label for="seed-meter-group" class="block text-sm font-semibold mb-2" style="color: var(--color-text-primary)">
        Meter Group
      </label>
      <select
        id="seed-meter-group"
        bind:value={seedSelectedMeterGroupId}
        onfocus={loadSeedMeterGroups}
        onchange={loadSeedProperties}
        class="w-full px-3 py-2 border rounded"
        style="border-color: var(--color-border); color: var(--color-text-primary)"
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
      <label for="seed-reading-date" class="block text-sm font-semibold mb-2" style="color: var(--color-text-primary)">
        Seed Date
      </label>
      <input
        id="seed-reading-date"
        type="date"
        bind:value={seedReadingDate}
        class="w-full px-3 py-2 border rounded"
        style="border-color: var(--color-border); color: var(--color-text-primary)"
      />
    </div>

    {#if seedProperties.length > 0}
      <div class="space-y-4 mt-4 pt-4 border-t" style="border-color: var(--color-border)">
        {#each seedProperties as property (property.id)}
          <div class="border-l-4 pl-4" style="border-color: var(--color-accent)">
            <h4 class="font-semibold text-sm mb-2" style="color: var(--color-text-primary)">{property.room_name}</h4>

            {#if seedReadings[property.id]?.image_url}
              <div class="relative w-full h-40 bg-gray-100 rounded-lg overflow-hidden mb-2">
                <img
                  src={seedReadings[property.id].image_url}
                  alt="Meter reading"
                  class="w-full h-full object-cover"
                />
                <button
                  onclick={() => (seedReadings[property.id].image_url = '')}
                  class="absolute top-2 right-2 text-white px-2 py-1 rounded text-sm"
                  style="background-color: var(--color-status-alert)"
                >
                  Remove
                </button>
              </div>
            {/if}

            <button
              onclick={() => uploadSeedImage(property.id)}
              class="w-full py-2 px-3 border-2 border-dashed rounded text-sm font-semibold mb-2"
              style={seedReadings[property.id]?.image_url
                ? `background-color: var(--color-accent); color: white; border-color: var(--color-accent)`
                : `border-color: var(--color-border); color: var(--color-text-primary)`}
            >
              {seedReadings[property.id]?.image_url ? '📷 Replace' : '📷 Upload Photo'}
            </button>

            <input
              type="number"
              bind:value={seedReadings[property.id].amount}
              placeholder="Reading amount"
              class="w-full px-3 py-2 border rounded text-sm"
              style="border-color: var(--color-border); color: var(--color-text-primary)"
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
</div>
```

### Step 4: Commit

```bash
git add ui/src/lib/api/readings.ts ui/src/routes/\(app\)/settings/+page.svelte
git commit -m "feat: add seed readings form to website settings"
```

---

## Task 5: Remove Seed Form from Website Readings Page

**Files:**
- Modify: `ui/src/routes/(app)/readings/+page.svelte`

### Step 1: Review readings page to find seed form section

Read the file and identify the seed form/button sections.

Run: `grep -n "seed\|Seed" ui/src/routes/\(app\)/readings/+page.svelte -i`

Expected: See seed-related code lines

### Step 2: Remove seed form section and any seed-related imports/state

Delete:
- Any imports related to seed creation (e.g., `createSeedReading`)
- Any state variables for seed form (e.g., `seedError`, `seedSelectedProperty`, etc.)
- Any HTML sections with seed form markup
- Any functions that handle seed submissions

Keep only the batch readings form for regular readings.

### Step 3: Verify no seed references remain

Run: `grep -n "seed\|Seed" ui/src/routes/\(app\)/readings/+page.svelte -i`

Expected: No output (no seed references)

### Step 4: Commit

```bash
git add ui/src/routes/\(app\)/readings/+page.svelte
git commit -m "refactor: remove seed readings form from readings page"
```

---

## Task 6: Manual Testing — Mobile Settings

**Files:**
- Test: `mobile/src/screens/Settings.svelte`

### Step 1: Start mobile dev server

Run: `cd mobile && npm run dev`

Expected: Vite dev server starts on port 5174

### Step 2: Navigate to mobile app in browser

Open browser to `http://localhost:5174`

Expected: App loads with login screen

### Step 3: Log in with test account

Use existing test credentials or create new account.

Expected: Dashboard loads with BottomNav showing settings option

### Step 4: Click Settings in BottomNav

Expected: Settings screen appears with 4 sections: Account, Reading Operations, System, Configuration

### Step 5: Test Account section

Click "Sign Out" button.

Expected: Redirects to login screen

### Step 6: Log back in and return to Settings

Expected: Settings appear again

### Step 7: Test System section

Click "Clear Cache" button.

Expected: No error, cache clears silently

### Step 8: Test Seed Readings form

Click "+ Seed Readings" button in Reading Operations section.

Expected:
- Form expands
- Meter group dropdown loads with available groups
- Select a meter group from the dropdown

Expected: 
- Properties list loads (should show only main meters for that group)
- Already-seeded properties are hidden
- If all are seeded, see message: "All main meters for this meter group have been seeded"

### Step 9: Enter seed readings

For each unseeded main meter:
1. Enter a reading amount
2. Click "📷 Photo" button (optionally capture)
3. Verify photo preview appears

Click "✓ Submit Seed Readings"

Expected:
- Loading state shows
- Success message appears
- Form closes
- Settings return to collapsed state

### Step 10: Navigate away and back to verify

Go to Home, then back to Settings.

Click "+ Seed Readings" and select same meter group.

Expected:
- Previously-seeded properties no longer appear in the list
- Only unseeded main meters remain

---

## Task 7: Manual Testing — Website Settings

**Files:**
- Test: `ui/src/routes/(app)/settings/+page.svelte`

### Step 1: Start website dev server

Run: `cd ui && npm run dev`

Expected: SvelteKit dev server starts on port 5173

### Step 2: Navigate to website in browser

Open browser to `http://localhost:5173`

Expected: Website loads with login screen

### Step 3: Log in with test account

Use same test credentials as mobile.

Expected: Dashboard loads

### Step 4: Navigate to Settings page

Click Settings link/button in UI.

Expected: Settings page appears with 4 sections: Account, Reading Operations, System, Configuration

### Step 5: Test each section layout

Scroll down and verify:
- Account section has "Sign Out" button
- Reading Operations section has "+ Seed Readings" button
- System section has "Clear Cache" button
- Configuration section shows Payment QR Code and User Management placeholders

Expected: All sections visible and properly formatted

### Step 6: Test Seed Readings form

Click "+ Seed Readings" button.

Expected:
- Form expands
- Meter group dropdown appears
- Select a meter group

Expected:
- Properties list loads (main meters only)
- Already-seeded properties hidden
- If all seeded, see message: "All main meters for this meter group have been seeded"

### Step 7: Enter seed readings

For each unseeded main meter:
1. Enter reading amount
2. Click "📷 Upload Photo" and select image file
3. Verify preview appears

Click "✓ Submit Seed Readings"

Expected:
- Loading state shows
- Success message
- Form closes

### Step 8: Verify seed form removed from readings page

Navigate to Readings page.

Expected:
- No seed form visible
- Only batch readings form for regular readings appears

---

## Task 8: Integration Testing — Both Platforms

**Files:**
- Test: Backend integration via both mobile and website

### Step 1: Create test scenario

Set up test data:
- One meter group with 2 main meter properties (A and B)
- Property A: unseeded
- Property B: unseeded

### Step 2: Test mobile seed submission

On mobile:
1. Go to Settings → Seed Readings
2. Select meter group
3. Enter readings for A and B
4. Submit

Expected:
- No errors
- Readings appear in Reading History with correct meter_group and property_id

### Step 3: Verify backend constraints

Check that:
- Properties with main meter readings are excluded from batch readings form on CaptureReadings
- Attempting to batch-submit a main meter reading fails with appropriate error

Run: (from CaptureReadings) try submitting reading for property A (a main meter)

Expected: Error message: "Main meter readings must use seed readings endpoint"

### Step 4: Test website seed submission

On website:
1. Go to Settings → Seed Readings
2. Select same meter group
3. Try to seed properties A and B again

Expected: Error message: "This property has already been seeded. Refresh to see updated list." (409 Conflict from backend)

### Step 5: Verify property list updates after seeding

Refresh website settings.
Open Seed Readings form again for the same meter group.

Expected: Properties A and B no longer appear (already seeded for current version)

### Step 6: Test meter reset scenario

(Via API or admin tools) Reset the meter (increment version).

Expected:
- New version created
- Properties A and B now appear as unseeded in Seed Readings form
- Can re-seed them for new version

---

## Commit Summary

Tasks produce these commits:
1. Task 1: `refactor: reorganize mobile settings into 4-tier structure`
2. Task 2: `feat: add seed readings form to mobile settings`
3. Task 3: `refactor: reorganize website settings into 4-tier structure`
4. Task 4: `feat: add seed readings form to website settings`
5. Task 5: `refactor: remove seed readings form from readings page`
6-8: No commits (manual testing)
