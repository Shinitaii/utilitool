<script lang="ts">
  import { listReadings } from '../lib/api/readings';
  import { listBillings } from '../lib/api/billings';
  import BottomNav from '../components/BottomNav.svelte';

  let recentReadingsCount = $state(0);
  let pendingBillingsCount = $state(0);
  let isLoading = $state(true);

  $effect(async () => {
    try {
      const [readingsRes, billingsRes] = await Promise.all([
        listReadings({ limit: 100 }),
        listBillings({ limit: 100 })
      ]);

      recentReadingsCount = readingsRes.data?.length || 0;
      pendingBillingsCount = (billingsRes.data || []).filter((b: any) => b.payment_status === 'pending').length;
    } catch (e) {
      console.error('Failed to load dashboard stats:', e);
    } finally {
      isLoading = false;
    }
  });
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
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
          {isLoading ? '—' : recentReadingsCount}
        </p>
      </div>
      <div class="card-base text-center p-4">
        <p class="text-xs mb-2" style="color: var(--color-text-secondary)">Pending Billings</p>
        <p class="text-2xl font-bold" style="color: var(--color-text-primary)">
          {isLoading ? '—' : pendingBillingsCount}
        </p>
      </div>
    </div>

  </div>

  <BottomNav active="home" />
</div>
