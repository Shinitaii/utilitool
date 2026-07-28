<script lang="ts">
	import { confirmState, resolveConfirm } from '$lib/stores/confirm.svelte';

	const titleId = `confirm-title-${Math.random().toString(36).slice(2)}`;
	let dialogEl: HTMLDivElement | undefined = $state();

	const FOCUSABLE = 'button:not([disabled])';

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE));
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.key === 'Tab') {
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
		if (e.key === 'Escape') {
			resolveConfirm(false);
		}
	}

	$effect(() => {
		if (confirmState.open && dialogEl) {
			const first = dialogEl.querySelector<HTMLElement>(FOCUSABLE);
			first?.focus();
		}
	});
</script>

{#if confirmState.open}
	<div
		role="presentation"
		class="bg-opacity-50 fixed inset-0 z-[60] flex items-center justify-center bg-black"
		onclick={(e) => {
			if (e.target === e.currentTarget) resolveConfirm(false);
		}}
		onkeydown={trapFocus}
	>
		<div
			bind:this={dialogEl}
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
