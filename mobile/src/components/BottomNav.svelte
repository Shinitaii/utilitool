<script lang="ts">
  import { Home, ClipboardList, Receipt, Settings } from '@lucide/svelte';

  interface Props {
    active: 'home' | 'history' | 'billings' | 'settings';
  }

  const { active }: Props = $props();

  const items = [
    { key: 'home',     label: 'Home',     icon: Home,          hash: '#/home' },
    { key: 'history',  label: 'History',  icon: ClipboardList, hash: '#/history' },
    { key: 'billings', label: 'Billings', icon: Receipt,       hash: '#/billings' },
    { key: 'settings', label: 'Settings', icon: Settings,      hash: '#/settings' },
  ] as const;
</script>

<div class="fixed bottom-0 left-0 right-0 border-t flex justify-around" style="background-color: var(--color-bg-secondary); border-color: var(--color-border)">
  {#each items as item}
    <button
      onclick={() => { window.location.hash = item.hash; }}
      class="flex-1 py-3 flex flex-col items-center gap-1 border-none cursor-pointer"
      style="background: transparent; color: {active === item.key ? 'var(--color-accent)' : 'var(--color-text-secondary)'}"
    >
      <item.icon size={20} />
      <span class="text-xs font-medium">{item.label}</span>
    </button>
  {/each}
</div>
