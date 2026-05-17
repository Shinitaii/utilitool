<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties, updateProperty, deleteProperty } from '$lib/api/properties';
  import type { Property, UpdatePropertyRequest } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';

  let data = $state<PaginatedResult<Property>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  const columns = [
    { key: 'room_name', label: 'Room Name' },
    { key: 'tenant_amount', label: 'Tenant Amount' },
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
      const result = await getProperties({ limit: 100 });
      data = {
        ...result,
        data: result.data.filter((p: Property) => p.deleted_at !== null && p.deleted_at !== undefined)
      };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived properties';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await updateProperty(id, { deleted_at: null } as UpdatePropertyRequest);
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore property';
    } finally {
      restoringId = null;
    }
  }

  async function handleHardDelete(id: string) {
    if (confirm('Permanently delete this property? This cannot be undone.')) {
      deletingId = id;
      try {
        await deleteProperty(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to delete property';
      } finally {
        deletingId = null;
      }
    }
  }
</script>

<ArchivePageTemplate
  title="Properties"
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
