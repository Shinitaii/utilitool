<script lang="ts">
	import { onMount } from 'svelte';
	import { getMeterGroups, restoreMeterGroup, clearCache } from '$lib/api/meter-groups';
	import type { MeterGroup } from '$lib/types/meter-group.types';
	import type { PaginatedResult } from '$lib/types/api.types';
	import { formatDate } from '$lib/utils/format';
	import { toDate } from '$lib/utils/timestamp';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import { Trash2 } from 'lucide-svelte';

	let data = $state<PaginatedResult<MeterGroup>>({
		data: [],
		nextCursor: null,
		hasMore: false
	});
	let isLoading = $state(false);
	let error = $state('');
	let restoringId = $state<string | null>(null);
	let isClearing = $state(false);

	const columns = [
		{ key: 'meter_name', label: 'Meter Name' },
		{
			key: 'utility_type',
			label: 'Utility Type',
			format: (v: string) => v.charAt(0).toUpperCase() + v.slice(1)
		},
		{
			key: 'created_at',
			label: 'Created',
			format: (v: any) => formatDate(toDate(v))
		}
	];

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		error = '';
		try {
			const result = await getMeterGroups({ limit: 100, archived: true });
			data = result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load archived meter groups';
		} finally {
			isLoading = false;
		}
	}

	async function handleRestore(id: string) {
		restoringId = id;
		try {
			await restoreMeterGroup(id);
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to restore meter group';
		} finally {
			restoringId = null;
		}
	}

	async function handleClearCache() {
		isClearing = true;
		try {
			const result = await clearCache();
			error = result.message;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to clear cache';
		} finally {
			isClearing = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex justify-end">
		<button
			onclick={handleClearCache}
			disabled={isClearing}
			class="flex items-center gap-2 rounded bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
		>
			<Trash2 size={16} />
			{isClearing ? 'Clearing...' : 'Clear Cache'}
		</button>
	</div>

	<ArchivePageTemplate
		title="Meter Groups"
		isEmpty={data.data.length === 0}
		{isLoading}
		{error}
		items={data.data}
		{columns}
		onRestore={handleRestore}
		{restoringId}
	/>
</div>
