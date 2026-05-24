<script lang="ts">
  import { signOut } from 'firebase/auth';
  import { auth } from '../firebase';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let isLoading = $state(false);
  let error: string | null = $state(null);

  const user = auth.currentUser;

  async function handleSignOut() {
    isLoading = true;
    error = null;
    try {
      sessionCache.clear();
      await signOut(auth);
      window.location.hash = '#/home';
    } catch (e: any) {
      error = e.message || 'Failed to sign out';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 border-b bg-white" style="border-color: var(--color-border)">
    <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Settings</h1>
  </div>

  <div class="p-4 space-y-4">
    <!-- Profile card -->
    <div class="card-base">
      <p class="text-xs font-semibold uppercase tracking-wide mb-2" style="color: var(--color-text-secondary)">Account</p>
      <p class="font-semibold" style="color: var(--color-text-primary)">{user?.email ?? '—'}</p>
    </div>

    {#if error}
      <div class="p-3 rounded text-sm" style="background-color: #fde5e0; color: var(--color-status-alert); border: 1px solid var(--color-status-alert)">
        {error}
      </div>
    {/if}

    <!-- Sign out -->
    <button
      onclick={handleSignOut}
      disabled={isLoading}
      class="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
      style="background-color: var(--color-status-alert)"
    >
      {isLoading ? 'Signing out...' : 'Sign Out'}
    </button>
  </div>

  <BottomNav active="settings" />
</div>
