<script lang="ts">
	import { onMount } from 'svelte';
	import { getReadings, restoreReading, clearCache } from '$lib/api/readings';
	import { getMeterGroups } from '$lib/api/meter-groups';
	import type { MeterGroup } from '$lib/types/meter-group.types';
	import { formatFirestoreDate } from '$lib/utils/format';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import ClearCacheButton from '$lib/components/shared/ClearCacheButton.svelte';
	import { createArchivePageState } from '$lib/stores/archive-page.svelte';

	let meterGroups = $state<Map<string, string>>(new Map());

	const page = createArchivePageState({
		listFn: getReadings,
		restoreFn: restoreReading,
		clearCacheFn: clearCache,
		entityLabel: 'reading',
		loadExtra: async () => {
			const result = await getMeterGroups({ limit: 100 });
			meterGroups = new Map(result.data.map((mg: MeterGroup) => [mg.id, mg.meter_name]));
		}
	});

	const columns = [
		{
			key: 'meter_group_id',
			label: 'Meter Group',
			format: (v: string) => meterGroups.get(v) || 'Unknown'
		},
		{
			key: 'reading_amount',
			label: 'Reading (kWh)',
			format: (v: number) => v.toLocaleString()
		},
		{
			key: 'reading_date',
			label: 'Reading Date',
			format: (v: any) => formatFirestoreDate(v)
		}
	];

	onMount(async () => {
		await page.loadData();
	});
</script>

<div class="space-y-4">
	<ClearCacheButton isClearing={page.isClearing} onClick={page.handleClearCache} />

	<ArchivePageTemplate
		title="Readings"
		isEmpty={page.data.data.length === 0}
		isLoading={page.isLoading}
		error={page.error}
		items={page.data.data}
		{columns}
		onRestore={page.handleRestore}
		restoringId={page.restoringId}
	/>
</div>
