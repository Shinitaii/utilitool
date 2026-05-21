<script lang="ts">
  import { Pencil, Archive } from 'lucide-svelte';

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

<div class="flex gap-1">
  {#if canEdit}
    <button
      onclick={onEdit}
      disabled={isLoading}
      class="p-1.5 rounded hover:bg-blue-100 text-blue-700 disabled:opacity-50"
      title="Edit"
      aria-label="Edit"
    >
      <Pencil size={16} />
    </button>
  {/if}
  {#if canDelete}
    <button
      onclick={onSoftDelete}
      disabled={isLoading}
      class="p-1.5 rounded hover:bg-red-100 text-red-700 disabled:opacity-50"
      title="Archive"
      aria-label="Archive"
    >
      <Archive size={16} />
    </button>
  {/if}
</div>
