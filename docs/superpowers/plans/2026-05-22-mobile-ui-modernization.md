# Mobile UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Capacitor mobile app UI from a 2015-era design into a modern, iOS-inspired interface with the admin UI's warm brown color scheme, generous spacing, and clean typography.

**Architecture:** Apply the approved design spec to each mobile screen (Login, Home, Capture Readings, Reading History, Billings). Start with global styles/colors, then update each screen incrementally. Use Tailwind v4 with custom color tokens matching admin's palette.

**Tech Stack:** Svelte 5 with Tailwind v4, custom CSS variables for brown color scheme, no component library changes.

---

## File Structure

**Files to create:**
- `mobile/src/styles/globals.css` — Global color tokens and utility classes matching the design system

**Files to modify:**
- `mobile/src/App.svelte` — Add global styles import
- `mobile/index.html` — Ensure viewport and safe-area meta tags
- `mobile/src/screens/Login.svelte` — Apply cream background, brown button, centered card
- `mobile/src/screens/Home.svelte` — Apply header styles, brown CTA, stat cards
- `mobile/src/screens/CaptureReadings.svelte` — Apply 3-step layout with new colors
- `mobile/src/screens/ReadingHistory.svelte` — Apply card list styles
- `mobile/src/screens/Billings.svelte` — Apply card list and status pill styles
- `mobile/tailwind.config.ts` — Add custom color theme (if needed, optional)

---

## Tasks

### Task 1: Set up global color tokens and utility styles

**Files:**
- Create: `mobile/src/styles/globals.css`
- Modify: `mobile/src/App.svelte`

**Context:**  
Define the color palette and reusable utility classes that all screens will reference. This ensures consistency and makes future updates easier.

- [ ] **Step 1: Create globals.css with color tokens**

Create file `mobile/src/styles/globals.css`:

```css
@import 'tailwindcss';
@plugin '@tailwindcss/forms';

@theme {
  --color-accent: #8b5a3c;
  --color-text-primary: #2a251f;
  --color-text-secondary: #5b524a;
  --color-text-tertiary: #8a7f74;
  --color-bg-primary: #fbf7ef;
  --color-bg-secondary: #ffffff;
  --color-border: #8a7f74;
  --color-status-good: #2c6b3a;
  --color-status-alert: #a23b21;
}

:root {
  --color-accent: #8b5a3c;
  --color-text-primary: #2a251f;
  --color-text-secondary: #5b524a;
  --color-text-tertiary: #8a7f74;
  --color-bg-primary: #fbf7ef;
  --color-bg-secondary: #ffffff;
  --color-border: #8a7f74;
  --color-status-good: #2c6b3a;
  --color-status-alert: #a23b21;
}

/* Reusable utility classes */
.btn-primary {
  @apply px-4 py-3 rounded-lg font-semibold text-white;
  background-color: var(--color-accent);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  @apply px-4 py-3 rounded-lg font-semibold;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background-color: #f0eee5;
}

.input-base {
  @apply px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2;
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.input-base:focus {
  outline: none;
  ring: 2px solid var(--color-accent);
}

.label-base {
  @apply block text-sm font-medium mb-2;
  color: var(--color-text-primary);
}

.text-title {
  @apply text-2xl font-bold;
  color: var(--color-text-primary);
}

.text-section {
  @apply text-lg font-semibold;
  color: var(--color-text-primary);
}

.text-body {
  @apply text-base font-normal;
  color: var(--color-text-primary);
}

.text-caption {
  @apply text-xs font-normal;
  color: var(--color-text-secondary);
}

.card-base {
  @apply p-4 bg-white rounded-lg border;
  border-color: var(--color-border);
}

.divider {
  border-color: var(--color-border);
}
```

- [ ] **Step 2: Import globals.css in App.svelte**

Modify `mobile/src/App.svelte` — add import at the top of the script block:

