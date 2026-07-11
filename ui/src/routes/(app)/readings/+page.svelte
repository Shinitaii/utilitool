<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getReadings,
		createReadingsBatch,
		createReading,
		createSeedReading,
		updateReading,
		softDeleteReading,
		ocrReadingImage
	} from '$lib/api/readings';
	import { getMeterGroups } from '$lib/api/meter-groups';
	import { getProperties } from '$lib/api/properties';
	import type { Reading, UpdateReadingRequest } from '$lib/types/reading.types';
	import type { MeterGroup } from '$lib/types/meter-group.types';
	import type { Property } from '$lib/types/property.types';
	import type { PaginatedResult } from '$lib/types/api.types';
	import { formatDate, formatLongDate, formatReading, getReadingUnit } from '$lib/utils/format';
	import { toDate } from '$lib/utils/timestamp';
	import { uploadToStorage } from '$lib/utils/firebase-storage';
	import { compressImage } from '$lib/utils/image-compression';
	import { getPhotoSettings } from '$lib/api/photo-settings';
	import {
		trueReading,
		resolveCurrentVersion,
		getVersionsSource,
		getCumulativeOffset
	} from '$lib/utils/true-reading';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
	import EditModal from '$lib/components/shared/EditModal.svelte';
	import ActionButtons from '$lib/components/shared/ActionButtons.svelte';
	import SelectionToolbar from '$lib/components/shared/SelectionToolbar.svelte';
	import ImagePreview from '$lib/components/shared/ImagePreview.svelte';
	import PhotoDropzone from '$lib/components/shared/PhotoDropzone.svelte';
	import { createCrudStore } from '$lib/stores/crud.svelte';
	import { Archive, Plus, X } from 'lucide-svelte';

	const crud = createCrudStore<Reading>();

	interface BatchReadingRow {
		property: Property;
		meter_group_id: string;
		reading_amount: number | null;
		image_url: string | null;
		data_url: string | null;
		is_uploading: boolean;
	}

	type ManualReadingForm = {
		meter_group_id: string;
		property_id: string;
		reading_amount: number | null;
		reading_date: string;
		image_url: string;
	};

	let readings = $state<PaginatedResult<Reading>>({
		data: [],
		nextCursor: null,
		hasMore: false
	});
	let meterGroups = $state<MeterGroup[]>([]);
	let properties = $state<Property[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let selectedMeterGroup = $state('');
	let selectedProperty = $state('');
	let filterStartDate = $state('');
	let filterEndDate = $state('');
	let readingFormOpen = $state(false);
	let readingFormTab = $state<'batch' | 'manual'>('batch');
	let manualReadingLoading = $state(false);
	let manualImageUploading = $state(false);
	let manualReadingForm = $state<ManualReadingForm>({
		meter_group_id: '',
		property_id: '',
		reading_amount: null,
		reading_date: new Date().toISOString().split('T')[0],
		image_url: ''
	});

	const propertyMap = $derived.by(() => new Map(properties.map((p) => [p.id, p])));
	const meterGroupMap = $derived.by(() => new Map(meterGroups.map((g) => [g.id, g])));

	const manualReadingProperties = $derived.by(() => {
		if (!manualReadingForm.meter_group_id) return [];

		return properties.filter((property) =>
			Object.values(property.meter_groups ?? {}).some(
				(entry: any) => entry?.meter_group_id === manualReadingForm.meter_group_id
			)
		);
	});

	// Batch reading form
	let batchDate = $state(new Date().toISOString().split('T')[0]);
	let batchRows = $state<BatchReadingRow[]>([]);
	let batchLoading = $state(false);

	// "Month day, Year" preview of the batch date, parsed as a local date to avoid
	// the UTC-midnight/local-timezone off-by-one shift new Date(batchDate) would cause.
	const batchDateDisplay = $derived.by(() => {
		if (!batchDate) return '';
		const [y, m, d] = batchDate.split('-').map(Number);
		return formatLongDate(new Date(y, m - 1, d));
	});

	// Image preview
	let previewImageUrl = $state<string | null>(null);

	let isUpdating = $state(false);

	// Defaults to false (don't persist photos to Storage) until loaded — matches the
	// backend default so there's no window where an unloaded setting reads as "save".
	let savePhotos = $state(false);

	onMount(async () => {
		await loadData();
		try {
			const settings = await getPhotoSettings();
			savePhotos = settings.savePhotos;
		} catch {
			// Keep the safe default (don't persist) if the setting fails to load.
		}
	});

	async function applyFilters() {
		isLoading = true;
		error = '';
		try {
			const readingsResult = await getReadings({
				meterGroupId: selectedMeterGroup || undefined,
				propertyId: selectedProperty || undefined,
				startDate: filterStartDate || undefined,
				endDate: filterEndDate || undefined,
				limit: 100
			});
			readings = readingsResult;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load readings';
		} finally {
			isLoading = false;
		}
	}

	let isLoadingMore = $state(false);

	async function loadMoreReadings() {
		if (!readings.hasMore || !readings.nextCursor || isLoadingMore) return;
		isLoadingMore = true;
		try {
			const next = await getReadings({
				meterGroupId: selectedMeterGroup || undefined,
				propertyId: selectedProperty || undefined,
				startDate: filterStartDate || undefined,
				endDate: filterEndDate || undefined,
				limit: 100,
				cursor: readings.nextCursor
			});
			readings = {
				data: [...readings.data, ...next.data],
				nextCursor: next.nextCursor,
				hasMore: next.hasMore
			};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load more readings';
		} finally {
			isLoadingMore = false;
		}
	}

	async function loadData() {
		isLoading = true;
		error = '';
		try {
			const [meterGroupsResult, propertiesResult, readingsResult] = await Promise.all([
				getMeterGroups({ limit: 100 }),
				getProperties({ limit: 100 }),
				getReadings({ limit: 100 })
			]);
			meterGroups = meterGroupsResult.data;
			properties = propertiesResult.data;
			readings = readingsResult;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load readings';
		} finally {
			isLoading = false;
		}
	}

	async function handleMeterGroupChange() {
		// Load batch properties for the selected meter group
		if (selectedMeterGroup) {
			await loadBatchProperties();
		} else {
			batchRows = [];
		}
		// Apply filter to readings
		await applyFilters();
	}

	async function handleFilterChange() {
		await applyFilters();
	}

	function resetReadingForm() {
		batchRows = [];
		batchDate = new Date().toISOString().split('T')[0];
		resetManualReadingForm();
	}

	async function loadBatchProperties() {
		if (!selectedMeterGroup) {
			error = 'Please select a meter group first';
			return;
		}

		batchLoading = true;
		error = '';
		try {
			const result = await getProperties({ limit: 100, meterGroupId: selectedMeterGroup });
			const selectedMeter = meterGroups.find((m) => m.id === selectedMeterGroup);
			const utilityType = selectedMeter?.utility_type || 'electricity';

			if (result.data.length === 0) {
				error = 'No properties found for this meter group';
				batchRows = [];
			} else {
				const filteredProperties = result.data.filter((property) => {
					const meterEntry =
						utilityType === 'electricity'
							? property.meter_groups.electricity
							: property.meter_groups.water;
					const isMainMeter =
						typeof meterEntry === 'string' ? false : (meterEntry?.is_main_meter ?? false);
					return !isMainMeter;
				});

				if (filteredProperties.length === 0) {
					error = 'No submeter properties found for this meter group (all are main meters)';
					batchRows = [];
				} else {
					batchRows = filteredProperties.map((property) => ({
						property,
						meter_group_id: selectedMeterGroup,
						reading_amount: null,
						image_url: null,
						data_url: null,
						is_uploading: false
					}));
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load properties';
			batchRows = [];
		} finally {
			batchLoading = false;
		}
	}

	function resetManualReadingForm() {
		manualReadingForm = {
			meter_group_id: '',
			property_id: '',
			reading_amount: null,
			reading_date: new Date().toISOString().split('T')[0],
			image_url: ''
		};
	}

	async function shouldSeedReading(meterGroupId: string, propertyId: string): Promise<boolean> {
		const property = properties.find((p) => p.id === propertyId);
		const meterEntry: any = Object.values(property?.meter_groups ?? {}).find(
			(entry: any) => entry?.meter_group_id === meterGroupId
		);
		if (!meterEntry?.is_main_meter) return false;

		const meterGroup = meterGroups.find((g) => g.id === meterGroupId);
		const currentVersion = meterGroup?.current_version ?? 1;

		const existing = await getReadings({ meterGroupId, propertyId, limit: 100 });
		return !existing.data.some((r) => r.meter_version === currentVersion);
	}

	async function handleCreateManualReading() {
		if (
			!manualReadingForm.meter_group_id ||
			!manualReadingForm.property_id ||
			manualReadingForm.reading_amount === null
		) {
			error = 'Please complete all required fields for the manual reading';
			return;
		}

		manualReadingLoading = true;
		error = '';
		try {
			const payload = {
				meter_group_id: manualReadingForm.meter_group_id,
				property_id: manualReadingForm.property_id,
				reading_amount: manualReadingForm.reading_amount,
				reading_date: {
					_seconds: Math.floor(new Date(manualReadingForm.reading_date).getTime() / 1000),
					_nanoseconds: 0
				},
				image_url:
					savePhotos && manualReadingForm.image_url ? manualReadingForm.image_url : undefined
			} as any;

			const isSeed = await shouldSeedReading(
				manualReadingForm.meter_group_id,
				manualReadingForm.property_id
			);
			if (isSeed) {
				await createSeedReading(payload);
			} else {
				await createReading(payload);
			}

			readingFormOpen = false;
			resetManualReadingForm();
			await loadData();
			alert(
				isSeed
					? 'Seed reading created successfully — this establishes the baseline for this meter version.'
					: 'Manual reading created successfully. If this property has a previous-month reading, the billing was auto-created.'
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create manual reading';
		} finally {
			manualReadingLoading = false;
		}
	}

	async function handleBatchImageUpload(rowIndex: number, file: File | null) {
		if (!file) return;

		const row = batchRows[rowIndex];

		row.is_uploading = true;
		try {
			// Compress image to avoid "request entity too large" errors
			const compressedDataUrl = await compressImage(file, 800, 0.7);

			// Show preview and run Suggest immediately — don't wait for Storage
			row.data_url = compressedDataUrl;
			row.image_url = compressedDataUrl;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to process image';
			row.is_uploading = false;
			return;
		}
		row.is_uploading = false;

		// Auto-suggest a reading value from the photo — no separate Suggest button.
		await handleSuggestReading(rowIndex);

		// Silently upgrade to a persistent Storage URL in the background — only when the
		// user has opted in via Photo Settings. Otherwise the data URL stays in-memory
		// only, long enough to have been OCR'd above, and is never persisted.
		if (row.data_url && savePhotos) {
			uploadToStorage(file, `readings/${Date.now()}_${file.name}`)
				.then((url) => {
					row.image_url = url;
				})
				.catch(() => {
					/* keep data URL */
				});
		}
	}

	async function handleManualImageUpload(file: File | null) {
		if (!file) return;

		manualImageUploading = true;
		try {
			// Compress image to avoid "request entity too large" errors
			const compressedDataUrl = await compressImage(file, 800, 0.7);
			manualReadingForm.image_url = compressedDataUrl;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to process image';
			manualImageUploading = false;
			return;
		}
		manualImageUploading = false;

		// Auto-suggest a reading value from the photo — no separate Suggest button.
		try {
			const result = await ocrReadingImage(manualReadingForm.image_url);
			if (result.suggested_reading_amount !== null) {
				manualReadingForm.reading_amount = result.suggested_reading_amount;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to suggest reading';
		}

		// Silently upgrade to a persistent Storage URL in the background — only when the
		// user has opted in via Photo Settings.
		if (savePhotos) {
			uploadToStorage(file, `readings/${Date.now()}_${file.name}`)
				.then((url) => {
					manualReadingForm.image_url = url;
				})
				.catch(() => {
					/* keep data URL */
				});
		}
	}

	async function handleCreateBatch() {
		if (!selectedMeterGroup || !batchDate) {
			error = 'Please select a meter group and reading date';
			return;
		}

		const invalidRows = batchRows.filter(
			(r) => r.reading_amount === null || r.reading_amount === undefined
		);
		if (invalidRows.length > 0) {
			error = `Please enter reading amounts for all properties (${invalidRows.length} missing)`;
			return;
		}

		batchLoading = true;
		error = '';

		try {
			const dateObj = new Date(batchDate);
			const readingsData = batchRows.map((row) => ({
				meter_group_id: row.meter_group_id,
				property_id: row.property.id,
				reading_amount: row.reading_amount!,
				reading_date: {
					_seconds: Math.floor(dateObj.getTime() / 1000),
					_nanoseconds: 0
				},
				// Only attach the photo when the user has opted into saving it —
				// otherwise it was only ever used in-memory for the Suggest button.
				image_url: savePhotos && row.image_url ? row.image_url : undefined
			}));

			const result = await createReadingsBatch(readingsData);

			readingFormOpen = false;
			batchRows = [];
			batchDate = new Date().toISOString().split('T')[0];
			await handleMeterGroupChange();

			if (result.failed.length > 0) {
				const failedSummary = result.failed.map((f) => `Row ${f.index + 1}: ${f.error}`).join('\n');
				alert(
					`${result.created.length} of ${result.created.length + result.failed.length} readings created. ` +
						`${result.failed.length} skipped:\n${failedSummary}`
				);
			} else {
				alert(
					'Readings created successfully! If a previous-month reading exists for this meter group, billings have been auto-created for each property.'
				);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create readings';
		} finally {
			batchLoading = false;
		}
	}

	async function handleUpdate() {
		if (!crud.editingItem) return;
		isUpdating = true;
		try {
			await updateReading(crud.editingItem.id, crud.editFormData as UpdateReadingRequest);
			crud.closeEditModal();
			await handleMeterGroupChange();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update reading';
		} finally {
			isUpdating = false;
		}
	}

	const editData = $derived(
		crud.editFormData as unknown as { reading_amount: number; reading_date: string }
	);

	function canBatchSubmit(): boolean {
		return (
			selectedMeterGroup.length > 0 &&
			batchDate.length > 0 &&
			batchRows.length > 0 &&
			batchRows.every((r) => r.reading_amount !== null && r.reading_amount !== undefined)
		);
	}

	async function handleSuggestReading(rowIndex: number) {
		const row = batchRows[rowIndex];
		if (!row.image_url) {
			error = 'Please upload an image first';
			return;
		}

		try {
			const result = await ocrReadingImage(row.image_url);
			if (result.suggested_reading_amount !== null) {
				row.reading_amount = result.suggested_reading_amount;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to suggest reading';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Meter Readings</h1>
			<p class="mt-1 text-gray-600">{readings.data.length} readings</p>
		</div>
		<div class="flex gap-3">
			<a
				href={resolve('/readings/archive')}
				class="rounded p-2 text-gray-700 hover:bg-gray-100"
				title="View archive"
				aria-label="View readings archive"
			>
				<Archive size={20} />
			</a>
			<button
				onclick={() => (readingFormOpen = !readingFormOpen)}
				disabled={batchLoading}
				class="rounded p-2 text-white disabled:opacity-50"
				style="background-color: var(--color-accent)"
				title={readingFormOpen ? 'Cancel' : 'Create new reading'}
				aria-label={readingFormOpen ? 'Cancel new reading' : 'Create new reading'}
			>
				{#if readingFormOpen}
					<X size={20} />
				{:else}
					<Plus size={20} />
				{/if}
			</button>
		</div>
	</div>

	{#if error}
		<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
			{error}
		</div>
	{/if}

	{#if readingFormOpen}
		<div class="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="font-semibold">Add Reading</h2>

			<!-- Tabs -->
			<div class="flex border-b border-gray-200">
				<button
					onclick={() => {
						readingFormTab = 'batch';
						resetReadingForm();
					}}
					class="border-b-2 px-4 py-2 text-sm font-medium"
					class:border-blue-500={readingFormTab === 'batch'}
					class:border-transparent={readingFormTab !== 'batch'}
					class:text-blue-600={readingFormTab === 'batch'}
					class:text-gray-600={readingFormTab !== 'batch'}
				>
					Batch / OCR
				</button>
				<button
					onclick={() => {
						readingFormTab = 'manual';
						resetReadingForm();
					}}
					class="border-b-2 px-4 py-2 text-sm font-medium"
					class:border-blue-500={readingFormTab === 'manual'}
					class:border-transparent={readingFormTab !== 'manual'}
					class:text-blue-600={readingFormTab === 'manual'}
					class:text-gray-600={readingFormTab !== 'manual'}
				>
					Manual
				</button>
			</div>

			{#if readingFormTab === 'batch'}
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="batch-meter-group" class="block text-sm font-medium text-gray-700"
							>Meter Group *</label
						>
						<select
							id="batch-meter-group"
							bind:value={selectedMeterGroup}
							onchange={loadBatchProperties}
							disabled={batchLoading}
							class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
						>
							<option value="">Select meter option</option>
							{#each meterGroups as group (group.id)}
								<option value={group.id}>
									{group.meter_name} ({group.utility_type})
								</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="batch-date" class="block text-sm font-medium text-gray-700"
							>Reading Date (Shared) *</label
						>
						<input
							id="batch-date"
							type="date"
							bind:value={batchDate}
							disabled={batchLoading}
							class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
						/>
						{#if batchDateDisplay}
							<p class="mt-1 text-xs text-gray-500">{batchDateDisplay}</p>
						{/if}
					</div>
				</div>

				{#if batchRows.length === 0 && selectedMeterGroup}
					<div class="rounded-lg border border-gray-200 p-6">
						<EmptyState title="No properties" message="No properties found for this meter group" />
					</div>
				{:else if batchRows.length > 0}
					<div class="overflow-x-auto rounded-lg border border-gray-200">
						<table class="w-full text-sm">
							<thead class="border-b border-gray-200 bg-gray-50">
								<tr>
									<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
										>Property</th
									>
									<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
										>Reading Amount</th
									>
									<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
										>Photo (auto-suggests)</th
									>
								</tr>
							</thead>
							<tbody>
								{#each batchRows as row, i (row.property.id)}
									<tr class="border-b border-gray-200 hover:bg-gray-50">
										<td class="px-6 py-4 font-medium text-gray-900">{row.property.room_name}</td>
										<td class="px-6 py-4">
											<input
												type="number"
												bind:value={row.reading_amount}
												placeholder="0"
												step="0.01"
												min="0"
												class="w-32 rounded border border-gray-300 px-3 py-2"
											/>
											{#if row.reading_amount !== null}
												{@const selectedMg = meterGroups.find((g) => g.id === selectedMeterGroup)}
												{@const version = resolveCurrentVersion(
													selectedMg,
													row.property,
													selectedMeterGroup
												)}
												{@const versionsSource = getVersionsSource(
													selectedMg,
													row.property,
													selectedMeterGroup
												)}
												{@const offset = getCumulativeOffset(versionsSource, version)}
												{@const unit = getReadingUnit(selectedMg?.utility_type || 'electricity')}
												<p class="mt-1 text-xs text-gray-400">
													True total: {(offset + row.reading_amount).toLocaleString()}
													{unit}
												</p>
											{/if}
										</td>
										<td class="px-6 py-4">
											<div class="w-48">
												<PhotoDropzone
													imageUrl={row.image_url}
													isBusy={row.is_uploading}
													onFile={(file) => handleBatchImageUpload(i, file)}
													onPreview={(url) => (previewImageUrl = url)}
												/>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="flex gap-2">
						<button
							onclick={handleCreateBatch}
							disabled={!canBatchSubmit() || batchLoading}
							class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
							style="background-color: var(--color-accent)"
						>
							{batchLoading ? 'Creating...' : 'Create All Readings'}
						</button>
						<button
							onclick={() => (readingFormOpen = false)}
							disabled={batchLoading}
							class="rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
						>
							Cancel
						</button>
					</div>
				{/if}
			{:else if readingFormTab === 'manual'}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label class="block text-sm font-medium text-gray-700">
							<span>Meter Group *</span>
							<select
								bind:value={manualReadingForm.meter_group_id}
								class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
							>
								<option value="">Select meter group</option>
								{#each meterGroups as group (group.id)}
									<option value={group.id}>{group.meter_name} ({group.utility_type})</option>
								{/each}
							</select>
						</label>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">
							<span>Property *</span>
							<select
								bind:value={manualReadingForm.property_id}
								disabled={!manualReadingForm.meter_group_id}
								class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
							>
								<option value="">Select property</option>
								{#each manualReadingProperties as prop (prop.id)}
									<option value={prop.id}>{prop.room_name}</option>
								{/each}
							</select>
						</label>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">
							<span>Reading Amount *</span>
							<input
								bind:value={manualReadingForm.reading_amount}
								type="number"
								step="0.01"
								min="0"
								class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
							/>
						</label>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">
							<span>Reading Date *</span>
							<input
								bind:value={manualReadingForm.reading_date}
								type="date"
								class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
							/>
						</label>
					</div>
					<div class="md:col-span-2">
						<span class="block text-sm font-medium text-gray-700">Photo (optional)</span>
						<div class="mt-1 w-48">
							<PhotoDropzone
								imageUrl={manualReadingForm.image_url || null}
								isBusy={manualImageUploading}
								onFile={handleManualImageUpload}
								onPreview={(url) => (previewImageUrl = url)}
							/>
						</div>
					</div>
				</div>
				<div class="flex gap-2">
					<button
						onclick={handleCreateManualReading}
						disabled={manualReadingLoading}
						class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
						style="background-color: var(--color-accent)"
					>
						{manualReadingLoading ? 'Creating...' : 'Create Reading'}
					</button>
					<button
						onclick={() => {
							readingFormOpen = false;
							resetManualReadingForm();
						}}
						disabled={manualReadingLoading}
						class="rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
		<h2 class="font-semibold text-gray-900">Filters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div>
				<label for="meter-filter" class="block text-sm font-medium text-gray-700">Meter Group</label
				>
				<select
					id="meter-filter"
					bind:value={selectedMeterGroup}
					onchange={handleMeterGroupChange}
					class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					disabled={isLoading}
				>
					<option value="">All meters</option>
					{#each meterGroups as group (group.id)}
						<option value={group.id}>
							{group.meter_name} ({group.utility_type})
						</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="property-filter" class="block text-sm font-medium text-gray-700">Property</label
				>
				<select
					id="property-filter"
					bind:value={selectedProperty}
					onchange={handleFilterChange}
					class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					disabled={isLoading}
				>
					<option value="">All properties</option>
					{#each properties as prop (prop.id)}
						<option value={prop.id}>{prop.room_name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="start-date-filter" class="block text-sm font-medium text-gray-700"
					>Start Date</label
				>
				<input
					id="start-date-filter"
					type="date"
					bind:value={filterStartDate}
					onchange={handleFilterChange}
					class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					disabled={isLoading}
				/>
			</div>

			<div>
				<label for="end-date-filter" class="block text-sm font-medium text-gray-700">End Date</label
				>
				<input
					id="end-date-filter"
					type="date"
					bind:value={filterEndDate}
					onchange={handleFilterChange}
					class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					disabled={isLoading}
				/>
			</div>

			<div class="flex items-end">
				<button
					onclick={async () => {
						selectedMeterGroup = '';
						selectedProperty = '';
						filterStartDate = '';
						filterEndDate = '';
						await applyFilters();
					}}
					class="w-full rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
					disabled={isLoading}
				>
					Clear Filters
				</button>
			</div>
		</div>
	</div>

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		{#if isLoading}
			<TableSkeleton rows={6} cols={8} />
		{:else if readings.data.length === 0}
			<div class="p-6">
				<EmptyState title="No readings" message="Create readings to track meter consumption" />
			</div>
		{:else}
			<div class="mb-4 space-y-3">
				<SelectionToolbar
					selectedCount={crud.selectedIds.size}
					isBatchDeleting={crud.isBatchDeleting}
					onBatchDelete={() => crud.handleBatchDelete(softDeleteReading, handleMeterGroupChange)}
					entityLabel="reading"
				/>
			</div>
			<table class="w-full text-sm">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th scope="col" class="w-8 px-4 py-3">
							<input
								type="checkbox"
								checked={crud.selectedIds.size === readings.data.length && readings.data.length > 0}
								onchange={() =>
									crud.toggleSelectAll(
										readings.data.map((i) => i.id),
										readings.data.map((i) => i.id)
									)}
								class="rounded"
							/>
						</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Meter Group</th>
						<th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">Reading</th>
						<th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">True Total</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Photo</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each readings.data as item (item.id)}
						{@const itemProperty = propertyMap.get(item.property_id)}
						{@const itemMeterGroup = meterGroupMap.get(item.meter_group_id)}
						<tr class="border-b border-gray-200 hover:bg-gray-50">
							<td class="w-8 px-4 py-4">
								<input
									type="checkbox"
									checked={crud.selectedIds.has(item.id)}
									onchange={() => crud.toggleSelection(item.id)}
									class="rounded"
								/>
							</td>
							<td class="px-6 py-4 font-medium text-gray-900">
								{itemProperty?.room_name || 'Unknown'}
							</td>
							<td class="px-6 py-4">
								{itemMeterGroup?.meter_name || 'Unknown'}
							</td>
							<td class="px-6 py-4 text-right font-mono text-gray-700">
								{formatReading(item.reading_amount, itemMeterGroup?.utility_type || 'electricity')}
							</td>
							<td class="px-6 py-4 text-right font-mono text-xs text-gray-400">
								{trueReading(item, itemMeterGroup, itemProperty).toLocaleString()}
								{getReadingUnit(itemMeterGroup?.utility_type || 'electricity')}
							</td>
							<td class="px-6 py-4">
								{#if item.image_url}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external/data-URL image, not an app route -->
									<a href={item.image_url} target="_blank" rel="noreferrer">
										<img
											src={item.image_url}
											alt="Meter reading"
											class="h-12 w-12 rounded object-cover hover:opacity-75"
										/>
									</a>
								{:else}
									<span class="text-gray-400">No image</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.reading_date))}</td>
							<td class="px-6 py-4 text-gray-600">{formatDate(toDate(item.created_at))}</td>
							<td class="px-6 py-4">
								<ActionButtons
									onEdit={() => {
										const readingDate = toDate(item.reading_date as any)
											.toISOString()
											.split('T')[0];
										crud.openEditModal(item, {
											reading_amount: item.reading_amount,
											reading_date: readingDate
										} as any);
									}}
									onSoftDelete={() =>
										crud.handleSoftDelete(item.id, softDeleteReading, handleMeterGroupChange, () =>
											confirm('Archive this reading? It can be restored from the archive.')
										)}
									isLoading={crud.deletingId === item.id}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if readings.hasMore}
				<div class="flex justify-center py-4">
					<button
						type="button"
						onclick={loadMoreReadings}
						disabled={isLoadingMore}
						class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
					>
						{isLoadingMore ? 'Loading…' : 'Load more readings'}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Edit Modal -->
<EditModal
	bind:isOpen={crud.editModalOpen}
	title="Edit Reading"
	isLoading={isUpdating}
	onClose={crud.closeEditModal}
	onSubmit={handleUpdate}
>
	<div class="space-y-4">
		<div>
			<label for="edit-reading-amount" class="block text-sm font-medium text-gray-700"
				>Reading Amount</label
			>
			<input
				id="edit-reading-amount"
				type="number"
				bind:value={editData.reading_amount}
				step="0.01"
				min="0"
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>
		<div>
			<label for="edit-reading-date" class="block text-sm font-medium text-gray-700"
				>Reading Date</label
			>
			<input
				id="edit-reading-date"
				type="date"
				bind:value={editData.reading_date}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>
	</div>
</EditModal>

{#if previewImageUrl}
	<ImagePreview
		imageUrl={previewImageUrl}
		onClose={() => {
			previewImageUrl = null;
		}}
	/>
{/if}
