<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillings, restoreBilling, clearCache } from '$lib/api/billings';
  import type { Billing } from '$lib/types/billing.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
  import { Trash2 } from 'lucide-svelte';

  let data = $state<PaginatedResult<Billing>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let isLoading = $state(false);
  let error = $state('');
  let restoringId = $state<string | null>(null);
  let isClearing = $state(false);

  const columns = [
    { key: 'property_id', label: 'Property ID', format: (v: string) => v.slice(0, 8) + '...' },
    { key: 'previous_reading_id', label: 'Previous Reading', format: (v: string) => v.slice(0, 8) + '...' },
    { key: 'current_reading_id', label: 'Current Reading', format: (v: string) => v.slice(0, 8) + '...' },
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
      const result = await getBillings({ limit: 100, archived: true });
      data = result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load archived billings';
    } finally {
      isLoading = false;
    }
  }

  async function handleRestore(id: string) {
    restoringId = id;
    try {
      await restoreBilling(id);
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to restore billing';
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
    title="Billings"
    isEmpty={data.data.length === 0}
    isLoading={isLoading}
    error={error}
    items={data.data}
    columns={columns}
    onRestore={handleRestore}
    restoringId={restoringId}
  />
</div>
