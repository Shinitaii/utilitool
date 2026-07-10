<script lang="ts">
	import { Pencil, Archive } from 'lucide-svelte';

	interface ActionButton {
		label: string;
		onClick: () => void;
		variant?: 'primary' | 'danger' | 'secondary';
		icon?: import('svelte').Component;
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
	}: Props = $props();

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
		{#each actions as action (action.label)}
			<button
				onclick={action.onClick}
				disabled={isLoading}
				class="rounded px-4 py-2 text-sm font-medium disabled:opacity-50 {getVariantClass(
					action.variant
				)}"
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
				class="rounded p-1.5 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
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
				class="rounded p-1.5 text-red-700 hover:bg-red-100 disabled:opacity-50"
				title="Archive"
				aria-label="Archive"
			>
				<Archive size={16} />
			</button>
		{/if}
	</div>
{/if}
