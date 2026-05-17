<script lang="ts">
  interface Props {
    isOpen: boolean;
    title: string;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: () => void;
    submitButtonText?: string;
  }

  const {
    isOpen = $bindable(),
    title,
    isLoading,
    onClose,
    onSubmit,
    submitButtonText = 'Save'
  } = $props();
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
        <h2 class="text-xl font-bold text-gray-900">{title}</h2>
        <button
          onclick={onClose}
          disabled={isLoading}
          class="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-50"
        >
          ×
        </button>
      </div>

      <!-- Content -->
      <div class="p-6">
        <slot />
      </div>

      <!-- Footer -->
      <div class="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex gap-3 justify-end">
        <button
          onclick={onClose}
          disabled={isLoading}
          class="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={onSubmit}
          disabled={isLoading}
          class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : submitButtonText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Prevent body scroll when modal is open */
  :global(body.modal-open) {
    overflow: hidden;
  }
</style>
