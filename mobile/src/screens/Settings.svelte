<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '../firebase';
  import { signOut } from 'firebase/auth';
  import { sessionCache } from '../lib/stores/session';
  import { markManualSignOut } from '../lib/stores/auth-notice.svelte';
  import { confirmAsync } from '../lib/stores/confirm.svelte';
  import { pushToast } from '../lib/stores/toast.svelte';
  import { goToHash } from '../lib/utils/navigation';
  import BottomNav from '../components/BottomNav.svelte';

  let isSigningOut = $state(false);
  let error: string | null = $state(null);
  let headingEl: HTMLElement | undefined = $state();

  onMount(() => {
    headingEl?.focus();
  });

  async function handleSignOut() {
    try {
      isSigningOut = true;
      markManualSignOut();
      await signOut(auth);
      sessionCache.clear();
      window.location.hash = '#/login';
    } catch (e: any) {
      error = e.message || 'Failed to sign out';
    } finally {
      isSigningOut = false;
    }
  }

  async function clearCache() {
    const confirmed = await confirmAsync(
      'Clear cache',
      "Clear cached data? You'll need to reload meter groups and properties next time.",
      { danger: true }
    );
    if (!confirmed) return;
    sessionCache.clear();
    error = null;
    pushToast('Cache cleared', 'success');
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 flex items-center gap-3 bg-white border-b" style="border-color: var(--color-border); color: var(--color-text-primary)">
    <button onclick={() => goToHash('#/home')} aria-label="Back" class="text-xl" style="color: var(--color-text-primary)">←</button>
    <h1 bind:this={headingEl} tabindex="-1" class="text-xl font-bold outline-none">Settings</h1>
  </div>

  {#if error}
    <div class="p-4 m-4 rounded border flex items-center justify-between" style="background-color: #fff0f0; border-color: var(--color-status-alert); color: var(--color-status-alert)">
      <span>{error}</span>
      <button onclick={() => (error = null)} aria-label="Dismiss error" class="text-lg leading-none" style="color: var(--color-status-alert)">✕</button>
    </div>
  {/if}

  <main class="p-4 space-y-6">
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
  </main>

  <BottomNav active="settings" />
</div>
