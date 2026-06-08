<script lang="ts">
  import { onMount } from 'svelte';
  import { getTenants, restoreTenant, clearCache } from '$lib/api/tenants';
  import { getProperties } from '$lib/api/properties';
  import type { Tenant } from '$lib/types/tenant.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
  import { Trash2 } from 'lucide-svelte';

  let data = $state<PaginatedResult<Tenant>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let properties = $state<Property[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let isClearing = $state(false);

  const columns = [
    { key: 'tenant_name', label: 'Tenant Name' },
    {
      key: 'property_id',
      label: 'Property',
      format: (v: string) => properties.find(p => p.id === v)?.room_name || 'Unknown'
    },
    {
      key: 'created_at',
      label: 'Created',
      format: (v: any) => formatDate(toDate(v))
    }
  ];

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const [tenantsResult, propertiesResult] = await Promise.all([
        getTenants({ limit: 100, archived: true }),
        getProperties({ limit: 100 })
      ]);
      data = tenantsResult;
      properties = propertiesResult.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived tenants';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await restoreTenant(id);
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore tenant';
    } finally {
      restoringId = null;
    }
  }

  async function handleClearCache() {
    isClearing = true;
    try {
      const result = await clearCache();
      error = result.message;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to clear cache';
    } finally {
      isClearing = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex justify-end">
    <button
      onclick={handleClearCache}
      disabled={isClearing}
      class="flex items-center gap-2 px-3 py-2 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 font-medium text-sm"
    >
      <Trash2 size={16} />
      {isClearing ? 'Clearing...' : 'Clear Cache'}
    </button>
  </div>

  <ArchivePageTemplate
    title="Tenants"
    isEmpty={data.data.length === 0}
    isLoading={isLoading}
    error={error}
    items={data.data}
    columns={columns}
    onRestore={handleRestore}
    restoringId={restoringId}
  />
</div>
