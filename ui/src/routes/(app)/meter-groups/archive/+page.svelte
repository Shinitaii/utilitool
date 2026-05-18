<script lang="ts">
  import { onMount } from 'svelte';
  import { getMeterGroups, restoreMeterGroup, deleteMeterGroup } from '$lib/api/meter-groups';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';

  let data = $state<PaginatedResult<MeterGroup>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  const columns = [
    { key: 'meter_name', label: 'Meter Name' },
    { key: 'utility_type', label: 'Utility Type', format: (v: string) => v.charAt(0).toUpperCase() + v.slice(1) },
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
      const result = await getMeterGroups({ limit: 100, archived: true });
      data = result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived meter groups';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await restoreMeterGroup(id);
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore meter group';
    } finally {
      restoringId = null;
    }
  }

  async function handleHardDelete(id: string) {
    if (confirm('Permanently delete this meter group? This cannot be undone.')) {
      deletingId = id;
      try {
        await deleteMeterGroup(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to delete meter group';
      } finally {
        deletingId = null;
      }
    }
  }
</script>

<ArchivePageTemplate
  title="Meter Groups"
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
