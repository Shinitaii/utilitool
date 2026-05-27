<script lang="ts">
  import { page } from '$app/stores';
  import { clearAllCaches } from '$lib/api/cache';

  interface SettingsSection {
    title: string;
    description: string;
    href: string;
  }

  const sections: SettingsSection[] = [
    {
      title: 'Payment QR Code',
      description: 'Configure payment QR code for tenant receipts',
      href: '/settings/payment'
    },
    {
      title: 'Users',
      description: 'Create and manage user accounts',
      href: '/settings/users'
    }
  ];

  let isClearingCache = $state(false);
  let cacheCleared = $state(false);
  let error = $state('');

  function isActive(path: string): boolean {
    return $page.url.pathname === path;
  }

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
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Settings</h1>
    <p class="text-gray-600">Manage your application settings</p>
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

  <!-- Cache Management -->
  <div class="rounded-lg border border-gray-200 bg-white p-6">
    <h2 class="text-lg font-semibold text-gray-900 mb-2">Cache Management</h2>
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

  <div class="grid gap-4 md:grid-cols-2">
    {#each sections as section (section.href)}
      <a
        href={section.href}
        class="rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <h2 class="text-lg font-semibold text-gray-900">{section.title}</h2>
        <p class="mt-2 text-sm text-gray-600">{section.description}</p>
        <div class="mt-4 text-sm font-medium" style="color: var(--color-accent)">
          Go to settings →
        </div>
      </a>
    {/each}
  </div>
</div>
