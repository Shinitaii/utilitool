<script lang="ts">
  import { confirmState, resolveConfirm } from '../lib/stores/confirm.svelte';
  import { focusTrap } from '../lib/utils/focus-trap';
</script>

{#if confirmState.open}
  <div
    role="presentation"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
    onclick={(e) => {
      if (e.target === e.currentTarget) resolveConfirm(false);
    }}
  >
    <div
      use:focusTrap={{ active: true, onEscape: () => resolveConfirm(false) }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-sheet-title"
      class="w-full max-w-md rounded-t-2xl bg-white p-6 pb-8"
    >
      <div class="mx-auto mb-4 h-1 w-10 rounded-full" style="background-color: var(--color-border)"></div>
      <h2 id="confirm-sheet-title" class="text-lg font-bold" style="color: var(--color-text-primary)">
        {confirmState.title}
      </h2>
      <p class="mt-2 text-sm" style="color: var(--color-text-secondary)">{confirmState.message}</p>
      <div class="mt-6 flex flex-col gap-2">
        <button
          onclick={() => resolveConfirm(true)}
          class="w-full rounded py-3 font-semibold text-white"
          style="background-color: {confirmState.danger ? 'var(--color-status-alert)' : 'var(--color-accent)'}"
        >
          {confirmState.confirmLabel}
        </button>
        <button
          onclick={() => resolveConfirm(false)}
          class="w-full rounded border py-3 font-semibold"
          style="border-color: var(--color-border); color: var(--color-text-primary)"
        >
          {confirmState.cancelLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
