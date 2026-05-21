<script lang="ts">
  import { RotateCcw, Trash2 } from 'lucide-svelte';
  import EmptyState from './EmptyState.svelte';

  interface Props {
    title: string;
    isEmpty: boolean;
    isLoading: boolean;
    error: string;
    items: any[];
    columns: { key: string; label: string; format?: (value: any) => string }[];
    onRestore: (id: string) => void;
    onHardDelete: (id: string) => void;
    restoringId?: string;
    deletingId?: string;
  }

  const {
    title,
    isEmpty,
    isLoading,
    error,
    items,
    columns,
    onRestore,
    onHardDelete,
    restoringId,
    deletingId
  } = $props();
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">{title} Archive</h1>
    <p class="mt-1 text-gray-600">Archived items ({items.length})</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <div class="overflow-x-auto rounded-lg border border-gray-200">
    {#if isEmpty}
      <div class="p-6">
        <EmptyState title="No archived items" message="Archived items will appear here" />
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50">
          <tr>
            {#each columns as column (column.key)}
              <th class="px-6 py-3 text-left font-semibold text-gray-700">{column.label}</th>
            {/each}
            <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            <tr class="border-b border-gray-200 hover:bg-gray-50">
              {#each columns as column (column.key)}
                <td class="px-6 py-4 text-gray-700">
                  {column.format ? column.format(item[column.key]) : item[column.key]}
                </td>
              {/each}
              <td class="px-6 py-4">
                <div class="flex gap-1">
                  <button
                    onclick={() => onRestore(item.id)}
                    disabled={isLoading || restoringId === item.id}
                    class="p-1.5 rounded hover:bg-green-100 text-green-700 disabled:opacity-50"
                    title="Restore item"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onclick={() => onHardDelete(item.id)}
                    disabled={isLoading || deletingId === item.id}
                    class="p-1.5 rounded hover:bg-red-100 text-red-700 disabled:opacity-50"
                    title="Permanently delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
