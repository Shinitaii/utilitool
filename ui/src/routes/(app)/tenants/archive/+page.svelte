<script lang="ts">
  import { onMount } from 'svelte';
  import { getTenants, restoreTenant, deleteTenant } from '$lib/api/tenants';
  import { getProperties } from '$lib/api/properties';
  import type { Tenant } from '$lib/types/tenant.types';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';

  let data = $state<PaginatedResult<Tenant>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let properties = $state<Property[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

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

  async function handleHardDelete(id: string) {
    if (confirm('Permanently delete this tenant? This cannot be undone.')) {
      deletingId = id;
      try {
        await deleteTenant(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to delete tenant';
      } finally {
        deletingId = null;
      }
    }
  }
</script>

<ArchivePageTemplate
  title="Tenants"
  isEmpty={data.data.length === 0}
  isLoading={isLoading}
  error={error}
  items={data.data}
  columns={columns}
  onRestore={handleRestore}
  onHardDelete={handleHardDelete}
  restoringId={restoringId}
  deletingId={deletingId}
/>