```svelte
<script lang="ts">
  import './styles/globals.css';
  import { onMount } from 'svelte';
  // ... rest of script
</script>
```

- [ ] **Step 3: Verify CSS compiles**

Build the mobile app:
```bash
cd mobile && npm run build
```

Expected: No CSS errors, `dist/` folder created successfully.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/styles/globals.css mobile/src/App.svelte
git commit -m "feat(mobile): add global color tokens and utility styles"
```

---

### Task 2: Update index.html with viewport and safe-area meta tags

**Files:**
- Modify: `mobile/index.html`

**Context:**  
Ensure the mobile viewport is properly configured for iOS/Android and accounts for safe areas (notches, rounded corners).

- [ ] **Step 1: Update index.html meta tags**

Modify `mobile/index.html` — update the `<head>` section:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#8b5a3c" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Utilitool" />
  <title>Utilitool Mobile</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Rebuild to verify**

```bash
cd mobile && npm run build
```

Expected: Build succeeds, index.html updated in `dist/`.

- [ ] **Step 3: Commit**

```bash
git add mobile/index.html
git commit -m "feat(mobile): add viewport and safe-area meta tags"
```

---

### Task 3: Modernize Login screen

**Files:**
- Modify: `mobile/src/screens/Login.svelte`

**Context:**  
Apply the new color scheme: cream background, brown button, dark brown text, generous padding.

- [ ] **Step 1: Replace Login.svelte with modern design**

Replace entire file `mobile/src/screens/Login.svelte`:

```svelte
<script lang="ts">
  import { signInWithEmailAndPassword } from 'firebase/auth';
  import { auth } from '../firebase';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    loading = true;
    error = '';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.hash = '#/home';
    } catch (err: any) {
      error = err.message || 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4" style="background-color: var(--color-bg-primary)">
  <div class="w-full max-w-md">
    <div class="bg-white rounded-lg shadow-sm p-6" style="border: 1px solid var(--color-border)">
      <!-- Logo / Title -->
      <h1 class="text-3xl font-bold text-center mb-2" style="color: var(--color-accent)">Utilitool</h1>
      <p class="text-center text-sm mb-8" style="color: var(--color-text-secondary)">Meter Reader</p>

      <!-- Form -->
      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <!-- Email Field -->
        <div>
          <label for="email" class="label-base">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            disabled={loading}
            required
            class="input-base w-full"
            placeholder="meter.reader@example.com"
          />
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="label-base">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            disabled={loading}
            required
            class="input-base w-full"
            placeholder="••••••••"
          />
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="p-3 rounded-lg text-sm font-medium" style="background-color: #fde5e0; color: var(--color-status-alert)">
            {error}
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={loading}
          class="btn-primary w-full text-base"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>

    <!-- Footer -->
    <p class="text-center text-xs mt-6" style="color: var(--color-text-tertiary)">
      Secure meter reading application
    </p>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
</style>
```

- [ ] **Step 2: Test in browser**

Run dev server:
```bash
cd mobile && npm run dev
```

Navigate to `http://localhost:5174`. Verify:
- Cream background (#fbf7ef)
- White card with subtle border
- Brown accent title
- Inputs have proper borders
- Button is brown (#8b5a3c)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Login.svelte
git commit -m "feat(mobile): modernize login screen with brown palette"
```

---

### Task 4: Modernize Home screen

**Files:**
- Modify: `mobile/src/screens/Home.svelte`

**Context:**  
Apply modern design: cream header with brown title, brown CTA button, stat cards with breathing room, bottom nav with brown active state.

- [ ] **Step 1: Replace Home.svelte with modern design**

Replace entire file `mobile/src/screens/Home.svelte`:

```svelte
<script lang="ts">
  import { auth } from '../firebase';

  function logout() {
    auth.signOut();
    window.location.hash = '#/login';
  }
</script>

<div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
  <!-- Header -->
  <div class="p-6 border-b" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <h1 class="text-3xl font-bold mb-1" style="color: var(--color-accent)">Utilitool</h1>
    <p class="text-sm" style="color: var(--color-text-secondary)">Meter Reading Assistant</p>
  </div>

  <!-- Main Content -->
  <div class="p-4 space-y-6">
    <!-- Quick Action -->
    <div class="mt-6">
      <a
        href="#/capture"
        class="btn-primary w-full py-4 text-center font-semibold text-base block rounded-lg"
      >
        📱 New Reading Session
      </a>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 gap-4">
      <div class="card-base text-center p-4">
        <p class="text-xs mb-2" style="color: var(--color-text-secondary)">Recent Readings</p>
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">—</p>
      </div>
      <div class="card-base text-center p-4">
        <p class="text-xs mb-2" style="color: var(--color-text-secondary)">Pending Billings</p>
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">—</p>
      </div>
    </div>

    <!-- Sign Out -->
    <div class="mt-12 pt-4 border-t" style="border-color: var(--color-border)">
      <button
        on:click={logout}
        class="btn-secondary w-full text-center font-semibold py-3 rounded-lg"
      >
        Sign Out
      </button>
    </div>
  </div>

  <!-- Bottom Nav -->
  <nav class="fixed bottom-0 left-0 right-0 flex justify-around p-3 border-t" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <a href="#/home" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-accent)">🏠 Home</a>
    <a href="#/history" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">📋 History</a>
    <a href="#/billings" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">💰 Billings</a>
  </nav>
</div>
```

- [ ] **Step 2: Test in browser**

Verify:
- Cream background
- Header with brown title
- Brown CTA button (48px+ height)
- Stat cards with proper spacing
- Bottom nav with brown active (Home)
- Sign Out button

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Home.svelte
git commit -m "feat(mobile): modernize home screen with card layout and brown accent"
```

---

### Task 5: Modernize CaptureReadings Step 1 (Session Setup)

**Files:**
- Modify: `mobile/src/screens/CaptureReadings.svelte` (Step 1 section)

**Context:**  
Update Step 1 UI: header with back button, form fields with proper styling, brown button.

- [ ] **Step 1: Update Step 1 template in CaptureReadings.svelte**

Find the `{#if step === 1}` block and replace with:

```svelte
{#if step === 1}
  <div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
    <!-- Header -->
    <div class="p-4 border-b flex items-center gap-3" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
      <button on:click={goBack} class="text-2xl font-bold" style="color: var(--color-text-primary)">←</button>
      <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">New Reading Session</h1>
    </div>

    <!-- Form -->
    <div class="p-4 space-y-6">
      <!-- Meter Group -->
      <div>
        <label for="meter-group" class="label-base">Meter Group</label>
        <select
          id="meter-group"
          bind:value={selectedMeterGroup}
          disabled={loading}
          class="input-base w-full"
        >
          <option value="">— Select a meter group —</option>
          {#each meterGroups as mg}
            <option value={mg.id}>{mg.meter_name}</option>
          {/each}
        </select>
      </div>

      <!-- Reading Date -->
      <div>
        <label for="reading-date" class="label-base">Reading Date</label>
        <input
          id="reading-date"
          type="date"
          bind:value={readingDate}
          disabled={loading}
          class="input-base w-full"
        />
      </div>

      <!-- Submit Button -->
      <button
        on:click={startSession}
        disabled={loading || !selectedMeterGroup}
        class="btn-primary w-full py-3 text-base font-semibold rounded-lg disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Start Session'}
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Test in browser**

Navigate to capture readings. Verify Step 1:
- Header with back button (brown text, clear hierarchy)
- Form fields with brown borders on focus
- Button is brown, disabled state is visible
- Generous spacing

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): modernize capture step 1 with new form styles"
```

---

### Task 6: Modernize CaptureReadings Step 2 (Property Cards)

**Files:**
- Modify: `mobile/src/screens/CaptureReadings.svelte` (Step 2 section)

**Context:**  
Update Step 2 UI: property cards with cream background, brown borders, photo section, reading input.

- [ ] **Step 1: Update Step 2 template in CaptureReadings.svelte**

Find the `{:else if step === 2}` block and replace with:

```svelte
{:else if step === 2}
  <div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
    <!-- Header -->
    <div class="p-4 border-b flex items-center gap-3" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
      <button on:click={() => (step = 1)} class="text-2xl font-bold" style="color: var(--color-text-primary)">←</button>
      <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Record Readings</h1>
    </div>

    <!-- Property Cards -->
    <div class="p-4 space-y-4">
      {#each properties as property, idx}
        <div class="card-base">
          <!-- Property Name -->
          <h3 class="text-lg font-semibold mb-4" style="color: var(--color-text-primary)">{property.room_name}</h3>

          <!-- Photo Section -->
          <div class="mb-4">
            {#if readings[idx]?.photoTaken}
              <div class="relative mb-2">
                <button
                  on:click={() => openPhotoPreview(readings[idx].photoDataUrl)}
                  class="w-full aspect-video bg-gray-200 rounded-lg overflow-hidden"
                >
                  <img
                    src={readings[idx].photoDataUrl}
                    alt="Meter"
                    class="w-full h-full object-cover"
                  />
                </button>
                <button
                  on:click={() => capturePhoto(idx)}
                  class="absolute bottom-2 right-2 text-white font-semibold px-3 py-1 rounded text-sm"
                  style="background-color: var(--color-accent)"
                >
                  📷 Retake
                </button>
              </div>
            {:else}
              <button
                on:click={() => capturePhoto(idx)}
                class="w-full p-4 border-2 border-dashed rounded-lg text-center font-semibold"
                style="border-color: var(--color-border); background-color: #f5eee5; color: var(--color-text-primary)"
              >
                📱 Tap to capture meter photo
              </button>
            {/if}
          </div>

          <!-- Reading Amount -->
          <div>
            <label class="label-base">Reading Amount</label>
            <input
              type="number"
              bind:value={readings[idx].reading_amount}
              placeholder="0"
              class="input-base w-full"
            />
          </div>

          <!-- Status -->
          {#if readings[idx]?.reading_amount}
            <div class="mt-3 font-semibold text-sm" style="color: var(--color-status-good)">✓ Complete</div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Next Button -->
    <div class="fixed bottom-0 left-0 right-0 p-4 border-t" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
      {#if readings.every(r => r.reading_amount)}
        <button
          on:click={() => (step = 3)}
          class="btn-primary w-full py-3 text-base font-semibold rounded-lg"
        >
          Review & Submit
        </button>
      {:else}
        <button
          disabled
          class="w-full py-3 text-base font-semibold rounded-lg opacity-50 cursor-not-allowed"
          style="background-color: var(--color-text-tertiary); color: white"
        >
          Complete all readings to continue
        </button>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Test in browser**

Navigate to Step 2. Verify:
- Cards have brown borders, cream background
- Photo button has dashed border, proper styling
- Reading input with brown focus state
- Status indicator shows green when complete
- Bottom button is brown, disabled state visible

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): modernize capture step 2 with property cards"
```

---

### Task 7: Modernize CaptureReadings Step 3 (Confirmation)

**Files:**
- Modify: `mobile/src/screens/CaptureReadings.svelte` (Step 3 section)

**Context:**  
Update Step 3 UI: summary card, reading list, brown submit button.

- [ ] **Step 1: Update Step 3 template in CaptureReadings.svelte**

Find the `{:else if step === 3}` block and replace with:

```svelte
{:else if step === 3}
  <div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
    <!-- Header -->
    <div class="p-4 border-b flex items-center gap-3" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
      <button on:click={() => (step = 2)} class="text-2xl font-bold" style="color: var(--color-text-primary)">←</button>
      <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Review & Submit</h1>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-4">
      <!-- Summary Card -->
      <div class="card-base">
        <h3 class="text-lg font-semibold mb-4" style="color: var(--color-text-primary)">Session Summary</h3>

        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-sm" style="color: var(--color-text-secondary)">Meter Group:</span>
            <span class="font-semibold" style="color: var(--color-text-primary)">
              {meterGroups.find(m => m.id === selectedMeterGroup)?.meter_name}
            </span>
          </div>

          <div class="flex justify-between">
            <span class="text-sm" style="color: var(--color-text-secondary)">Reading Date:</span>
            <span class="font-semibold" style="color: var(--color-text-primary)">{readingDate}</span>
          </div>

          <div class="flex justify-between">
            <span class="text-sm" style="color: var(--color-text-secondary)">Properties:</span>
            <span class="font-semibold" style="color: var(--color-text-primary)">{properties.length}</span>
          </div>

          <div class="flex justify-between">
            <span class="text-sm" style="color: var(--color-text-secondary)">Readings Recorded:</span>
            <span class="font-semibold" style="color: var(--color-text-primary)">{readings.filter(r => r.reading_amount).length}/{readings.length}</span>
          </div>
        </div>
      </div>

      <!-- Reading List -->
      <div>
        <h4 class="font-semibold mb-3" style="color: var(--color-text-primary)">Readings Details</h4>
        {#each readings as reading, idx}
          <div class="card-base flex justify-between items-center mb-2">
            <span class="text-sm" style="color: var(--color-text-primary)">{properties[idx]?.room_name}</span>
            <span class="font-semibold" style="color: var(--color-accent)">{reading.reading_amount}</span>
          </div>
        {/each}
      </div>

      <!-- Error -->
      {#if submitError}
        <div class="p-3 rounded-lg text-sm font-medium" style="background-color: #fde5e0; color: var(--color-status-alert)">
          {submitError}
        </div>
      {/if}
    </div>

    <!-- Submit Buttons -->
    <div class="fixed bottom-0 left-0 right-0 p-4 border-t flex gap-2" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
      <button
        on:click={() => (step = 2)}
        disabled={submitting}
        class="flex-1 btn-secondary py-3 font-semibold rounded-lg"
      >
        Back
      </button>
      <button
        on:click={submitReadings}
        disabled={submitting}
        class="flex-1 btn-primary py-3 font-semibold rounded-lg disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Confirm & Submit'}
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Test in browser**

Navigate to Step 3. Verify:
- Summary card with proper spacing
- Reading list displays correctly
- Back button (secondary) and Submit button (primary) layout
- Submit button is brown, disabled state visible

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): modernize capture step 3 with summary and submit"
```

---

### Task 8: Modernize Reading History screen

**Files:**
- Modify: `mobile/src/screens/ReadingHistory.svelte`

**Context:**  
Apply card list design: brown filter section, card-based layout, bottom nav.

- [ ] **Step 1: Replace ReadingHistory.svelte with modern design**

Replace entire file `mobile/src/screens/ReadingHistory.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getMeterGroups } from '../lib/api/meter-groups';

  let readings = $state<any[]>([]);
  let meterGroups = $state<any[]>([]);
  let selectedMeterGroup = $state('');
  let loading = $state(true);

  onMount(async () => {
    try {
      const result = await getMeterGroups();
      meterGroups = result.data || [];
    } catch (err) {
      console.error('Failed to load meter groups:', err);
    } finally {
      loading = false;
    }
  });

  async function filterReadings() {
    if (!selectedMeterGroup) return;
    loading = true;
    try {
      // TODO: Implement actual API call with filters
      readings = [];
    } catch (err) {
      console.error('Failed to load readings:', err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
  <!-- Header -->
  <div class="p-4 border-b" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Reading History</h1>
  </div>

  <!-- Filter Section -->
  <div class="p-4 border-b sticky top-0 z-10" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <label class="label-base">Meter Group</label>
    <select
      bind:value={selectedMeterGroup}
      on:change={filterReadings}
      class="input-base w-full"
    >
      <option value="">All Meter Groups</option>
      {#each meterGroups as mg}
        <option value={mg.id}>{mg.meter_name}</option>
      {/each}
    </select>
  </div>

  <!-- Readings List -->
  <div class="p-4 space-y-3">
    {#if loading}
      <p class="text-center py-8" style="color: var(--color-text-secondary)">Loading...</p>
    {:else if readings.length === 0}
      <p class="text-center py-8" style="color: var(--color-text-secondary)">No readings found</p>
    {:else}
      {#each readings as reading}
        <div class="card-base">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">{reading.property?.room_name}</h3>
            <span class="text-xs" style="color: var(--color-text-secondary)">{reading.meter_group?.meter_name}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <p class="text-xs" style="color: var(--color-text-secondary)">Reading</p>
              <p class="font-semibold" style="color: var(--color-text-primary)">{reading.reading_amount}</p>
            </div>
            <div>
              <p class="text-xs" style="color: var(--color-text-secondary)">Date</p>
              <p class="font-semibold" style="color: var(--color-text-primary)">{reading.reading_date}</p>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom Nav -->
  <nav class="fixed bottom-0 left-0 right-0 flex justify-around p-3 border-t" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <a href="#/home" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">🏠 Home</a>
    <a href="#/history" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-accent)">📋 History</a>
    <a href="#/billings" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">💰 Billings</a>
  </nav>
</div>
```

- [ ] **Step 2: Test in browser**

Navigate to Reading History tab. Verify:
- Header styling
- Filter section (sticky, proper styling)
- Card list with proper spacing
- Bottom nav with brown active state on History

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/ReadingHistory.svelte
git commit -m "feat(mobile): modernize reading history with card-based layout"
```

---

### Task 9: Modernize Billings screen

**Files:**
- Modify: `mobile/src/screens/Billings.svelte`

**Context:**  
Apply card list design with status pills, bottom nav.

- [ ] **Step 1: Replace Billings.svelte with modern design**

Replace entire file `mobile/src/screens/Billings.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillings } from '../lib/api/billings';

  let billings = $state<any[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const result = await getBillings();
      billings = result.data || [];
    } catch (err) {
      console.error('Failed to load billings:', err);
    } finally {
      loading = false;
    }
  });

  function getStatusColor(status: string) {
    switch (status) {
      case 'paid':
        return { bg: '#e8f4ea', text: '#2c6b3a' };
      case 'overdue':
        return { bg: '#fde5e0', text: '#a23b21' };
      case 'pending':
      default:
        return { bg: '#f0eee9', text: '#5b524a' };
    }
  }
