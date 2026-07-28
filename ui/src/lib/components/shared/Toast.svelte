<script lang="ts">
	import { toastState, dismissToast } from '$lib/stores/toast.svelte';

	const VARIANT_CLASSES: Record<string, string> = {
		success: 'bg-green-50 text-green-800 border-green-200',
		warning: 'bg-amber-50 text-amber-800 border-amber-200',
		error: 'bg-red-50 text-red-800 border-red-200'
	};
</script>

<div class="fixed bottom-6 right-6 z-[70] flex flex-col gap-2">
	{#each toastState.toasts as toast (toast.id)}
		<div
			role="status"
			aria-live="polite"
			class={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
		>
			<p class="text-sm font-medium">{toast.message}</p>
			<button
				onclick={() => dismissToast(toast.id)}
				aria-label="Dismiss notification"
				class="ml-2 text-lg leading-none opacity-60 hover:opacity-100"
			>
				×
			</button>
		</div>
	{/each}
</div>
