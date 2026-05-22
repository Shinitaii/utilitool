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
        onclick={logout}
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
