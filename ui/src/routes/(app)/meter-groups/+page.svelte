<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getMeterGroups,
		createMeterGroup,
		updateMeterGroup,
		softDeleteMeterGroup
	} from '$lib/api/meter-groups';
	import type {
		MeterGroup,
		CreateMeterGroupRequest,
		UpdateMeterGroupRequest
	} from '$lib/types/meter-group.types';
	import type { PaginatedResult } from '$lib/types/api.types';
	import { formatDate } from '$lib/utils/format';
	import { toDate } from '$lib/utils/timestamp';
	import { getUtilityTypeBadgeClasses } from '$lib/utils/utility-colors';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import EditModal from '$lib/components/shared/EditModal.svelte';
	import ActionButtons from '$lib/components/shared/ActionButtons.svelte';
	import SelectionToolbar from '$lib/components/shared/SelectionToolbar.svelte';
	import { createCrudStore } from '$lib/stores/crud.svelte';
	import { Archive, Plus } from 'lucide-svelte';

	const crud = createCrudStore<MeterGroup>();

	let data = $state<PaginatedResult<MeterGroup>>({
		data: [],
		nextCursor: null,
		hasMore: false
	});
	let error = $state('');
	let createFormOpen = $state(false);
	let isUpdating = $state(false);
	let isCreating = $state(false);

	let createFormData = $state<CreateMeterGroupRequest>({
		meter_name: '',
		utility_type: 'electricity'
	});

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		error = '';
		try {
			data = await getMeterGroups({ limit: 100 });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load meter groups';
		}
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		isCreating = true;
		try {
			await createMeterGroup(createFormData);
			createFormOpen = false;
			createFormData = { meter_name: '', utility_type: 'electricity' };
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create meter group';
		} finally {
			isCreating = false;
		}
	}

	async function handleUpdate() {
		if (!crud.editingItem) return;
		isUpdating = true;
		try {
			await updateMeterGroup(crud.editingItem.id, crud.editFormData as UpdateMeterGroupRequest);
			crud.closeEditModal();
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update meter group';
		} finally {
			isUpdating = false;
		}
	}

	const editData = $derived(crud.editFormData as UpdateMeterGroupRequest);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Meter Groups</h1>
			<p class="mt-1 text-gray-600">{data.data.length} total</p>
		</div>
		<div class="flex gap-3">
			<a
				href={resolve('/meter-groups/archive')}
				class="rounded p-2 text-gray-700 hover:bg-gray-100"
				title="View archive"
				aria-label="View meter groups archive"
			>
				<Archive size={20} />
			</a>
			<button
				onclick={() => (createFormOpen = !createFormOpen)}
				disabled={isCreating}
				class="rounded p-2 text-white disabled:opacity-50"
				style="background-color: var(--color-accent)"
				title="Create new meter group"
				aria-label={createFormOpen ? 'Cancel new meter group' : 'Create new meter group'}
			>
				<Plus size={20} />
			</button>
		</div>
	</div>

	{#if error || crud.error}
		<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
			{error || crud.error}
		</div>
	{/if}

	{#if createFormOpen}
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="font-semibold">New Meter Group</h2>
			<form onsubmit={handleCreate} class="mt-4 space-y-4">
				<div>
					<label for="meter-name" class="block text-sm font-medium text-gray-700">Meter Name</label>
					<input
						id="meter-name"
						type="text"
						bind:value={createFormData.meter_name}
						required
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
						placeholder="e.g., Main Meter"
					/>
				</div>
				<div>
					<label for="utility-type" class="block text-sm font-medium text-gray-700"
						>Utility Type</label
					>
					<select
						id="utility-type"
						bind:value={createFormData.utility_type}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					>
						<option value="electricity">Electricity</option>
						<option value="water">Water</option>
					</select>
				</div>
				<div class="flex space-x-2">
					<button
						type="submit"
						disabled={isCreating}
						class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
						style="background-color: var(--color-accent)"
					>
						{isCreating ? 'Creating...' : 'Create'}
					</button>
					<button
						type="button"
						disabled={isCreating}
						onclick={() => (createFormOpen = false)}
						class="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		{#if data.data.length === 0}
			<div class="p-6">
				<EmptyState
					title="No meter groups"
					message="Create your first meter group to get started"
				/>
			</div>
		{:else}
			<div class="mb-4 space-y-3">
				<SelectionToolbar
					selectedCount={crud.selectedIds.size}
					isBatchDeleting={crud.isBatchDeleting}
					onBatchDelete={() => crud.handleBatchDelete(softDeleteMeterGroup, loadData)}
					entityLabel="meter group"
				/>
			</div>
			<table class="w-full text-sm">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th scope="col" class="w-8 px-4 py-3">
							<input
								type="checkbox"
								checked={crud.selectedIds.size === data.data.length && data.data.length > 0}
								onchange={() =>
									crud.toggleSelectAll(
										data.data.map((i) => i.id),
										data.data.map((i) => i.id)
									)}
								class="rounded"
							/>
						</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Meter Name</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Utility Type</th
						>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.data as item (item.id)}
						<tr class="border-b border-gray-200 hover:bg-gray-50">
							<td class="w-8 px-4 py-4">
								<input
									type="checkbox"
									checked={crud.selectedIds.has(item.id)}
									onchange={() => crud.toggleSelection(item.id)}
									class="rounded"
								/>
							</td>
							<td class="px-6 py-4">{item.meter_name}</td>
							<td class="px-6 py-4">
								<span
									class="rounded {getUtilityTypeBadgeClasses(
										item.utility_type
									)} px-2 py-1 text-xs font-medium capitalize"
								>
									{item.utility_type}
								</span>
							</td>
							<td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.created_at))}</td>
							<td class="px-6 py-4">
								<div class="flex items-center gap-1">
									<ActionButtons
										onEdit={() =>
											crud.openEditModal(item, {
												meter_name: item.meter_name,
												utility_type: item.utility_type
											})}
										onSoftDelete={() =>
											crud.handleSoftDelete(item.id, softDeleteMeterGroup, loadData, () =>
												confirm('Archive this meter group? It can be restored from the archive.')
											)}
										isLoading={crud.deletingId === item.id}
									/>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<!-- Edit Modal -->
<EditModal
	bind:isOpen={crud.editModalOpen}
	title="Edit Meter Group"
	isLoading={isUpdating}
	onClose={crud.closeEditModal}
	onSubmit={handleUpdate}
>
	<div class="space-y-4">
		<div>
			<label for="edit-meter-name" class="block text-sm font-medium text-gray-700">Meter Name</label
			>
			<input
				id="edit-meter-name"
				type="text"
				bind:value={editData.meter_name}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>
		<div>
			<label for="edit-utility-type" class="block text-sm font-medium text-gray-700"
				>Utility Type</label
			>
			<select
				id="edit-utility-type"
				bind:value={editData.utility_type}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			>
				<option value="electricity">Electricity</option>
				<option value="water">Water</option>
			</select>
		</div>
	</div>
</EditModal>
