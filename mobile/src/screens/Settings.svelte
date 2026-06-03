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
