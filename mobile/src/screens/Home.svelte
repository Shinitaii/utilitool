<script lang="ts">
  import { onMount } from 'svelte';
  import { listReadings } from '../lib/api/readings';
  import { listBillings } from '../lib/api/billings';
  import BottomNav from '../components/BottomNav.svelte';

  let recentReadingsCount = $state(0);
  let pendingBillingsCount = $state(0);
  let isLoading = $state(true);
  let statsError = $state(false);
  let headingEl: HTMLElement | undefined = $state();

  onMount(() => {
    headingEl?.focus();
    loadStats();
  });

  async function loadStats() {
    isLoading = true;
    statsError = false;
    try {
      const [readingsRes, billingsRes] = await Promise.all([
        listReadings({ limit: 100 }),
        listBillings({ limit: 100 })
      ]);

      recentReadingsCount = readingsRes.data?.length || 0;
      pendingBillingsCount = (billingsRes.data || []).filter((b: any) => b.payment_status === 'pending').length;
    } catch (e) {
      statsError = true;
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen pb-24" style="background-color: var(--color-bg-primary)">
  <!-- Header -->
  <div class="p-6 border-b" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
    <h1
      bind:this={headingEl}
      tabindex="-1"
      class="text-3xl font-bold mb-1 outline-none"
      style="color: var(--color-accent)"
    >
      Utilitool
    </h1>
    <p class="text-sm" style="color: var(--color-text-secondary)">Meter Reading Assistant</p>
  </div>

  <!-- Main Content -->
  <main class="p-4 space-y-6">
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
        {#if statsError}
          <button onclick={loadStats} class="text-xs font-semibold" style="color: var(--color-status-alert)">
            Failed to load — Retry
          </button>
        {:else}
          <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
            {isLoading ? '—' : recentReadingsCount}
          </p>
        {/if}
      </div>
      <div class="card-base text-center p-4">
        <p class="text-xs mb-2" style="color: var(--color-text-secondary)">Pending Billings</p>
        {#if statsError}
          <button onclick={loadStats} class="text-xs font-semibold" style="color: var(--color-status-alert)">
            Failed to load — Retry
          </button>
        {:else}
          <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
            {isLoading ? '—' : pendingBillingsCount}
          </p>
        {/if}
      </div>
    </div>

  </main>

  <BottomNav active="home" />
</div>
