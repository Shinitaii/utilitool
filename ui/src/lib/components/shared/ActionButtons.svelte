<script lang="ts">
  import { Pencil, Archive } from 'lucide-svelte';

  interface ActionButton {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'secondary';
    icon?: any;
  }

  interface Props {
    onEdit?: () => void;
    onSoftDelete?: () => void;
    isLoading?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    actions?: ActionButton[];
  }

  const {
    onEdit,
    onSoftDelete,
    isLoading = false,
    canEdit = true,
    canDelete = true,
    actions = []
  } = $props();

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  };

  const getVariantClass = (variant: string = 'primary') => {
    return variantClasses[variant as keyof typeof variantClasses] || variantClasses.primary;
  };
</script>

{#if actions.length > 0}
  <div class="flex gap-2">
    {#each actions as action}
      <button
        onclick={action.onClick}
        disabled={isLoading}
        class="px-4 py-2 rounded font-medium text-sm disabled:opacity-50 {getVariantClass(action.variant)}"
      >
        {action.label}
      </button>
    {/each}
  </div>
{:else}
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
{/if}
