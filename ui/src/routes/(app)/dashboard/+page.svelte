<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';

  const auth = $derived(authStore);
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Welcome back</h1>
    <p class="mt-2 text-gray-600">Dashboard · Property Utility Management</p>
  </div>

  <div class="grid grid-cols-4 gap-4">
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <p class="text-sm font-medium text-gray-600">This Month Billed</p>
      <p class="mt-2 text-3xl font-bold">₱48,210</p>
      <p class="mt-1 text-xs text-gray-500">Meralco + MWSS</p>
    </div>
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <p class="text-sm font-medium text-gray-600">Collected</p>
      <p class="mt-2 text-3xl font-bold">₱31,400</p>
      <p class="mt-1 text-xs text-gray-500">65%</p>
    </div>
    <div class="rounded-lg border border-gray-200 bg-white p-6" style="background-color: var(--color-status-unpaid-bg)">
      <p class="text-sm font-medium text-gray-600">Outstanding</p>
      <p class="mt-2 text-3xl font-bold">₱16,810</p>
      <p class="mt-1 text-xs text-gray-500">5 tenants</p>
    </div>
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <p class="text-sm font-medium text-gray-600">Due in 7 Days</p>
      <p class="mt-2 text-3xl font-bold">3</p>
      <p class="mt-1 text-xs text-gray-500">Reminders queued</p>
    </div>
  </div>

  <div class="rounded-lg border border-gray-200 bg-white p-6">
    <h2 class="font-semibold">Properties Summary</h2>
    <p class="mt-4 text-sm text-gray-600">Properties list coming soon</p>
  </div>
</div>