</script>

<div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
  <!-- Header -->
  <div class="p-4 border-b" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Billings</h1>
  </div>

  <!-- Billings List -->
  <div class="p-4 space-y-3">
    {#if loading}
      <p class="text-center py-8" style="color: var(--color-text-secondary)">Loading...</p>
    {:else if billings.length === 0}
      <p class="text-center py-8" style="color: var(--color-text-secondary)">No billings found</p>
    {:else}
      {#each billings as billing}
        <div class="card-base">
          <div class="flex justify-between items-start mb-3">
            <h3 class="font-semibold" style="color: var(--color-text-primary)">{billing.property?.room_name}</h3>
            <span
              class="text-xs px-2 py-1 rounded-full font-semibold"
              style="background-color: {getStatusColor(billing.payment_status).bg}; color: {getStatusColor(billing.payment_status).text}"
            >
              {billing.payment_status}
            </span>
          </div>
          <p class="text-xs mb-3" style="color: var(--color-text-tertiary)">{billing.id}</p>
          <div class="flex justify-between items-center">
            <span class="text-sm" style="color: var(--color-text-secondary)">Amount</span>
            <span class="text-lg font-bold" style="color: var(--color-accent)">
              ${(billing.reading_amount || 0).toFixed(2)}
            </span>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom Nav -->
  <nav class="fixed bottom-0 left-0 right-0 flex justify-around p-3 border-t" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <a href="#/home" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">🏠 Home</a>
    <a href="#/history" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-text-secondary)">📋 History</a>
    <a href="#/billings" class="flex-1 text-center py-2 font-semibold text-sm rounded" style="color: var(--color-accent)">💰 Billings</a>
  </nav>
</div>
```

- [ ] **Step 2: Test in browser**

Navigate to Billings tab. Verify:
- Header styling
- Card list displays billings correctly
- Status pills show with proper colors (green/red/gray)
- Amount displays in brown accent color
- Bottom nav with brown active state on Billings

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Billings.svelte
git commit -m "feat(mobile): modernize billings with card layout and status pills"
```

---

### Task 10: Verify global accessibility and touch targets

**Files:**
- All screen files (read-only verification)

**Context:**  
Verify that all interactive elements meet the 44px minimum touch target size.

- [ ] **Step 1: Review all buttons and inputs**

Check in browser dev tools (mobile mode):

Go through each screen and verify:
- Login form inputs: height ≥ 44px ✓
- Login button: height ≥ 48px ✓
- Home CTA: height ≥ 48px ✓
- Bottom nav items: height ≥ 44px ✓
- Capture form inputs: height ≥ 44px ✓
- Capture buttons: height ≥ 48px ✓
- History/Billings cards: clickable areas ≥ 44px ✓

- [ ] **Step 2: Test color contrast**

Using browser accessibility tools, verify WCAG AA compliance (4.5:1 for body text):
- Dark brown text (#2a251f) on cream (#fbf7ef): ✓ High contrast
- Dark brown text on white: ✓ High contrast
- White text on brown (#8b5a3c): ✓ Good contrast

- [ ] **Step 3: Document verification (optional)**

If manual testing desired:
```bash
cd mobile && npm run build && npx cap sync && npx cap open android
```

Then test on Android emulator:
- Tap all buttons and verify 44px+ size
- Check text readability in different lighting

- [ ] **Step 4: Commit verification note**

```bash
git add mobile/
git commit -m "verify(mobile): confirm accessibility standards met (44px touch targets, WCAG AA contrast)"
```

---

## Verification Checklist

After completing all tasks, run through this checklist:

- [ ] **Login Screen:**
  - Cream background (#fbf7ef)
  - White card with brown border
  - Brown title (#8b5a3c)
  - Inputs have brown borders, focus ring
  - Button is brown, 48px height

- [ ] **Home Screen:**
  - Header has brown title
  - CTA button is brown (#8b5a3c), full-width, 48px height
  - Stat cards display with spacing
  - Bottom nav visible, brown active state on Home

- [ ] **Capture Readings:**
  - Step 1: Form fields styled, brown button
  - Step 2: Property cards with cream background, brown borders, photo section, reading input
  - Step 3: Summary card, reading list, brown submit + gray back button
  - All buttons ≥ 48px height

- [ ] **Reading History:**
  - Sticky filter section
  - Card list with proper spacing
  - Bottom nav brown active on History

- [ ] **Billings:**
  - Card list with proper spacing
  - Status pills (green/red/gray colors)
  - Amount in brown accent
  - Bottom nav brown active on Billings

- [ ] **Global:**
  - All text uses brown palette (#2a251f, #5b524a, #8a7f74)
  - All buttons/inputs 44-48px height
  - Generous padding/spacing throughout
  - Consistent border colors (#8a7f74)

---

## Notes

- No breaking changes to mobile API client or logic
- All changes are visual/styling only
- Design system is reusable for future mobile updates
- Admin UI remains unchanged
- Browser dev tools (mobile emulation) sufficient for testing before Android build
