<script lang="ts">
	interface Props {
		label: string;
		value: string | number;
		sub?: string;
		accent?: boolean;
	}

	const { label, value, sub, accent = false }: Props = $props();
</script>

<div
	class="rounded-lg border border-gray-200 bg-white p-6"
	style={accent ? `background-color: var(--color-status-unpaid-bg)` : undefined}
>
	<p class="text-sm font-medium text-gray-600">{label}</p>
	<p class="mt-2 text-3xl font-bold" style={accent ? `color: var(--color-accent)` : undefined}>
		{value}
	</p>
	{#if sub}
		<p class="mt-1 text-xs text-gray-500">{sub.toUpperCase()}</p>
	{/if}
</div>
