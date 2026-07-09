<script lang="ts">
  import { page } from '$app/stores';
  import { clearAllCaches } from '$lib/api/cache';
  import { authStore } from '$lib/stores/auth.svelte';

  let isClearingCache = $state(false);
  let cacheCleared = $state(false);
  let error = $state('');

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

  <!-- TIER 2: SYSTEM -->
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

  <!-- TIER 3: CONFIGURATION -->
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

      <!-- LLM Provider Card -->
      <a
        href="/settings/llm-provider"
        class="rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <h3 class="text-lg font-semibold text-gray-900">LLM Provider</h3>
        <p class="mt-2 text-sm text-gray-600">
          Configure the AI provider and API key for the insight chatbot
        </p>
        <div class="mt-4 text-sm font-medium" style="color: var(--color-accent)">
          Go to settings →
        </div>
      </a>
    </div>
  </section>
</div>
