<script lang="ts">
	interface Props {
		isOpen: boolean;
		title: string;
		isLoading: boolean;
		onClose: () => void;
		onSubmit: () => void;
		submitButtonText?: string;
		children?: import('svelte').Snippet;
	}

	const {
		isOpen = $bindable(),
		title,
		isLoading,
		onClose,
		onSubmit,
		submitButtonText = 'Save',
		children
	}: Props = $props();

	const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
	let dialogEl: HTMLDivElement | undefined = $state();

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
			onClose();
		}
	}

	$effect(() => {
		if (isOpen && dialogEl) {
			const first = dialogEl.querySelector<HTMLElement>(FOCUSABLE);
			first?.focus();
			document.body.classList.add('modal-open');
		} else {
			document.body.classList.remove('modal-open');
		}
	});
</script>

{#if isOpen}
	<div
		role="presentation"
		class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
		onkeydown={trapFocus}
	>
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			class="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl"
		>
			<!-- Header -->
			<div
				class="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-6"
			>
				<h2 id={titleId} class="text-xl font-bold text-gray-900">{title}</h2>
				<button
					onclick={onClose}
					disabled={isLoading}
					aria-label="Close dialog"
					class="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-50"
				>
					×
				</button>
			</div>

			<!-- Content -->
			<div class="p-6">
				{#if children}
					{@render children()}
				{/if}
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-6">
				<button
					onclick={onClose}
					disabled={isLoading}
					class="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={onSubmit}
					disabled={isLoading}
					class="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{isLoading ? 'Saving...' : submitButtonText}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body.modal-open) {
		overflow: hidden;
	}
</style>
