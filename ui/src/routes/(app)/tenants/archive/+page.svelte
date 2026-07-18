<script lang="ts">
	import { onMount } from 'svelte';
	import { getTenants, restoreTenant, clearCache } from '$lib/api/tenants';
	import { getProperties } from '$lib/api/properties';
	import type { Property } from '$lib/types/property.types';
	import { formatFirestoreDate } from '$lib/utils/format';
	import ArchivePageTemplate from '$lib/components/shared/ArchivePageTemplate.svelte';
	import ClearCacheButton from '$lib/components/shared/ClearCacheButton.svelte';
	import { createArchivePageState } from '$lib/stores/archive-page.svelte';

	let properties = $state<Property[]>([]);

	const page = createArchivePageState({
		listFn: getTenants,
		restoreFn: restoreTenant,
		clearCacheFn: clearCache,
		entityLabel: 'tenant',
		loadExtra: async () => {
			const result = await getProperties({ limit: 100 });
			properties = result.data;
		}
	});

	const columns = [
		{ key: 'tenant_name', label: 'Tenant Name' },
		{
			key: 'property_id',
			label: 'Property',
			format: (v: string) => properties.find((p) => p.id === v)?.room_name || 'Unknown'
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
		title="Tenants"
		isEmpty={page.data.data.length === 0}
		isLoading={page.isLoading}
		error={page.error}
		items={page.data.data}
		{columns}
		onRestore={page.handleRestore}
		restoringId={page.restoringId}
	/>
</div>
