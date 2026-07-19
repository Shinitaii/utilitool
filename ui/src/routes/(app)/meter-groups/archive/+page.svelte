<script lang="ts">
	import { onMount } from 'svelte';
	import { getMeterGroups, restoreMeterGroup, clearCache } from '$lib/api/meter-groups';
	import { formatFirestoreDate } from '$lib/utils/format';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import ClearCacheButton from '$lib/components/shared/ClearCacheButton.svelte';
	import { createArchivePageState } from '$lib/stores/archive-page.svelte';

	const page = createArchivePageState({
		listFn: getMeterGroups,
		restoreFn: restoreMeterGroup,
		clearCacheFn: clearCache,
		entityLabel: 'meter group'
	});

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
		title="Meter Groups"
		isEmpty={page.data.data.length === 0}
		isLoading={page.isLoading}
		error={page.error}
		items={page.data.data}
		{columns}
		onRestore={page.handleRestore}
		restoringId={page.restoringId}
	/>
</div>
