<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '../firebase';
  import { signOut } from 'firebase/auth';
  import { sessionCache } from '../lib/stores/session';
  import { getPhotoSettings, upsertPhotoSettings } from '../lib/api/photo-settings';
  import BottomNav from '../components/BottomNav.svelte';

  let isSigningOut = $state(false);
  let error: string | null = $state(null);

  let savePhotos = $state(false);
  let photoSettingsLoading = $state(true);
  let photoSettingsSaving = $state(false);

  onMount(async () => {
    try {
      const settings = await getPhotoSettings();
      savePhotos = settings.savePhotos;
    } catch (e: any) {
      error = e.message || 'Failed to load photo settings';
    } finally {
      photoSettingsLoading = false;
    }
  });

  async function togglePhotoSettings() {
    const next = !savePhotos;
    photoSettingsSaving = true;
    try {
      const result = await upsertPhotoSettings({ savePhotos: next });
      savePhotos = result.savePhotos;
    } catch (e: any) {
      error = e.message || 'Failed to save photo setting';
    } finally {
      photoSettingsSaving = false;
    }
  }

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
      <div class="card-base space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium" style="color: var(--color-text-primary)">Save meter-reading photos</p>
            <p class="text-xs mt-1" style="color: var(--color-text-secondary)">
              Off by default — photos are only used in-memory to suggest a reading value, then
              discarded before submitting.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={savePhotos}
            aria-label="Save meter-reading photos"
            onclick={togglePhotoSettings}
            disabled={photoSettingsLoading || photoSettingsSaving}
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
            style="background-color: {savePhotos ? 'var(--color-accent)' : '#d1d5db'}"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              style="transform: translateX({savePhotos ? '1.5rem' : '0.25rem'})"
            ></span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <BottomNav active="settings" />
</div>
