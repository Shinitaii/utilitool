<script lang="ts">
  import { goto } from '$app/navigation';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import TopBar from '$lib/components/layout/TopBar.svelte';
  import RightPanel from '$lib/components/layout/RightPanel.svelte';
  import { authStore } from '$lib/stores/auth.svelte';

  let { children } = $props();

  // Subscribe to auth store for reactivity
  let authState = $state<any>(null);

  $effect(() => {
    const unsubscribe = authStore.subscribe(state => {
      authState = state;
    });
    return unsubscribe;
  });

  $effect(() => {
    if (authState && !authState.isLoading && !authState.isAuthenticated) {
      goto('/login');
    }
  });
</script>

<div class="flex h-screen w-full bg-gray-50">
  <Sidebar />

  <main class="flex flex-1 flex-col" style="margin-left: 200px">
    <TopBar />

    <div class="flex flex-1 overflow-hidden" style="margin-top: 52px">
      <div class="flex-1 overflow-auto">
        <div class="p-6">
          {@render children()}
        </div>
      </div>

      <RightPanel isOpen={false}>
        <p class="text-gray-500">Select an item to see details</p>
      </RightPanel>
    </div>
  </main>
</div>
