<script lang="ts">
  interface Props {
    onEdit: () => void;
    onSoftDelete: () => void;
    isLoading?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
  }

  const {
    onEdit,
    onSoftDelete,
    isLoading = false,
    canEdit = true,
    canDelete = true
  } = $props();
</script>

<div class="flex gap-2">
  {#if canEdit}
    <button
      onclick={onEdit}
      disabled={isLoading}
      class="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-sm disabled:opacity-50"
      title="Edit"
    >
      Edit
    </button>
  {/if}
  {#if canDelete}
    <button
      onclick={onSoftDelete}
      disabled={isLoading}
      class="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium text-sm disabled:opacity-50"
      title="Archive (soft delete)"
    >
      Archive
    </button>
  {/if}
</div>
