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
	import { formatFirestoreDate, formatLongDate, formatReading } from '$lib/utils/format';
	import { toDate, toTimestamp } from '$lib/utils/timestamp';
	import { compressImage } from '$lib/utils/image-compression';
	import { resolveCurrentVersion, getVersionsSource } from '$lib/utils/true-reading';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
	import EditModal from '$lib/components/shared/EditModal.svelte';
	import ActionButtons from '$lib/components/shared/ActionButtons.svelte';
	import SelectionToolbar from '$lib/components/shared/SelectionToolbar.svelte';
	import ImagePreview from '$lib/components/shared/ImagePreview.svelte';
	import PhotoDropzone from '$lib/components/shared/PhotoDropzone.svelte';
	import { createCrudStore } from '$lib/stores/crud.svelte';
	import { confirmAsync } from '$lib/stores/confirm.svelte';
	import { pushToast } from '$lib/stores/toast.svelte';
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
	// Scoped per operation instead of one shared string — a background batch/manual-form
	// failure can no longer overwrite/mask an unrelated table-filter error (finding #26).
	let error = $state('');
	let batchFormError = $state('');
	let manualFormError = $state('');
	// Filter-only — the batch form's meter group select uses its own batchMeterGroup state
	// below so picking one no longer silently desyncs the other (finding #19).
	let selectedMeterGroup = $state('');
	let selectedProperty = $state('');
	let filterStartDate = $state('');
	let filterEndDate = $state('');
	let readingFormOpen = $state(false);
	let readingFormTab = $state<'batch' | 'manual'>('batch');
	let manualReadingLoading = $state(false);
	let manualImageUploading = $state(false);
	// Bumped on every manual-form reset so an in-flight OCR suggest from a discarded form
	// can't land on the next form instance (finding #7).
	let manualFormGeneration = $state(0);
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
	let batchMeterGroup = $state('');
	let batchDate = $state(new Date().toISOString().split('T')[0]);
	let batchRows = $state<BatchReadingRow[]>([]);
	let batchLoading = $state(false);
	let batchEmptyReason = $state('No properties found for this meter group');

	// Parses a `YYYY-MM-DD` <input type="date"> value as a local-midnight Date, avoiding the
	// UTC-parse/local-display off-by-one `new Date(dateString)` causes.
	function parseLocalDateInput(dateString: string): Date {
		const [y, m, d] = dateString.split('-').map(Number);
		return new Date(y, m - 1, d);
	}

	// "Month day, Year" preview of the batch date, parsed as a local date to avoid
	// the UTC-midnight/local-timezone off-by-one shift new Date(batchDate) would cause.
	const batchDateDisplay = $derived.by(() => {
		if (!batchDate) return '';
		return formatLongDate(parseLocalDateInput(batchDate));
	});

	// Image preview
	let previewImageUrl = $state<string | null>(null);

	let isUpdating = $state(false);

	onMount(async () => {
		await loadData();
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

	async function handleFilterChange() {
		await applyFilters();
	}

	// Separate from the table filter's meter group select (finding #19) — changing this one
	// only loads the batch form's property rows, it never touches the filtered table.
	async function handleBatchMeterGroupChange() {
		if (batchMeterGroup) {
			await loadBatchProperties();
		} else {
			batchRows = [];
		}
	}

	function resetReadingForm() {
		batchMeterGroup = '';
		batchRows = [];
		batchDate = new Date().toISOString().split('T')[0];
		batchFormError = '';
		resetManualReadingForm();
	}

	function hasUnsavedBatchData() {
		return batchRows.some((row) => row.reading_amount !== null || row.image_url);
	}

	function hasUnsavedManualData() {
		return manualReadingForm.reading_amount !== null || manualReadingForm.image_url !== '';
	}

	async function switchReadingFormTab(tab: 'batch' | 'manual') {
		if (tab === readingFormTab) return;
		const hasUnsaved = readingFormTab === 'batch' ? hasUnsavedBatchData() : hasUnsavedManualData();
		if (hasUnsaved) {
			const confirmed = await confirmAsync(
				'Discard entered readings?',
				'Switching tabs will discard the readings entered here — continue?',
				{ danger: true, confirmLabel: 'Discard' }
			);
			if (!confirmed) return;
		}
		readingFormTab = tab;
		resetReadingForm();
	}

	async function loadBatchProperties() {
		if (!batchMeterGroup) {
			batchFormError = 'Please select a meter group first';
			return;
		}

		batchLoading = true;
		batchFormError = '';
		try {
			const result = await getProperties({ limit: 100, meterGroupId: batchMeterGroup });
			const selectedMeter = meterGroups.find((m) => m.id === batchMeterGroup);
			const utilityType = selectedMeter?.utility_type || 'electricity';

			if (result.data.length === 0) {
				// No error banner here — the "No properties" EmptyState below already
				// communicates this; a red banner on top of it would be redundant and
				// wrongly implies a failure rather than an empty selection.
				batchEmptyReason = 'No properties found for this meter group';
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
					batchEmptyReason =
						'No submeter properties found for this meter group (all are main meters)';
					batchRows = [];
				} else {
					batchRows = filteredProperties.map((property) => ({
						property,
						meter_group_id: batchMeterGroup,
						reading_amount: null,
						image_url: null,
						data_url: null,
						is_uploading: false
					}));
				}
			}
		} catch (err) {
			batchFormError = err instanceof Error ? err.message : 'Failed to load properties';
			batchRows = [];
		} finally {
			batchLoading = false;
		}
	}

	function resetManualReadingForm() {
		manualFormGeneration++;
		manualFormError = '';
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

		// Paginate through every historical reading for this property/meter-group pair — a
		// single capped page could silently miss the current-version reading once history
		// exceeds 100 rows, mis-categorizing a create as a seed (finding #25).
		let cursor: string | undefined;
		do {
			const page = await getReadings({ meterGroupId, propertyId, limit: 100, cursor });
			if (page.data.some((r) => r.meter_version === currentVersion)) return false;
			cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
		} while (cursor);
		return true;
	}

	async function handleCreateManualReading() {
		if (
			!manualReadingForm.meter_group_id ||
			!manualReadingForm.property_id ||
			manualReadingForm.reading_amount === null
		) {
			manualFormError = 'Please complete all required fields for the manual reading';
			return;
		}
		// A still-resolving OCR suggest could otherwise write into a freshly-reset form after
		// this submit completes (finding #7) — block submit until it settles.
		if (manualImageUploading) {
			manualFormError = 'Please wait for the photo suggestion to finish';
			return;
		}

		manualReadingLoading = true;
		manualFormError = '';
		try {
			const payload = {
				meter_group_id: manualReadingForm.meter_group_id,
				property_id: manualReadingForm.property_id,
				reading_amount: manualReadingForm.reading_amount,
				reading_date: toTimestamp(parseLocalDateInput(manualReadingForm.reading_date))
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
			pushToast(
				isSeed
					? 'Seed reading created successfully — this establishes the baseline for this meter version.'
					: 'Manual reading created successfully. If this property has a previous-month reading, the billing was auto-created.',
				'success'
			);
		} catch (err) {
			manualFormError = err instanceof Error ? err.message : 'Failed to create manual reading';
		} finally {
			manualReadingLoading = false;
		}
	}

	type CompressAndSuggestResult =
		{ ok: true; imageUrl: string; amount: number | null } | { ok: false; message: string };

	// Shared by the batch and manual tabs: compress → auto-suggest via OCR — no separate
	// Suggest button on either. `onCompressed` fires as soon as the compressed image is ready
	// (before the OCR await) so a busy indicator can clear at the same point it always did.
	// Extracting this one helper closes the race in finding #8 (only the batch copy guarded
	// against a stale row) and, combined with the caller-side generation/identity checks
	// below, finding #7.
	async function compressAndSuggest(
		file: File,
		onCompressed?: (imageUrl: string) => void
	): Promise<CompressAndSuggestResult> {
		let imageUrl: string;
		try {
			// Compress image to avoid "request entity too large" errors. Photo is only ever
			// used transiently for OCR suggest — never persisted.
			imageUrl = await compressImage(file, 800, 0.7);
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : 'Failed to process image' };
		}
		onCompressed?.(imageUrl);
		try {
			const result = await ocrReadingImage(imageUrl);
			return { ok: true, imageUrl, amount: result.suggested_reading_amount };
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : 'Failed to suggest reading'
			};
		}
	}

	async function handleBatchImageUpload(rowIndex: number, file: File | null) {
		if (!file) return;
		// Stable identity across the async gap, not the array index — batchRows can be
		// reassigned (meter group change) while this is in flight (finding #8).
		const propertyId = batchRows[rowIndex].property.id;
		batchRows[rowIndex].is_uploading = true;

		const result = await compressAndSuggest(file, (imageUrl) => {
			const current = batchRows[rowIndex];
			if (current && current.property.id === propertyId) {
				current.data_url = imageUrl;
				current.image_url = imageUrl;
				current.is_uploading = false;
			}
		});

		const row = batchRows[rowIndex];
		if (!row || row.property.id !== propertyId) return; // stale — row moved on, discard
		row.is_uploading = false;
		if (!result.ok) {
			batchFormError = result.message;
			return;
		}
		if (result.amount !== null) row.reading_amount = result.amount;
	}

	async function handleManualImageUpload(file: File | null) {
		if (!file) return;
		// Captured before the async gap — a reset (tab switch, successful submit) bumps this,
		// so a stale suggestion can no longer write into the next form instance (finding #7).
		const generation = manualFormGeneration;
		manualImageUploading = true;

		const result = await compressAndSuggest(file, (imageUrl) => {
			if (generation === manualFormGeneration) {
				manualReadingForm.image_url = imageUrl;
				manualImageUploading = false;
			}
		});

		if (generation !== manualFormGeneration) return; // stale — form was reset, discard
		manualImageUploading = false;
		if (!result.ok) {
			manualFormError = result.message;
			return;
		}
		if (result.amount !== null) manualReadingForm.reading_amount = result.amount;
	}

	async function handleCreateBatch() {
		if (!batchMeterGroup || !batchDate) {
			batchFormError = 'Please select a meter group and reading date';
			return;
		}

		const invalidRows = batchRows.filter(
			(r) => r.reading_amount === null || r.reading_amount === undefined
		);
		if (invalidRows.length > 0) {
			batchFormError = `Please enter reading amounts for all properties (${invalidRows.length} missing)`;
			return;
		}

		batchLoading = true;
		batchFormError = '';

		try {
			const readingDate = toTimestamp(parseLocalDateInput(batchDate));
			const readingsData = batchRows.map((row) => ({
				meter_group_id: row.meter_group_id,
				property_id: row.property.id,
				reading_amount: row.reading_amount!,
				reading_date: readingDate
			}));

			const result = await createReadingsBatch(readingsData);

			readingFormOpen = false;
			batchRows = [];
			batchMeterGroup = '';
			batchDate = new Date().toISOString().split('T')[0];
			await applyFilters();

			if (result.failed.length > 0) {
				const failedSummary = result.failed.map((f) => `Row ${f.index + 1}: ${f.error}`).join('; ');
				pushToast(
					`${result.created.length} of ${result.created.length + result.failed.length} readings created. ` +
						`${result.failed.length} skipped — ${failedSummary}`,
					'warning'
				);
			} else {
				pushToast(
					'Readings created successfully! If a previous-month reading exists for this meter group, billings have been auto-created for each property.',
					'success'
				);
			}
		} catch (err) {
			batchFormError = err instanceof Error ? err.message : 'Failed to create readings';
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
			await applyFilters();
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
			batchMeterGroup.length > 0 &&
			batchDate.length > 0 &&
			batchRows.length > 0 &&
			batchRows.every((r) => r.reading_amount !== null && r.reading_amount !== undefined)
		);
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
					onclick={() => switchReadingFormTab('batch')}
					class="border-b-2 px-4 py-2 text-sm font-medium"
					class:border-blue-500={readingFormTab === 'batch'}
					class:border-transparent={readingFormTab !== 'batch'}
					class:text-blue-600={readingFormTab === 'batch'}
					class:text-gray-600={readingFormTab !== 'batch'}
				>
					Batch / OCR
				</button>
				<button
					onclick={() => switchReadingFormTab('manual')}
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
				{#if batchFormError}
					<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
						{batchFormError}
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="batch-meter-group" class="block text-sm font-medium text-gray-700"
							>Meter Group *</label
						>
						<select
							id="batch-meter-group"
							bind:value={batchMeterGroup}
							onchange={handleBatchMeterGroupChange}
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

				{#if batchRows.length === 0 && batchMeterGroup}
					<div class="rounded-lg border border-gray-200 p-6">
						<EmptyState title="No properties" message={batchEmptyReason} />
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
												{@const selectedMg = meterGroups.find((g) => g.id === batchMeterGroup)}
												{@const version = resolveCurrentVersion(
													selectedMg,
													row.property,
													batchMeterGroup
												)}
												{@const versionsSource = getVersionsSource(
													selectedMg,
													row.property,
													batchMeterGroup
												)}
												{@const resetInfo =
													version > 1 ? versionsSource?.[String(version - 1)] : undefined}
												<p class="mt-1 text-xs text-gray-400">
													Meter v{version}
													{#if resetInfo}
														(reset {formatFirestoreDate(resetInfo.reset_at)} from {resetInfo.last_reading.toLocaleString()})
													{/if}
												</p>
											{/if}
										</td>
										<td class="px-6 py-4">
											<div class="w-48">
												<PhotoDropzone
													imageUrl={row.image_url}
													alt={`Meter reading for ${row.property.room_name}`}
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
				{#if manualFormError}
					<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
						{manualFormError}
					</div>
				{/if}
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
								alt={`Meter reading for ${properties.find((p) => p.id === manualReadingForm.property_id)?.room_name ?? 'property'}`}
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
						disabled={manualReadingLoading || manualImageUploading}
						class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
						style="background-color: var(--color-accent)"
					>
						{manualReadingLoading
							? 'Creating...'
							: manualImageUploading
								? 'Waiting for photo suggestion...'
								: 'Create Reading'}
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
					onchange={handleFilterChange}
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
			<TableSkeleton rows={6} cols={7} />
		{:else if readings.data.length === 0}
			<div class="p-6">
				<EmptyState title="No readings" message="Create readings to track meter consumption" />
			</div>
		{:else}
			<div class="mb-4 space-y-3">
				<SelectionToolbar
					selectedCount={crud.selectedIds.size}
					isBatchDeleting={crud.isBatchDeleting}
					onBatchDelete={() => crud.handleBatchDelete(softDeleteReading, applyFilters)}
					entityLabel="reading"
				/>
			</div>
			<table class="w-full text-sm">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th scope="col" class="w-8 px-4 py-3">
							<input
								type="checkbox"
								aria-label="Select all readings"
								checked={crud.selectedIds.size === readings.data.length && readings.data.length > 0}
								onchange={() =>
									crud.toggleSelectAll(
										readings.data.map((i) => i.id),
										readings.data.map((i) => i.id)
									)}
								class="rounded"
							/>
						</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Meter Group</th>
						<th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">Reading</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Meter Cycle</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Created</th>
						<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each readings.data as item (item.id)}
						{@const itemProperty = propertyMap.get(item.property_id)}
						{@const itemMeterGroup = meterGroupMap.get(item.meter_group_id)}
						{@const itemMeterVersion = item.meter_version ?? 1}
						{@const itemVersionsSource = getVersionsSource(
							itemMeterGroup,
							itemProperty,
							item.meter_group_id
						)}
						{@const itemResetInfo =
							itemMeterVersion > 1 ? itemVersionsSource?.[String(itemMeterVersion - 1)] : undefined}
						<tr class="border-b border-gray-200 hover:bg-gray-50">
							<td class="w-8 px-4 py-4">
								<input
									type="checkbox"
									aria-label={`Select reading for ${itemProperty?.room_name ?? 'property'}`}
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
							<td class="px-6 py-4 text-xs text-gray-500">
								<span class="font-medium text-gray-700">v{itemMeterVersion}</span>
								{#if itemResetInfo}
									<span class="block text-gray-400"
										>reset {formatFirestoreDate(itemResetInfo.reset_at)}, prior meter ended at {itemResetInfo.last_reading.toLocaleString()}</span
									>
								{/if}
							</td>
							<td class="px-6 py-4 text-gray-600">{formatFirestoreDate(item.reading_date)}</td>
							<td class="px-6 py-4 text-gray-600">{formatFirestoreDate(item.created_at)}</td>
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
										crud.handleSoftDelete(item.id, softDeleteReading, applyFilters, () =>
											confirmAsync(
												'Archive reading',
												'Archive this reading? It can be restored from the archive.',
												{ danger: true }
											)
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
