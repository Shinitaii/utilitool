<script lang="ts">
	import { confirmState, resolveConfirm } from '$lib/stores/confirm.svelte';
	import { focusTrap } from '$lib/utils/focus-trap';

	const titleId = `confirm-title-${Math.random().toString(36).slice(2)}`;
</script>

{#if confirmState.open}
	<div
		role="presentation"
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		onclick={(e) => {
			if (e.target === e.currentTarget) resolveConfirm(false);
		}}
	>
		<div
			use:focusTrap={{ active: true, onEscape: () => resolveConfirm(false), lockScroll: true }}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby={titleId}
			class="mx-4 w-full max-w-sm rounded-lg bg-white shadow-xl"
		>
			<div class="p-6">
				<h2 id={titleId} class="text-lg font-bold text-gray-900">{confirmState.title}</h2>
				<p class="mt-2 text-sm text-gray-600">{confirmState.message}</p>
			</div>
			<div class="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-4">
				<button
					onclick={() => resolveConfirm(false)}
					class="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
				>
					{confirmState.cancelLabel}
				</button>
				<button
					onclick={() => resolveConfirm(true)}
					class={confirmState.danger
						? 'rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700'
						: 'rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700'}
				>
					{confirmState.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
