<script lang="ts">
	import { onMount } from 'svelte';
	import { getBillings, restoreBilling, clearCache } from '$lib/api/billings';
	import { formatFirestoreDate } from '$lib/utils/format';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import ClearCacheButton from '$lib/components/shared/ClearCacheButton.svelte';
	import { createArchivePageState } from '$lib/stores/archive-page.svelte';

	const page = createArchivePageState({
		listFn: getBillings,
		restoreFn: restoreBilling,
		clearCacheFn: clearCache,
		entityLabel: 'billing'
	});

	const columns = [
		{ key: 'property_id', label: 'Property ID', format: (v: string) => v.slice(0, 8) + '...' },
		{
			key: 'previous_reading_id',
			label: 'Previous Reading',
			format: (v: string) => v.slice(0, 8) + '...'
		},
		{
			key: 'current_reading_id',
			label: 'Current Reading',
			format: (v: string) => v.slice(0, 8) + '...'
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
		title="Billings"
		isEmpty={page.data.data.length === 0}
		isLoading={page.isLoading}
		error={page.error}
		items={page.data.data}
		{columns}
		onRestore={page.handleRestore}
		restoringId={page.restoringId}
	/>
</div>
