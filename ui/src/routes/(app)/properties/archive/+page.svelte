<script lang="ts">
  import { onMount } from 'svelte';
  import { getProperties, restoreProperty, deleteProperty, clearCache } from '$lib/api/properties';
  import type { Property } from '$lib/types/property.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
  import { Trash2 } from 'lucide-svelte';

  let data = $state<PaginatedResult<Property>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let isClearing = $state(false);

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
      const result = await getProperties({ limit: 100, archived: true });
      data = result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived properties';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await restoreProperty(id);
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
</div>
