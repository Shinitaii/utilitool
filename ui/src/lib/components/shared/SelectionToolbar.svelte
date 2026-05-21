<script lang="ts">
  interface Props {
    selectedCount: number;
    isBatchDeleting: boolean;
    onBatchDelete: () => void;
    entityLabel?: string;
  }

  const {
    selectedCount,
    isBatchDeleting,
    onBatchDelete,
    entityLabel = 'item'
  } = $props();

  const label = $derived(selectedCount === 1 ? entityLabel : `${entityLabel}s`);
</script>

{#if selectedCount > 0}
  <div
    class="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3"
    role="status"
    aria-live="polite"
  >
    <span class="text-sm font-medium text-blue-900">
      {selectedCount} {label} selected
    </span>
    <button
      onclick={onBatchDelete}
      disabled={isBatchDeleting}
      aria-label="Archive selected {label}"
      class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
    >
      {isBatchDeleting ? 'Archiving...' : 'Archive Selected'}
    </button>
  </div>
{/if}
