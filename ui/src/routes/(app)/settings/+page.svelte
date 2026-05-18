<script lang="ts">
  import { page } from '$app/stores';

  interface SettingsSection {
    title: string;
    description: string;
    href: string;
  }

  const sections: SettingsSection[] = [
    {
      title: 'Payment QR Code',
      description: 'Configure payment QR code for tenant receipts',
      href: '/settings/payment'
    },
    {
      title: 'Users',
      description: 'Create and manage user accounts',
      href: '/settings/users'
    }
  ];

  function isActive(path: string): boolean {
    return $page.url.pathname === path;
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Settings</h1>
    <p class="text-gray-600">Manage your application settings</p>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    {#each sections as section (section.href)}
      <a
        href={section.href}
        class="rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        <h2 class="text-lg font-semibold text-gray-900">{section.title}</h2>
        <p class="mt-2 text-sm text-gray-600">{section.description}</p>
        <div class="mt-4 text-sm font-medium" style="color: var(--color-accent)">
          Go to settings →
        </div>
      </a>
    {/each}
  </div>
</div>
