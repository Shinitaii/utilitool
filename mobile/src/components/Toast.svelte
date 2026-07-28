<script lang="ts">
  import { toastState, dismissToast } from '../lib/stores/toast.svelte';

  const VARIANT_STYLES: Record<string, string> = {
    success: 'background-color: #e8f4ea; color: #2c6b3a; border-color: #2c6b3a33',
    warning: 'background-color: #fff3e8; color: #8b5a3c; border-color: #8b5a3c33',
    error: 'background-color: #fde5e0; color: var(--color-status-alert); border-color: var(--color-status-alert)33'
  };
</script>

<div class="fixed bottom-20 left-4 right-4 z-[60] flex flex-col gap-2">
  {#each toastState.toasts as toast (toast.id)}
    <div
      role="status"
      aria-live="polite"
      class="flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
      style={VARIANT_STYLES[toast.variant]}
    >
      <p class="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onclick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        class="text-lg leading-none opacity-60"
      >
        ×
      </button>
    </div>
  {/each}
</div>
