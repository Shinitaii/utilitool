<script lang="ts">
	import { onMount } from 'svelte';
	import { getProperties, restoreProperty, clearCache } from '$lib/api/properties';
	import { formatFirestoreDate } from '$lib/utils/format';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import ClearCacheButton from '$lib/components/shared/ClearCacheButton.svelte';
	import { createArchivePageState } from '$lib/stores/archive-page.svelte';

	const page = createArchivePageState({
		listFn: getProperties,
		restoreFn: restoreProperty,
		clearCacheFn: clearCache,
		entityLabel: 'property'
	});

	const columns = [
		{ key: 'room_name', label: 'Room Name' },
		{ key: 'tenant_amount', label: 'Tenant Amount' },
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
		title="Properties"
		isEmpty={page.data.data.length === 0}
		isLoading={page.isLoading}
		error={page.error}
		items={page.data.data}
		{columns}
		onRestore={page.handleRestore}
		restoringId={page.restoringId}
	/>
</div>
