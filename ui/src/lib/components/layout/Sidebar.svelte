<script lang="ts">
  import { page } from '$app/stores';
  import { getInitials } from '$lib/utils/format';

  interface NavItem {
    label: string;
    href: string;
    badge?: number;
  }

  const navItems: NavItem[] = [
    { label: 'Home', href: '/dashboard' },
    { label: 'Meter Groups', href: '/meter-groups', badge: 0 },
    { label: 'Properties', href: '/properties', badge: 4 },
    { label: 'Tenants', href: '/tenants', badge: 12 },
    { label: 'Readings', href: '/readings', badge: 0 },
    { label: 'Billings', href: '/billings', badge: 2 },
    { label: 'Reports', href: '/reports' }
  ];

  let userName = $state('User');
  let userEmail = $state('user@example.com');

  function isActive(path: string): boolean {
    return $page.url.pathname.startsWith(path);
  }

  function getInitialsFromName(name: string): string {
    return getInitials(name);
  }
</script>

<aside class="flex h-screen w-[200px] flex-col border-r border-gray-200 bg-white p-4">
  <div class="mb-8">
    <h1 class="text-2xl font-bold" style="color: var(--color-accent)">utilitool</h1>
  </div>

  <nav class="flex-1 space-y-1">
    {#each navItems as item (item.href)}
      <a
        href={item.href}
        class="flex items-center justify-between rounded px-3 py-2 text-sm font-medium transition-colors"
        class:active={isActive(item.href)}
        class:bg-gray-900={isActive(item.href)}
        class:text-white={isActive(item.href)}
        class:text-gray-700={!isActive(item.href)}
        class:hover:bg-gray-50={!isActive(item.href)}
      >
        <span>{item.label}</span>
        {#if item.badge && item.badge > 0}
          <span
            class="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700"
          >
            {item.badge}
          </span>
        {/if}
      </a>
    {/each}
  </nav>

  <div class="border-t border-gray-200 pt-4">
    <div class="flex items-center space-x-3">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
        style="background-color: var(--color-accent)"
      >
        {getInitialsFromName(userName)}
      </div>
      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-medium text-gray-900">{userName}</p>
        <p class="truncate text-xs text-gray-500">{userEmail}</p>
      </div>
    </div>
  </div>
</aside>

<style>
  aside {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    z-index: 40;
  }

  .active {
    background-color: var(--color-ink);
    color: white;
  }
</style>
