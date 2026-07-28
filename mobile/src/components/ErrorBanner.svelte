<script lang="ts">
  interface Props {
    message: string;
    onDismiss?: () => void;
  }

  const { message, onDismiss }: Props = $props();
</script>

<div
  role="alert"
  class="p-4 m-4 rounded border flex items-center justify-between gap-3"
  style="background-color: #fde5e0; border-color: var(--color-status-alert); color: var(--color-status-alert)"
>
  <span class="text-sm font-medium">{message}</span>
  {#if onDismiss}
    <button
      onclick={onDismiss}
      aria-label="Dismiss error"
      class="text-lg leading-none"
      style="color: var(--color-status-alert)"
    >
      ✕
    </button>
  {/if}
</div>
