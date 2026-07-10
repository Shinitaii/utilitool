<script lang="ts">
	interface Props {
		/** Number of placeholder rows to render */
		rows?: number;
		/** Number of placeholder columns per row */
		cols?: number;
	}

	let { rows = 5, cols = 4 }: Props = $props();
</script>

<div class="animate-pulse p-4" role="status" aria-busy="true" aria-label="Loading">
	<!-- Header row -->
	<div class="flex gap-4 border-b border-gray-100 pb-3">
		{#each Array(cols) as _, i (i)}
			<div class="h-4 flex-1 rounded bg-gray-200"></div>
		{/each}
	</div>
	<!-- Body rows -->
	{#each Array(rows) as _, r (r)}
		<div class="flex gap-4 border-b border-gray-50 py-4">
			{#each Array(cols) as _, c (c)}
				<div class="h-4 flex-1 rounded bg-gray-100"></div>
			{/each}
		</div>
	{/each}
	<span class="sr-only">Loading…</span>
</div>
