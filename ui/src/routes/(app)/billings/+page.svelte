<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SvelteMap, SvelteSet, SvelteDate } from 'svelte/reactivity';
	import {
		getBillingCycles,
		createBillingCycle,
		updateBillingCycle,
		ocrBillingCycle,
		softDeleteBillingCycle
	} from '$lib/api/billing-cycles';
	import { getBillings, createBilling, updateBilling, softDeleteBilling } from '$lib/api/billings';
	import { getReadings } from '$lib/api/readings';
	import { getReadingsByIds, invalidateEntityLookupCache } from '$lib/stores/entity-lookup-cache';
	import { getProperties } from '$lib/api/properties';
	import { getMeterGroups } from '$lib/api/meter-groups';
	import type { BillingCycle, UpdateBillingCycleRequest } from '$lib/types/billing-cycle.types';
	import type { Billing, UpdateBillingRequest } from '$lib/types/billing.types';
	import type { Reading } from '$lib/types/reading.types';
	import type { Property, MeterGroupEntry } from '$lib/types/property.types';
	import type { MeterGroup } from '$lib/types/meter-group.types';
	import type { PaginatedResult } from '$lib/types/api.types';
	import { formatDate, formatCurrency, formatReading, getReadingUnit } from '$lib/utils/format';
	import { billAmount, sumMoney } from '$lib/utils/money';
	import { toDate } from '$lib/utils/timestamp';
	import { trueReading } from '$lib/utils/true-reading';
	import { getUtilityTypeBadgeClasses } from '$lib/utils/utility-colors';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
	import EditModal from '$lib/components/shared/EditModal.svelte';
	import StatusPill from '$lib/components/shared/StatusPill.svelte';
	import { createCrudStore } from '$lib/stores/crud.svelte';
	import { CheckCircle2, Pencil, Archive, Printer, Plus, ChevronRight } from 'lucide-svelte';

	const crud = createCrudStore<Billing>();

	let cycles = $state<BillingCycle[]>([]);
	let billings: SvelteMap<string, Billing[]> = new SvelteMap();
	// allBillings stays a full load: the payment-status filter (getCyclePaymentStatus) filters
	// ALL cycles by whether every billing under them is paid, which needs every billing's status
	// — there's no scoped server query for that. Readings, by contrast, are fetched scoped below.
	let allBillings = $state<Billing[]>([]);
	// Readings are no longer bulk-loaded. Scoped, purpose-specific reading sets replace the old
	// full `readings` array:
	//  - cycleFormReadings: the selected meter group's readings (discovery / gap-fill / overrides)
	//  - editReadings:      the edited billing's property's readings (edit modal selects)
	//  - stragglerReadings: the straggler property's readings on the cycle's meter group
	//  - readingMap:        prev/current readings for the billings of expanded / printed cycles
	let cycleFormReadings = $state<Reading[]>([]);
	let editReadings = $state<Reading[]>([]);
	let stragglerReadings = $state<Reading[]>([]);
	let readingMap: SvelteMap<string, Reading> = new SvelteMap();
	let properties = $state<Property[]>([]);
	let meterGroups = $state<MeterGroup[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let expandedCycleId = $state<string | null>(null);

	// Billing cycle form state
	let cycleFormOpen = $state(false);
	let cycleFormMeterGroup = $state('');
	let cycleFormStartDate = $state('');
	let cycleFormEndDate = $state('');
	let cycleFormDueDate = $state('');
	let cycleFormRate = $state(0);
	let cycleFormDiscoveredBillings = $state<DiscoveredBilling[]>([]);
	let cycleFormGapProperties = $state<GapProperty[]>([]);
	let cycleFormTotalConsumption = $state(0);
	let cycleFormTotalAmount = $state(0);
	let cycleFormLastChanged = $state<'consumption' | 'rate' | 'total' | null>(null);
	let cycleFormOverrideMode = $state(false);
	let cycleFormOverrideSelections = $state<
		Map<string, { prev_reading_id: string; curr_reading_id: string }>
	>(new Map());
	let isCreatingCycle = $state(false);

	// Billing cycle edit modal state — lets corrections to rate/consumption/dates be made
	// when company error or OCR misreads slip into a cycle after creation.
	let cycleEditModalOpen = $state(false);
	let editingCycle = $state<BillingCycle | null>(null);
	let cycleEditConsumption = $state(0);
	let cycleEditRate = $state(0);
	let cycleEditStartDate = $state('');
	let cycleEditEndDate = $state('');
	let cycleEditDueDate = $state('');
	let isUpdatingCycle = $state(false);

	// Straggler-fill modal state — adds one late-arriving billing to an already-created
	// cycle. PATCH /billing-cycles/:id replaces the whole billing_ids map (no deep merge),
	// so this assembles existing entries + the new one, same shape as the cycle edit modal.
	let stragglerModalOpen = $state(false);
	let stragglerCycle = $state<BillingCycle | null>(null);
	let stragglerPropertyId = $state('');
	let stragglerPrevReadingId = $state('');
	let stragglerCurrReadingId = $state('');
	let isAddingStraggler = $state(false);

	// OCR state
	let billPhotoUrl = $state<string | null>(null);
	let isBillOcrLoading = $state(false);
	let billOcrRawAmount = $state<number | null>(null);

	interface DiscoveredBilling {
		billingId: string;
		propertyId: string;
		propertyName: string;
		consumption: number;
		amount: number;
	}

	// A "gap" property has readings for the period but no billing yet — filled in inline
	// alongside discovery results instead of through a separate manual-billing form.
	interface GapProperty {
		propertyId: string;
		propertyName: string;
		availableReadings: Reading[];
		selectedPrevReadingId: string;
		selectedCurrReadingId: string;
	}

	let isUpdating = $state(false);
	let markingAsPaidId = $state<string | null>(null);
	let selectedCyclesForPrint = $state<string[]>([]);

	// Round to 2 decimal places to avoid floating-point precision errors
	const round = (value: number, decimals = 2) =>
		Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);

	// Version-aware "true reading" (imported from $lib/utils/true-reading) mirrors the
	// API's billing-cycle validator so consumption previews stay correct across meter resets.
	function readingConsumption(
		currReading: Reading,
		prevReading: Reading | undefined,
		property: Property | undefined
	): number {
		const meterGroup = meterGroups.find((g) => g.id === currReading.meter_group_id);
		const currTrue = trueReading(currReading, meterGroup, property);
		const prevTrue = prevReading ? trueReading(prevReading, meterGroup, property) : 0;
		return round(currTrue - prevTrue);
	}

	const billingCycleReadings = $derived.by(() => {
		if (!cycleFormReadings.length || !cycleFormMeterGroup || !cycleFormEndDate) return [];
		const endDate = new Date(cycleFormEndDate);
		return cycleFormReadings.filter((reading) => {
			if (reading.meter_group_id !== cycleFormMeterGroup) return false;
			const readingDate = toDate(reading.reading_date);
			return (
				readingDate.getUTCMonth() === endDate.getUTCMonth() &&
				readingDate.getUTCFullYear() === endDate.getUTCFullYear()
			);
		});
	});

	// Edit-modal reading options — fetched scoped to the edited billing's property (a property's
	// readings are all for its own meter groups, so propertyId scoping is sufficient).
	$effect(() => {
		const propertyId = editData.property_id;
		if (!propertyId) {
			editReadings = [];
			return;
		}
		let cancelled = false;
		getReadings({ propertyId, limit: 100 })
			.then((res) => {
				if (!cancelled) editReadings = res.data;
			})
			.catch(() => {
				if (!cancelled) editReadings = [];
			});
		return () => {
			cancelled = true;
		};
	});

	// Get utility type for cycle form meter group
	const cycleFormUtilityType = $derived.by(() => {
		const selectedMeterGroup = meterGroups.find((m) => m.id === cycleFormMeterGroup);
		return selectedMeterGroup?.utility_type || 'electricity';
	});

	$effect(() => {
		if (
			cycleFormLastChanged === 'consumption' ||
			cycleFormLastChanged === 'rate' ||
			cycleFormLastChanged === null
		) {
			cycleFormTotalAmount = round(cycleFormTotalConsumption * cycleFormRate);
		}
	});

	onMount(async () => {
		await loadData();
	});

	// Billings/readings/cycles can now number in the hundreds (historical backfill), well
	// past a single page — pulling only the first 100 silently dropped older cycles' data
	// from billingMap/readingMap (showed as "Unknown" meter group / "N/A" readings), and
	// filtering needs the full cycle set anyway. The list endpoints cap `limit` at 100
	// (billing.dto.ts, reading.dto.ts, billing-cycle.dto.ts), so we page through with cursors.
	async function fetchAllPages<T>(
		fetchPage: (cursor?: string) => Promise<PaginatedResult<T>>
	): Promise<T[]> {
		const all: T[] = [];
		let cursor: string | undefined;
		do {
			const page = await fetchPage(cursor);
			all.push(...page.data);
			cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
		} while (cursor);
		return all;
	}

	async function loadData() {
		isLoading = true;
		error = '';
		try {
			// Readings are no longer bulk-loaded here — resolved scoped/on-demand instead.
			// Clear the ID lookup cache so a reload after a mutation can't serve stale readings.
			invalidateEntityLookupCache();
			const [cyclesData, billingsData, propertiesResult, meterGroupsResult] = await Promise.all([
				fetchAllPages((cursor) => getBillingCycles({ limit: 100, cursor })),
				fetchAllPages((cursor) => getBillings({ limit: 100, cursor })),
				getProperties({ limit: 100 }),
				getMeterGroups({ limit: 100 })
			]);
			cycles = cyclesData;
			allBillings = billingsData;
			properties = propertiesResult.data;
			meterGroups = meterGroupsResult.data;
			billings.clear();
			readingMap.clear();
			currentPage = 1;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load data';
		} finally {
			isLoading = false;
		}
	}

	async function toggleCycleExpand(cycleId: string) {
		if (expandedCycleId === cycleId) {
			expandedCycleId = null;
			return;
		}

		expandedCycleId = cycleId;

		if (billings.has(cycleId)) {
			return;
		}

		const cycle = cycles.find((c) => c.id === cycleId);
		if (cycle) {
			const cycleBillings = allBillings.filter((b) => b.id in cycle.billing_ids);
			billings.set(cycleId, cycleBillings);
			await resolveReadingsFor(cycleBillings);
		}
	}

	// Resolve (and cache) the previous/current readings for a set of billings into readingMap,
	// so the expanded billing table and receipt printing can show reading amounts without the
	// old full readings load.
	async function resolveReadingsFor(billingList: Billing[]) {
		const ids = billingList.flatMap((b) => [b.previous_reading_id, b.current_reading_id]);
		const resolved = await getReadingsByIds(ids);
		for (const [id, reading] of resolved) {
			readingMap.set(id, reading);
		}
	}

	function openEditModal(billing: Billing) {
		crud.openEditModal(billing, {
			property_id: billing.property_id,
			previous_reading_id: billing.previous_reading_id,
			current_reading_id: billing.current_reading_id
		} as any);
	}

	async function handleUpdate() {
		if (!crud.editingItem) return;
		isUpdating = true;
		try {
			await updateBilling(crud.editingItem.id, crud.editFormData as UpdateBillingRequest);
			crud.closeEditModal();
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update billing';
		} finally {
			isUpdating = false;
		}
	}

	const editData = $derived(crud.editFormData as unknown as UpdateBillingRequest);

	async function handleMarkAsPaid(id: string) {
		markingAsPaidId = id;
		try {
			const paidAt = new Date().toISOString();
			await updateBilling(id, { payment_status: 'paid', paid_at: paidAt });

			// Update local state
			const billing = allBillings.find((b) => b.id === id);
			if (billing) {
				billing.payment_status = 'paid';
				billing.paid_at = paidAt;
				allBillings = allBillings;

				// Update cache
				for (const [, bills] of billings.entries()) {
					const idx = bills.findIndex((b) => b.id === id);
					if (idx >= 0) {
						bills[idx] = billing;
					}
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to mark as paid';
		} finally {
			markingAsPaidId = null;
		}
	}

	function discoverBillings(): DiscoveredBilling[] {
		if (!cycleFormMeterGroup || !cycleFormEndDate) return [];

		const endDate = new Date(cycleFormEndDate);
		const base = allBillings
			.filter((billing) => {
				const currReading = cycleFormReadingMap.get(billing.current_reading_id);
				if (!currReading) return false;
				if (currReading.meter_group_id !== cycleFormMeterGroup) return false;
				const readingDate = toDate(currReading.reading_date);
				return (
					readingDate.getUTCMonth() === endDate.getUTCMonth() &&
					readingDate.getUTCFullYear() === endDate.getUTCFullYear()
				);
			})
			.map((billing) => {
				const currReading = cycleFormReadingMap.get(billing.current_reading_id)!;
				const prevReading = cycleFormReadingMap.get(billing.previous_reading_id);
				const property = properties.find((p) => p.id === billing.property_id);

				// Version-aware true-reading diff — matches the API's billing-cycle validator so the
				// preview stays correct across meter resets (cumulative offset of prior versions + raw amount).
				const consumption = readingConsumption(currReading, prevReading, property);

				return {
					billingId: billing.id,
					propertyId: property?.id ?? billing.property_id,
					propertyName: property?.room_name ?? billing.property_id.slice(0, 8),
					consumption,
					amount: billAmount(consumption, cycleFormRate)
				};
			});

		if (!cycleFormOverrideMode) return base;

		return base.map((entry) => {
			const override = cycleFormOverrideSelections.get(entry.propertyId);
			if (!override) return entry;
			const prevReading = cycleFormReadingMap.get(override.prev_reading_id);
			const currReading = cycleFormReadingMap.get(override.curr_reading_id);
			if (!prevReading || !currReading) return entry;
			const property = properties.find((p) => p.id === entry.propertyId);
			const consumption = readingConsumption(currReading, prevReading, property);
			return { ...entry, consumption, amount: billAmount(consumption, cycleFormRate) };
		});
	}

	function discoverGapProperties(): GapProperty[] {
		if (!cycleFormMeterGroup || !cycleFormEndDate) return [];

		const usedReadingIds = new SvelteSet<string>();
		for (const billing of allBillings) {
			usedReadingIds.add(billing.previous_reading_id);
			usedReadingIds.add(billing.current_reading_id);
		}

		const discoveredPropertyIds = new Set(discoverBillings().map((d) => d.propertyId));

		return properties
			.filter(
				(property) =>
					!discoveredPropertyIds.has(property.id) &&
					Object.values(property.meter_groups ?? {}).some(
						(entry: any) => entry?.meter_group_id === cycleFormMeterGroup
					)
			)
			.map((property) => ({
				propertyId: property.id,
				propertyName: property.room_name,
				availableReadings: cycleFormReadings.filter(
					(r) =>
						r.meter_group_id === cycleFormMeterGroup &&
						r.property_id === property.id &&
						!usedReadingIds.has(r.id)
				),
				selectedPrevReadingId: '',
				selectedCurrReadingId: ''
			}))
			.filter((g) => g.availableReadings.length >= 2);
	}

	// Discovery needs the selected meter group's readings — fetch them scoped (one meter group,
	// small) before computing, replacing the old full readings load.
	async function runDiscovery() {
		error = '';
		if (!cycleFormMeterGroup || !cycleFormEndDate) {
			cycleFormDiscoveredBillings = [];
			cycleFormGapProperties = [];
			return;
		}
		try {
			cycleFormReadings = await fetchAllPages((cursor) =>
				getReadings({ meterGroupId: cycleFormMeterGroup, limit: 100, cursor })
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load readings for this meter group';
			cycleFormReadings = [];
			return;
		}
		cycleFormDiscoveredBillings = discoverBillings();
		cycleFormGapProperties = discoverGapProperties();
	}

	function resetCycleForm() {
		cycleFormMeterGroup = '';
		cycleFormStartDate = '';
		cycleFormEndDate = '';
		cycleFormDueDate = '';
		cycleFormRate = 0;
		cycleFormReadings = [];
		cycleFormDiscoveredBillings = [];
		cycleFormGapProperties = [];
		cycleFormTotalConsumption = 0;
		cycleFormTotalAmount = 0;
		cycleFormLastChanged = null;
		cycleFormOverrideMode = false;
		cycleFormOverrideSelections = new SvelteMap();
		billPhotoUrl = null;
		isBillOcrLoading = false;
		billOcrRawAmount = null;
	}

	async function autoCalculateCycleDates() {
		if (!cycleFormMeterGroup) return;

		// Find the last billing cycle for this meter group via a scoped query — the cycle's own
		// denormalized meter_group_id makes this a precise lookup, correct regardless of how many
		// total cycles exist (the old "scan the loaded cycles" approach silently reset dates to
		// the current month once cycle volume exceeded a page).
		let meterGroupCycles: BillingCycle[] = [];
		try {
			const res = await getBillingCycles({ meterGroupId: cycleFormMeterGroup, limit: 100 });
			meterGroupCycles = res.data
				.slice()
				.sort(
					(a, b) => toDate(b.billing_end_date).getTime() - toDate(a.billing_end_date).getTime()
				);
		} catch {
			// Leave meterGroupCycles empty → falls back to the current-month default below.
		}

		if (meterGroupCycles.length === 0) {
			// No previous cycle, use current month
			const now = new Date();
			const startDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
			const endDate = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
			const dueDate = new SvelteDate(endDate);
			dueDate.setUTCDate(dueDate.getUTCDate() + 13);

			cycleFormStartDate = startDate.toISOString().split('T')[0];
			cycleFormEndDate = endDate.toISOString().split('T')[0];
			cycleFormDueDate = dueDate.toISOString().split('T')[0];
		} else {
			// Calculate next cycle based on last cycle
			const lastCycle = meterGroupCycles[0];
			const lastEndDate = toDate(lastCycle.billing_end_date);
			const nextStartDate = new SvelteDate(lastEndDate);
			nextStartDate.setUTCDate(nextStartDate.getUTCDate() + 1);

			const nextEndDate = new SvelteDate(nextStartDate);
			nextEndDate.setUTCMonth(nextEndDate.getUTCMonth() + 1);
			nextEndDate.setUTCDate(nextStartDate.getUTCDate() - 1);

			const nextDueDate = new SvelteDate(nextEndDate);
			nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 14);

			cycleFormStartDate = nextStartDate.toISOString().split('T')[0];
			cycleFormEndDate = nextEndDate.toISOString().split('T')[0];
			cycleFormDueDate = nextDueDate.toISOString().split('T')[0];
		}
	}

	async function readFileAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target?.result as string);
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsDataURL(file);
		});
	}

	async function handleBillPhotoOcr(file: File) {
		if (file.size > 900_000) {
			error = 'Image must be smaller than 900 KB. Try a compressed or cropped photo.';
			return;
		}
		isBillOcrLoading = true;
		error = '';
		try {
			const dataUrl = await readFileAsDataUrl(file);
			// Don't set billPhotoUrl yet — only after success
			const result = await ocrBillingCycle(dataUrl);
			billPhotoUrl = dataUrl; // Set here, after success
			cycleFormStartDate = result.billing_start_date;
			cycleFormEndDate = result.billing_end_date;
			cycleFormRate = result.billing_rate;
			cycleFormTotalConsumption = result.billing_consumption;
			cycleFormTotalAmount = billAmount(result.billing_consumption, result.billing_rate);
			cycleFormLastChanged = null;
			billOcrRawAmount = result.raw_amount;
		} catch (err) {
			billPhotoUrl = null; // Clear on error
			error = err instanceof Error ? err.message : 'Failed to extract billing data from photo';
		} finally {
			isBillOcrLoading = false;
		}
	}

	async function handleCreateCycle() {
		const discovered = discoverBillings();
		const gapsToFill = cycleFormGapProperties.filter(
			(g) => g.selectedPrevReadingId && g.selectedCurrReadingId
		);
		if (discovered.length === 0 && gapsToFill.length === 0) {
			error = 'No billings found for this period';
			return;
		}
		if (!cycleFormStartDate || !cycleFormEndDate) {
			error = 'Start and end dates are required';
			return;
		}
		if (cycleFormRate <= 0) {
			error = 'Billing rate must be greater than 0';
			return;
		}

		isCreatingCycle = true;
		try {
			const billing_ids: Record<string, number> = {};
			for (const d of discovered) {
				billing_ids[d.billingId] = d.consumption;
			}

			// Gap-fill billings don't exist yet — create them first, then fold their
			// consumption into the same billing_ids map the cycle expects.
			for (const gap of gapsToFill) {
				const prevReading = cycleFormReadings.find((r) => r.id === gap.selectedPrevReadingId);
				const currReading = cycleFormReadings.find((r) => r.id === gap.selectedCurrReadingId);
				if (!prevReading || !currReading) continue;

				const newBilling = await createBilling({
					property_id: gap.propertyId,
					previous_reading_id: gap.selectedPrevReadingId,
					current_reading_id: gap.selectedCurrReadingId
				});
				const gapProperty = properties.find((p) => p.id === gap.propertyId);
				billing_ids[newBilling.id] = readingConsumption(currReading, prevReading, gapProperty);
			}

			const totalConsumption = cycleFormTotalConsumption;

			const startTs = {
				_seconds: Math.floor(new Date(cycleFormStartDate).getTime() / 1000),
				_nanoseconds: 0
			};
			const endTs = {
				_seconds: Math.floor(new Date(cycleFormEndDate).getTime() / 1000),
				_nanoseconds: 0
			};

			const createPayload: any = {
				meter_group_id: cycleFormMeterGroup,
				billing_ids,
				billing_rate: cycleFormRate,
				billing_consumption: totalConsumption,
				billing_start_date: startTs,
				billing_end_date: endTs
			};

			if (cycleFormDueDate) {
				createPayload.overdue_date = {
					_seconds: Math.floor(new Date(cycleFormDueDate).getTime() / 1000),
					_nanoseconds: 0
				};
			}

			await createBillingCycle(createPayload);

			cycleFormOpen = false;
			resetCycleForm();
			await loadData();
			alert('Billing cycle created successfully!');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create billing cycle';
		} finally {
			isCreatingCycle = false;
		}
	}

	function openCycleEditModal(cycle: BillingCycle) {
		editingCycle = cycle;
		cycleEditConsumption = cycle.billing_consumption;
		cycleEditRate = cycle.billing_rate;
		cycleEditStartDate = toDate(cycle.billing_start_date).toISOString().split('T')[0];
		cycleEditEndDate = toDate(cycle.billing_end_date).toISOString().split('T')[0];
		cycleEditDueDate = cycle.overdue_date
			? toDate(cycle.overdue_date).toISOString().split('T')[0]
			: '';
		cycleEditModalOpen = true;
	}

	function closeCycleEditModal() {
		cycleEditModalOpen = false;
		editingCycle = null;
	}

	async function handleUpdateCycle() {
		if (!editingCycle) return;
		isUpdatingCycle = true;
		try {
			const payload: UpdateBillingCycleRequest = {
				billing_consumption: cycleEditConsumption,
				billing_rate: cycleEditRate,
				billing_start_date: {
					_seconds: Math.floor(new Date(cycleEditStartDate).getTime() / 1000),
					_nanoseconds: 0
				},
				billing_end_date: {
					_seconds: Math.floor(new Date(cycleEditEndDate).getTime() / 1000),
					_nanoseconds: 0
				}
			};
			if (cycleEditDueDate) {
				payload.overdue_date = {
					_seconds: Math.floor(new Date(cycleEditDueDate).getTime() / 1000),
					_nanoseconds: 0
				};
			}

			await updateBillingCycle(editingCycle.id, payload);
			closeCycleEditModal();
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update billing cycle';
		} finally {
			isUpdatingCycle = false;
		}
	}

	function openStragglerModal(cycle: BillingCycle) {
		stragglerCycle = cycle;
		stragglerPropertyId = '';
		stragglerPrevReadingId = '';
		stragglerCurrReadingId = '';
		stragglerModalOpen = true;
	}

	function closeStragglerModal() {
		stragglerModalOpen = false;
		stragglerCycle = null;
	}

	// Properties on the cycle's meter group that don't already have a billing in this cycle.
	const stragglerCandidateProperties = $derived.by(() => {
		if (!stragglerCycle) return [];
		const meterGroupId = getCycleMeterGroupId(stragglerCycle);
		if (!meterGroupId) return [];
		const existingPropertyIds = new Set(
			Object.keys(stragglerCycle.billing_ids)
				.map((billingId) => billingMap.get(billingId)?.property_id)
				.filter((id): id is string => !!id)
		);
		return properties.filter(
			(property) =>
				Object.values(property.meter_groups ?? {}).some(
					(entry): entry is MeterGroupEntry =>
						typeof entry === 'object' && entry?.meter_group_id === meterGroupId
				) && !existingPropertyIds.has(property.id)
		);
	});

	// Fetch the straggler property's readings on this cycle's meter group, scoped, when the
	// selected property changes — replaces filtering the old full readings array.
	$effect(() => {
		const propertyId = stragglerPropertyId;
		const meterGroupId = stragglerCycle ? getCycleMeterGroupId(stragglerCycle) : null;
		if (!propertyId || !meterGroupId) {
			stragglerReadings = [];
			return;
		}
		let cancelled = false;
		getReadings({ propertyId, meterGroupId, limit: 100 })
			.then((res) => {
				if (!cancelled) stragglerReadings = res.data;
			})
			.catch(() => {
				if (!cancelled) stragglerReadings = [];
			});
		return () => {
			cancelled = true;
		};
	});

	// Readings for the selected straggler property on this cycle's meter group, oldest first.
	const stragglerAvailableReadings = $derived.by(() => {
		if (!stragglerCycle || !stragglerPropertyId) return [];
		return stragglerReadings
			.slice()
			.sort((a, b) => toDate(a.reading_date).getTime() - toDate(b.reading_date).getTime());
	});

	const stragglerConsumptionPreview = $derived.by(() => {
		const curr = stragglerReadings.find((r) => r.id === stragglerCurrReadingId);
		if (!curr) return 0;
		const prev = stragglerReadings.find((r) => r.id === stragglerPrevReadingId);
		const property = properties.find((p) => p.id === stragglerPropertyId);
		return readingConsumption(curr, prev, property);
	});

	async function handleAddStraggler() {
		if (
			!stragglerCycle ||
			!stragglerPropertyId ||
			!stragglerPrevReadingId ||
			!stragglerCurrReadingId
		) {
			error = 'Select a property and both a previous and current reading';
			return;
		}
		isAddingStraggler = true;
		try {
			const currReading = stragglerReadings.find((r) => r.id === stragglerCurrReadingId);
			const prevReading = stragglerReadings.find((r) => r.id === stragglerPrevReadingId);
			const property = properties.find((p) => p.id === stragglerPropertyId);
			if (!currReading) throw new Error('Selected current reading not found');

			const newBilling = await createBilling({
				property_id: stragglerPropertyId,
				previous_reading_id: stragglerPrevReadingId,
				current_reading_id: stragglerCurrReadingId
			});

			const consumption = readingConsumption(currReading, prevReading, property);
			const updatedBillingIds = {
				...stragglerCycle.billing_ids,
				[newBilling.id]: consumption
			};
			const updatedConsumption = round(
				Object.values(updatedBillingIds).reduce((sum, c) => sum + c, 0)
			);

			await updateBillingCycle(stragglerCycle.id, {
				billing_ids: updatedBillingIds,
				billing_consumption: updatedConsumption
			});

			closeStragglerModal();
			await loadData();
			alert('Straggler billing added to the cycle.');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add straggler billing';
		} finally {
			isAddingStraggler = false;
		}
	}

	function escHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	const billingMap = $derived.by(() => new Map(allBillings.map((b) => [b.id, b])));
	// Lookup over the meter-group-scoped reading set used by cycle discovery/gap-fill.
	// (readingMap above is the on-demand cache for expanded/printed cycles.)
	const cycleFormReadingMap = $derived.by(() => new Map(cycleFormReadings.map((r) => [r.id, r])));
	const meterGroupMap = $derived.by(() => new Map(meterGroups.map((m) => [m.id, m])));

	function getCycleUtilityType(cycle: BillingCycle): string {
		const meterGroup = meterGroupMap.get(cycle.meter_group_id);
		return meterGroup?.utility_type || 'electricity';
	}

	function getCycleMeterGroupId(cycle: BillingCycle): string | null {
		return cycle.meter_group_id ?? null;
	}

	function getCyclePaidAmount(cycle: BillingCycle): number {
		const amounts: number[] = [];
		for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
			const billing = billingMap.get(billingId);
			if (billing?.payment_status === 'paid') {
				amounts.push(billAmount(consumption, cycle.billing_rate));
			}
		}
		return sumMoney(amounts);
	}

	function getCycleMeterGroupName(cycle: BillingCycle): string {
		return meterGroupMap.get(cycle.meter_group_id)?.meter_name || 'Unknown';
	}

	// A cycle is "paid" only once every billing under it is paid — otherwise "pending".
	function getCyclePaymentStatus(cycle: BillingCycle): 'paid' | 'pending' {
		const billingIds = Object.keys(cycle.billing_ids);
		if (billingIds.length === 0) return 'pending';
		return billingIds.every((id) => billingMap.get(id)?.payment_status === 'paid')
			? 'paid'
			: 'pending';
	}

	// Filters — replace the old per-meter-group grouped sections with a single flat,
	// filterable, client-paginated table (cycles are fully loaded via fetchAllPages above).
	let filterUtilityType = $state<'all' | 'electricity' | 'water'>('all');
	let filterMeterGroupId = $state<string>('all');
	let filterDateField = $state<'billing_start_date' | 'overdue_date'>('billing_start_date');
	let filterDateFrom = $state('');
	let filterDateTo = $state('');
	let filterPaymentStatus = $state<'all' | 'paid' | 'pending'>('all');

	const filterableMeterGroups = $derived.by(() =>
		filterUtilityType === 'all'
			? meterGroups
			: meterGroups.filter((m) => m.utility_type === filterUtilityType)
	);

	const filteredCycles = $derived.by(() => {
		return cycles
			.filter((cycle) => {
				if (filterUtilityType !== 'all' && getCycleUtilityType(cycle) !== filterUtilityType) {
					return false;
				}
				if (filterMeterGroupId !== 'all' && cycle.meter_group_id !== filterMeterGroupId) {
					return false;
				}
				if (filterPaymentStatus !== 'all' && getCyclePaymentStatus(cycle) !== filterPaymentStatus) {
					return false;
				}
				const dateValue = cycle[filterDateField];
				if (filterDateFrom || filterDateTo) {
					if (!dateValue) return false;
					const cycleDate = toDate(dateValue);
					if (filterDateFrom && cycleDate < new SvelteDate(filterDateFrom)) return false;
					if (filterDateTo && cycleDate > new SvelteDate(filterDateTo)) return false;
				}
				return true;
			})
			.sort(
				(a, b) => toDate(b.billing_start_date).getTime() - toDate(a.billing_start_date).getTime()
			);
	});

	const cyclesPageSize = 20;
	let currentPage = $state(1);
	const totalPages = $derived.by(() =>
		Math.max(1, Math.ceil(filteredCycles.length / cyclesPageSize))
	);
	const pagedCycles = $derived.by(() => {
		const start = (currentPage - 1) * cyclesPageSize;
		return filteredCycles.slice(start, start + cyclesPageSize);
	});

	function resetToFirstPage() {
		currentPage = 1;
	}

	$effect(() => {
		// Any filter change invalidates the current page position.
		void filterUtilityType;
		void filterMeterGroupId;
		void filterDateField;
		void filterDateFrom;
		void filterDateTo;
		void filterPaymentStatus;
		resetToFirstPage();
	});

	function printReceipts(cyclesToPrint: BillingCycle[]) {
		const receiptRows: string[] = [];
		let currentRow: string[] = [];
		let utilityType = 'electricity';
		let pdfFileName = '';

		// Determine utility type and filename from first cycle
		if (cyclesToPrint.length > 0) {
			const firstCycle = cyclesToPrint[0];
			const cycleBillings = billings.get(firstCycle.id) || [];
			if (cycleBillings.length > 0) {
				const firstBilling = cycleBillings[0];
				const firstReading = readingMap.get(firstBilling.current_reading_id);
				if (firstReading) {
					const meterGroup = meterGroups.find((m) => m.id === firstReading.meter_group_id);
					utilityType = meterGroup?.utility_type || 'electricity';
				}
			}

			// Generate filename: MONTH_YEAR-UTILITYTYPE_BILLINGS.pdf
			const endDate = toDate(firstCycle.billing_end_date);
			const monthName = endDate.toLocaleString('en-US', { month: 'long' }).toUpperCase();
			const year = endDate.getFullYear();
			pdfFileName = `${monthName}_${year}-${utilityType.toUpperCase()}_BILLINGS.pdf`;
		}

		const unit = getReadingUnit(utilityType);

		for (const cycle of cyclesToPrint) {
			const cycleBillings = billings.get(cycle.id) || [];
			for (const billing of cycleBillings) {
				const property = properties.find((p) => p.id === billing.property_id);
				const currReading = readingMap.get(billing.current_reading_id);
				const prevReading = readingMap.get(billing.previous_reading_id);

				const consumption = cycle.billing_ids[billing.id] ?? 0;
				const billRate = cycle.billing_rate;
				const amount = billAmount(consumption, billRate);

				const roomName = escHtml(property?.room_name || 'N/A');
				const currReadingAmount = currReading?.reading_amount ?? 0;
				const prevReadingAmount = prevReading?.reading_amount ?? 0;
				const startDateStr = escHtml(formatDate(toDate(cycle.billing_start_date)));
				const endDateStr = escHtml(formatDate(toDate(cycle.billing_end_date)));

				const escapedUtilityType = escHtml(utilityType);
				const receipt = `
          <div style="border: 2px dashed #333; padding: 8px; page-break-inside: avoid; background: white;">
            <!-- Header -->
            <div style="margin-bottom: 8px; font-family: Helvetica, Arial, sans-serif;">
              <h3 style="margin: 0 0 2px 0; font-size: 23px; font-weight: bold;">${roomName}</h3>
              <p style="margin: 0; font-size: 18px;"><span style="text-transform: capitalize;">${escapedUtilityType}</span> (${startDateStr} - ${endDateStr})</p>
            </div>

            <!-- Reading Calculation -->
            <div style="margin-bottom: 8px; line-height: 1.3;">
              <div style="font-size: 15px; margin-bottom: 2px; font-family: 'Courier New', monospace;">
                ${currReadingAmount.toFixed(2)} ${unit} - ${prevReadingAmount.toFixed(2)} ${unit} = <span style="font-weight: bold;">${consumption.toFixed(2)} ${unit}</span>
              </div>
              <div style="font-size: 12px; color: #666; font-style: italic; font-family: Montserrat, sans-serif;">
                Current Reading (${unit}) - Previous Reading (${unit}) = Consumption (${unit})
              </div>
            </div>

            <!-- Bill Calculation -->
            <div style="margin-bottom: 8px; line-height: 1.3;">
              <div style="font-size: 15px; margin-bottom: 2px; font-family: 'Courier New', monospace;">
                ${consumption.toFixed(2)} ${unit} × ₱${billRate.toFixed(2)} = <span style="font-weight: bold;">₱${amount.toFixed(2)}</span>
              </div>
              <div style="font-size: 12px; color: #666; font-style: italic; font-family: Montserrat, sans-serif;">
                Consumption (${unit}) × Bill Rate (₱) = Total Bill (₱)
              </div>
            </div>

            <!-- Total Bill -->
            <div style="border-top: 2px solid #333; padding-top: 6px; text-align: center; font-family: Helvetica, Arial, sans-serif;">
              <div style="font-size: 23px; font-weight: bold;">Total Bill: ₱${amount.toFixed(2)}</div>
            </div>
          </div>
        `;

				currentRow.push(receipt);
				if (currentRow.length === 2) {
					receiptRows.push(
						`<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 0; page-break-inside: avoid;">
              ${currentRow.join('')}
            </div>`
					);
					currentRow = [];
				}
			}
		}

		// Add remaining receipts if odd number
		if (currentRow.length > 0) {
			receiptRows.push(
				`<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 0; page-break-inside: avoid;">
          ${currentRow.join('')}
        </div>`
			);
		}

		const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${pdfFileName}</title>
        <style>
          @media print {
            body { margin: 0; padding: 5px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 5px; background: white; font-family: 'Courier New', monospace;">
        ${receiptRows.join('')}
      </body>
      </html>
    `;

		if (receiptRows.length === 0) {
			error = 'No receipts to print. Make sure cycles are selected and have billings.';
			return;
		}

		const blob = new Blob([htmlContent], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const printWindow = window.open(url, '_blank', 'width=1000,height=800');

		if (!printWindow) {
			error = 'Failed to open print window. Please check your browser popup settings.';
			return;
		}

		setTimeout(() => {
			printWindow.print();
		}, 500);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Billings</h1>
			<p class="mt-1 text-gray-600">Billing cycles with included billings</p>
		</div>
		<div class="flex gap-3">
			<a
				href={resolve('/billings/archive')}
				class="rounded p-2 text-gray-700 hover:bg-gray-100"
				title="View archive"
				aria-label="View billings archive"
			>
				<Archive size={20} />
			</a>
			<button
				onclick={() => (cycleFormOpen = !cycleFormOpen)}
				class="rounded p-2 text-white"
				style="background-color: var(--color-accent)"
				title="Create new billing cycle"
				aria-label={cycleFormOpen ? 'Cancel new billing cycle' : 'Create new billing cycle'}
			>
				<Plus size={20} />
			</button>
		</div>
	</div>

	{#if error}
		<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
			{error}
		</div>
	{/if}

	{#if cycleFormOpen}
		<div class="rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="font-semibold">New Billing Cycle</h2>
			<p class="mt-1 text-sm text-gray-500">
				Select a meter group and end date — billings for the period are discovered automatically.
			</p>

			<!-- Bill Photo OCR -->
			<div class="mt-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
				<p class="text-sm font-medium text-gray-700">Extract from Bill Photo (optional)</p>
				<div class="flex items-center gap-3">
					<label class="cursor-pointer">
						<input
							type="file"
							accept="image/*"
							class="hidden"
							onchange={async (e) => {
								const file = (e.target as HTMLInputElement).files?.[0];
								if (file) await handleBillPhotoOcr(file);
							}}
							disabled={isBillOcrLoading}
						/>
						<span
							class="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
						>
							{isBillOcrLoading ? 'Extracting...' : 'Upload Bill Photo'}
						</span>
					</label>
					{#if billPhotoUrl && !isBillOcrLoading}
						<span class="text-xs text-green-600">✓ Data extracted</span>
					{/if}
					{#if billOcrRawAmount !== null}
						<span class="text-xs text-gray-500"
							>Bill total: ₱{billOcrRawAmount.toLocaleString()}</span
						>
					{/if}
				</div>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label for="cycle-meter-group" class="block text-sm font-medium text-gray-700"
						>Meter Group</label
					>
					<select
						id="cycle-meter-group"
						bind:value={cycleFormMeterGroup}
						onchange={async () => {
							await autoCalculateCycleDates();
							if (cycleFormEndDate) await runDiscovery();
						}}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					>
						<option value="">Select a meter group</option>
						{#each meterGroups as mg (mg.id)}
							<option value={mg.id}>{mg.meter_name} ({mg.utility_type})</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="cycle-rate" class="block text-sm font-medium text-gray-700"
						>Billing Rate (₱/{getReadingUnit(cycleFormUtilityType)})</label
					>
					<input
						id="cycle-rate"
						type="number"
						step="0.01"
						min="0"
						bind:value={cycleFormRate}
						oninput={() => {
							cycleFormLastChanged = 'rate';
							cycleFormTotalAmount = billAmount(cycleFormTotalConsumption, cycleFormRate);
						}}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
				<div>
					<label for="cycle-start-date" class="block text-sm font-medium text-gray-700"
						>Start Date</label
					>
					<input
						id="cycle-start-date"
						type="date"
						bind:value={cycleFormStartDate}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
				<div>
					<label for="cycle-end-date" class="block text-sm font-medium text-gray-700"
						>End Date</label
					>
					<input
						id="cycle-end-date"
						type="date"
						bind:value={cycleFormEndDate}
						onchange={async () => {
							if (cycleFormMeterGroup) await runDiscovery();
						}}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
				<div>
					<label for="cycle-due-date" class="block text-sm font-medium text-gray-700"
						>Due Date (optional)</label
					>
					<input
						id="cycle-due-date"
						type="date"
						bind:value={cycleFormDueDate}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
			</div>

			<!-- Total Consumption (Source of Truth) — Always Visible -->
			<div class="mt-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="cycle-total-consumption" class="block text-sm font-medium text-blue-900">
							Total Consumption ({getReadingUnit(cycleFormUtilityType)}) — Source of Truth
						</label>
						<input
							id="cycle-total-consumption"
							type="number"
							step="0.01"
							min="0"
							bind:value={cycleFormTotalConsumption}
							oninput={() => {
								cycleFormLastChanged = 'consumption';
								cycleFormTotalAmount = billAmount(cycleFormTotalConsumption, cycleFormRate);
							}}
							class="mt-2 block w-full rounded border border-blue-300 bg-white px-3 py-2 font-mono"
						/>
						<p class="mt-1 text-xs text-blue-700">
							Enter the total consumption from main meter reading (current - previous). Sub-meter
							billings are validated against this.
						</p>
					</div>
					<div>
						<label for="cycle-total-amount" class="block text-sm font-medium text-blue-900"
							>Total Bill Amount</label
						>
						<input
							id="cycle-total-amount"
							type="number"
							step="0.01"
							min="0"
							bind:value={cycleFormTotalAmount}
							oninput={() => {
								cycleFormLastChanged = 'total';
								if (cycleFormTotalConsumption > 0) {
									cycleFormRate = round(cycleFormTotalAmount / cycleFormTotalConsumption);
								} else if (cycleFormRate > 0) {
									cycleFormTotalConsumption = round(cycleFormTotalAmount / cycleFormRate);
								}
							}}
							class="mt-2 block w-full rounded border border-blue-300 bg-white px-3 py-2 font-mono"
						/>
					</div>
				</div>
			</div>

			{#if cycleFormDiscoveredBillings.length > 0}
				<!-- Consumption Breakdown -->
				<div class="mt-6">
					<h3 class="mb-3 text-sm font-semibold text-gray-700">Consumption Breakdown</h3>
					<div class="overflow-x-auto rounded border border-gray-200">
						<table class="w-full text-sm">
							<thead class="border-b border-gray-200 bg-gray-50">
								<tr>
									<th scope="col" class="px-4 py-2 text-left font-semibold text-gray-700"
										>Property</th
									>
									<th scope="col" class="px-4 py-2 text-right font-semibold text-gray-700"
										>Consumption</th
									>
									<th scope="col" class="px-4 py-2 text-right font-semibold text-gray-700"
										>Amount</th
									>
								</tr>
							</thead>
							<tbody>
								{#each cycleFormDiscoveredBillings as d (d.billingId)}
									<tr class="border-b border-gray-100">
										<td class="px-4 py-2 text-gray-900">{d.propertyName}</td>
										<td class="px-4 py-2 text-right font-mono text-gray-700"
											>{d.consumption.toLocaleString()} {getReadingUnit(cycleFormUtilityType)}</td
										>
										<td class="px-4 py-2 text-right font-mono text-gray-900"
											>{formatCurrency(d.amount)}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-2 text-xs text-gray-500">
						Sub-meter billings (regular properties). Main meter automatically receives the
						remainder.
					</p>
					<label class="mt-4 flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" bind:checked={cycleFormOverrideMode} />
						Override readings per property
					</label>
					{#if cycleFormOverrideMode}
						<div class="mt-4 space-y-3">
							{#each cycleFormDiscoveredBillings as d (d.billingId)}
								{@const property = properties.find((p) => p.room_name === d.propertyName)}
								<div class="rounded border border-gray-200 p-3">
									<div class="mb-2 font-medium text-gray-900">{d.propertyName}</div>
									<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
										<select
											class="rounded border border-gray-300 px-3 py-2"
											onchange={(e) => {
												const propertyId = property?.id;
												const prevId = (e.target as HTMLSelectElement).value;
												if (!propertyId || !prevId) return;
												const curr = cycleFormReadings.find(
													(r) =>
														r.property_id === propertyId &&
														r.meter_group_id === cycleFormMeterGroup &&
														r.id !== prevId
												);
												if (!curr) return;
												cycleFormOverrideSelections.set(property?.id ?? d.propertyId, {
													prev_reading_id: prevId,
													curr_reading_id: curr.id
												});
											}}
										>
											<option value="">Select previous reading</option>
											{#each billingCycleReadings.filter((r) => r.property_id === property?.id) as reading (reading.id)}
												<option value={reading.id}
													>{formatReading(
														reading.reading_amount,
														meterGroups.find((m) => m.id === reading.meter_group_id)
															?.utility_type || 'electricity'
													)} - {formatDate(toDate(reading.reading_date))}</option
												>
											{/each}
										</select>
										<select
											class="rounded border border-gray-300 px-3 py-2"
											onchange={(e) => {
												const currId = (e.target as HTMLSelectElement).value;
												const existing = cycleFormOverrideSelections.get(
													property?.id ?? d.propertyId
												);
												if (!currId || !existing) return;
												cycleFormOverrideSelections.set(property?.id ?? d.propertyId, {
													prev_reading_id: existing.prev_reading_id,
													curr_reading_id: currId
												});
											}}
										>
											<option value="">Select current reading</option>
											{#each billingCycleReadings.filter((r) => r.property_id === property?.id) as reading (reading.id)}
												<option value={reading.id}
													>{formatReading(
														reading.reading_amount,
														meterGroups.find((m) => m.id === reading.meter_group_id)
															?.utility_type || 'electricity'
													)} - {formatDate(toDate(reading.reading_date))}</option
												>
											{/each}
										</select>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if cycleFormMeterGroup && cycleFormEndDate}
				<p class="mt-4 text-sm text-gray-500">
					No billings found yet for this meter group and end month.
				</p>
			{/if}

			{#if cycleFormGapProperties.length > 0}
				<!-- Gap-fill: properties with readings for the period but no billing yet -->
				<div class="mt-6">
					<h3 class="mb-1 text-sm font-semibold text-gray-700">Properties Without Billings</h3>
					<p class="mb-3 text-xs text-gray-500">
						These properties have readings for this period but no billing yet. Pick a previous and
						current reading to include them in this cycle.
					</p>
					<div class="space-y-3">
						{#each cycleFormGapProperties as gap, gapIndex (gap.propertyId)}
							<div class="rounded border border-gray-200 p-3">
								<div class="mb-2 font-medium text-gray-900">{gap.propertyName}</div>
								<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
									<select
										class="rounded border border-gray-300 px-3 py-2"
										bind:value={cycleFormGapProperties[gapIndex].selectedPrevReadingId}
									>
										<option value="">Select previous reading</option>
										{#each gap.availableReadings as reading (reading.id)}
											<option value={reading.id}
												>{formatReading(reading.reading_amount, cycleFormUtilityType)} - {formatDate(
													toDate(reading.reading_date)
												)}</option
											>
										{/each}
									</select>
									<select
										class="rounded border border-gray-300 px-3 py-2"
										bind:value={cycleFormGapProperties[gapIndex].selectedCurrReadingId}
									>
										<option value="">Select current reading</option>
										{#each gap.availableReadings as reading (reading.id)}
											<option value={reading.id}
												>{formatReading(reading.reading_amount, cycleFormUtilityType)} - {formatDate(
													toDate(reading.reading_date)
												)}</option
											>
										{/each}
									</select>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="mt-6 flex space-x-2">
				<button
					type="button"
					onclick={handleCreateCycle}
					disabled={isCreatingCycle ||
						(cycleFormDiscoveredBillings.length === 0 &&
							!cycleFormGapProperties.some(
								(g) => g.selectedPrevReadingId && g.selectedCurrReadingId
							))}
					class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
					style="background-color: var(--color-accent)"
				>
					{isCreatingCycle ? 'Creating...' : 'Create Cycle'}
				</button>
				<button
					type="button"
					onclick={() => {
						cycleFormOpen = false;
						resetCycleForm();
					}}
					class="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<div class="space-y-4">
		{#if selectedCyclesForPrint.length > 0}
			<div class="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="flex-1">
					<p class="text-sm font-medium text-blue-900">
						{selectedCyclesForPrint.length} cycle(s) selected
					</p>
				</div>
				<div class="flex gap-2">
					<button
						onclick={async () => {
							const cyclesToPrint = cycles.filter((c) => selectedCyclesForPrint.includes(c.id));
							// Load billings for any cycles that don't have data yet
							for (const cycle of cyclesToPrint) {
								if (!billings.has(cycle.id)) {
									const cycleBillings = allBillings.filter((b) => b.id in cycle.billing_ids);
									billings.set(cycle.id, cycleBillings);
								}
							}
							// Resolve reading amounts for every printed cycle's billings before rendering.
							await resolveReadingsFor(cyclesToPrint.flatMap((c) => billings.get(c.id) ?? []));
							printReceipts(cyclesToPrint);
						}}
						aria-label="Print"
						class="rounded p-2 text-blue-600 hover:bg-blue-100"
						title="Print selected cycles"
					>
						<Printer size={20} />
					</button>
					<button
						onclick={() => {
							if (
								confirm(
									`Archive ${selectedCyclesForPrint.length} billing cycle(s)? They can be restored from the archive.`
								)
							) {
								Promise.all(
									selectedCyclesForPrint.map((cycleId) => softDeleteBillingCycle(cycleId))
								)
									.then(() => {
										selectedCyclesForPrint = [];
										loadData();
									})
									.catch((err) => {
										error = err instanceof Error ? err.message : 'Failed to archive cycles';
									});
							}
						}}
						aria-label="Archive"
						class="rounded p-2 text-red-600 hover:bg-red-100"
						title="Archive selected cycles"
					>
						<Archive size={20} />
					</button>
					<button
						onclick={() => {
							selectedCyclesForPrint = [];
						}}
						aria-label="Clear selection"
						class="rounded p-2 text-gray-600 hover:bg-gray-200"
						title="Clear selection"
					>
						<span class="text-sm font-medium">✕</span>
					</button>
				</div>
			</div>
		{/if}

		<div class="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
			<div>
				<label for="filter-utility" class="mb-1 block text-xs font-medium text-gray-600"
					>Utility Type</label
				>
				<select
					id="filter-utility"
					bind:value={filterUtilityType}
					onchange={() => (filterMeterGroupId = 'all')}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				>
					<option value="all">All</option>
					<option value="electricity">Electricity</option>
					<option value="water">Water</option>
				</select>
			</div>
			<div>
				<label for="filter-meter-group" class="mb-1 block text-xs font-medium text-gray-600"
					>Meter Group</label
				>
				<select
					id="filter-meter-group"
					bind:value={filterMeterGroupId}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				>
					<option value="all">All</option>
					{#each filterableMeterGroups as mg (mg.id)}
						<option value={mg.id}>{mg.meter_name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="filter-date-field" class="mb-1 block text-xs font-medium text-gray-600"
					>Date Range For</label
				>
				<select
					id="filter-date-field"
					bind:value={filterDateField}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				>
					<option value="billing_start_date">Bill Date</option>
					<option value="overdue_date">Due Date</option>
				</select>
			</div>
			<div>
				<label for="filter-date-from" class="mb-1 block text-xs font-medium text-gray-600"
					>From</label
				>
				<input
					id="filter-date-from"
					type="date"
					bind:value={filterDateFrom}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				/>
			</div>
			<div>
				<label for="filter-date-to" class="mb-1 block text-xs font-medium text-gray-600">To</label>
				<input
					id="filter-date-to"
					type="date"
					bind:value={filterDateTo}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				/>
			</div>
			<div>
				<label for="filter-status" class="mb-1 block text-xs font-medium text-gray-600"
					>Payment Status</label
				>
				<select
					id="filter-status"
					bind:value={filterPaymentStatus}
					class="rounded border border-gray-300 px-2 py-1.5 text-sm"
				>
					<option value="all">All</option>
					<option value="paid">Fully Paid</option>
					<option value="pending">Pending</option>
				</select>
			</div>
			{#if filterUtilityType !== 'all' || filterMeterGroupId !== 'all' || filterDateFrom || filterDateTo || filterPaymentStatus !== 'all'}
				<button
					type="button"
					onclick={() => {
						filterUtilityType = 'all';
						filterMeterGroupId = 'all';
						filterDateField = 'billing_start_date';
						filterDateFrom = '';
						filterDateTo = '';
						filterPaymentStatus = 'all';
					}}
					class="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
				>
					Clear filters
				</button>
			{/if}
		</div>

		{#if isLoading}
			<div class="rounded-lg border border-gray-200 bg-white">
				<TableSkeleton rows={6} cols={5} />
			</div>
		{:else if filteredCycles.length === 0}
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<EmptyState title="No billing cycles" message="Create cycles to manage billing periods" />
			</div>
		{:else}
			<div class="space-y-2">
				{#each pagedCycles as cycle (cycle.id)}
					{@const cycleBillings = billings.get(cycle.id)}
					{@const cycleUtilityType = getCycleUtilityType(cycle)}
					<div class="rounded-lg border border-gray-200 bg-white">
						<!-- Cycle Header Row -->
						<div class="flex items-center justify-between px-6 py-4 transition hover:bg-gray-50">
							<div class="flex items-center gap-3">
								<input
									type="checkbox"
									checked={selectedCyclesForPrint.includes(cycle.id)}
									onchange={(e) => {
										if ((e.target as HTMLInputElement).checked) {
											selectedCyclesForPrint = [...selectedCyclesForPrint, cycle.id];
										} else {
											selectedCyclesForPrint = selectedCyclesForPrint.filter(
												(id) => id !== cycle.id
											);
										}
									}}
									class="h-4 w-4"
								/>
								<button
									onclick={() => toggleCycleExpand(cycle.id)}
									class="flex-1 text-left"
									aria-expanded={expandedCycleId === cycle.id}
									aria-controls={`cycle-detail-${cycle.id}`}
								>
									<div class="flex items-center justify-between">
										<div class="flex-1">
											<div class="flex items-center gap-3">
												<div
													class="text-gray-400 transition {expandedCycleId === cycle.id
														? 'rotate-90'
														: ''}"
												>
													<ChevronRight size={20} />
												</div>
												<div>
													<div class="flex items-center gap-2">
														<span class="font-medium text-gray-900">
															{formatDate(toDate(cycle.billing_start_date))} –
															{formatDate(toDate(cycle.billing_end_date))}
														</span>
														<span class="text-sm text-gray-500"
															>{getCycleMeterGroupName(cycle)}</span
														>
														<span
															class="rounded {getUtilityTypeBadgeClasses(
																cycleUtilityType
															)} px-1.5 py-0.5 text-xs font-medium capitalize"
															>{cycleUtilityType}</span
														>
													</div>
													<div class="text-sm text-gray-500">
														{Object.keys(cycle.billing_ids).length} billing
														{Object.keys(cycle.billing_ids).length === 1 ? 'record' : 'records'}
														{#if cycle.overdue_date}
															• Due: {formatDate(toDate(cycle.overdue_date))}
														{/if}
													</div>
												</div>
											</div>
										</div>
										<div class="ml-6 grid grid-cols-4 gap-8 text-right">
											<div>
												<div class="text-xs font-medium text-gray-600">Consumption</div>
												<div class="font-mono font-semibold text-gray-900">
													{cycle.billing_consumption.toLocaleString()}
													{getReadingUnit(getCycleUtilityType(cycle))}
												</div>
											</div>
											<div>
												<div class="text-xs font-medium text-gray-600">Rate</div>
												<div class="font-mono font-semibold text-gray-900">
													₱{cycle.billing_rate.toFixed(2)}/{getReadingUnit(
														getCycleUtilityType(cycle)
													)}
												</div>
											</div>
											<div>
												<div class="text-xs font-medium text-gray-600">Total Amount</div>
												<div class="font-mono font-semibold text-gray-900">
													{formatCurrency(
														billAmount(cycle.billing_consumption, cycle.billing_rate)
													)}
												</div>
											</div>
											<div>
												<div class="text-xs font-medium text-gray-600">Currently Paid</div>
												<div class="font-mono font-semibold text-green-700">
													{formatCurrency(getCyclePaidAmount(cycle))}
												</div>
											</div>
										</div>
									</div>
								</button>
							</div>
							<div class="flex gap-1">
								<button
									onclick={async (e) => {
										e.stopPropagation();
										const cyclesToPrint = [cycle];
										if (!billings.has(cycle.id)) {
											const cycleBillings = allBillings.filter((b) => b.id in cycle.billing_ids);
											billings.set(cycle.id, cycleBillings);
										}
										await resolveReadingsFor(billings.get(cycle.id) ?? []);
										printReceipts(cyclesToPrint);
									}}
									class="rounded p-2 text-blue-600 hover:bg-blue-100"
									title="Print this cycle"
								>
									<Printer size={18} />
								</button>
								<button
									onclick={(e) => {
										e.stopPropagation();
										openCycleEditModal(cycle);
									}}
									class="rounded p-2 text-gray-600 hover:bg-gray-100"
									title="Edit cycle (correct rate, consumption, or dates)"
								>
									<Pencil size={18} />
								</button>
								<button
									onclick={(e) => {
										e.stopPropagation();
										openStragglerModal(cycle);
									}}
									class="rounded p-2 text-gray-600 hover:bg-gray-100"
									title="Add a late-arriving billing to this cycle"
								>
									<Plus size={18} />
								</button>
								<button
									onclick={(e) => {
										e.stopPropagation();
										if (
											confirm(
												'Archive this billing cycle and all its billings? They can be restored from the archive.'
											)
										) {
											softDeleteBillingCycle(cycle.id)
												.then(() => loadData())
												.catch((err) => {
													error =
														err instanceof Error ? err.message : 'Failed to archive billing cycle';
												});
										}
									}}
									class="rounded p-2 text-red-700 hover:bg-red-100"
									title="Archive billing cycle"
								>
									<Archive size={18} />
								</button>
							</div>
						</div>

						<!-- Expanded Billings Table -->
						{#if expandedCycleId === cycle.id}
							<div id={`cycle-detail-${cycle.id}`} class="border-t border-gray-200 bg-gray-50">
								{#if cycleBillings?.length === 0}
									<div class="px-6 py-4">
										<EmptyState title="No billings" message="No billings in this cycle yet" />
									</div>
								{:else if cycleBillings}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead class="border-b border-gray-200 bg-gray-50">
												<tr>
													<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
														>Property</th
													>
													<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
														>Previous Reading</th
													>
													<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
														>Current Reading</th
													>
													<th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">
														Consumption
													</th>
													<th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700"
														>Amount</th
													>
													<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
														>Status</th
													>
													<th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700"
														>Actions</th
													>
												</tr>
											</thead>
											<tbody>
												{#each cycleBillings || [] as billing (billing.id)}
													{@const billingProperty = properties.find(
														(p) => p.id === billing.property_id
													)}
													{@const cycleMeterGroup = cycle.meter_group_id
														? meterGroupMap.get(cycle.meter_group_id)
														: undefined}
													{@const meterEntry = cycle.meter_group_id
														? cycleMeterGroup?.utility_type === 'water'
															? billingProperty?.meter_groups.water
															: billingProperty?.meter_groups.electricity
														: null}
													{@const isMainMeter =
														typeof meterEntry === 'string'
															? false
															: (meterEntry?.is_main_meter ?? false)}
													{@const previousReading = readingMap.get(billing.previous_reading_id)}
													{@const currentReading = readingMap.get(billing.current_reading_id)}
													{@const previousMeterGroup = previousReading
														? meterGroupMap.get(previousReading.meter_group_id)
														: undefined}
													{@const currentMeterGroup = currentReading
														? meterGroupMap.get(currentReading.meter_group_id)
														: undefined}
													{@const meterWasReset =
														previousReading &&
														currentReading &&
														(previousReading.meter_version ?? 1) !==
															(currentReading.meter_version ?? 1)}
													<tr class="border-b border-gray-100 hover:bg-white">
														<td class="px-6 py-3 text-gray-900">
															<div class="flex items-center gap-2">
																<span>{billingProperty?.room_name ?? 'Unknown Property'}</span>
															</div>
														</td>
														<td class="px-6 py-3 font-mono text-gray-700">
															{#if previousReading}
																{formatReading(
																	previousReading.reading_amount,
																	previousMeterGroup?.utility_type || 'electricity'
																)}
															{:else}
																N/A
															{/if}
														</td>
														<td class="px-6 py-3 font-mono text-gray-700">
															{#if currentReading}
																{formatReading(
																	currentReading.reading_amount,
																	currentMeterGroup?.utility_type || 'electricity'
																)}
																{#if meterWasReset}
																	<span
																		class="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
																		title="Meter was replaced/reset between these two readings"
																		>meter reset</span
																	>
																{/if}
															{:else}
																N/A
															{/if}
														</td>
														<td class="px-6 py-3 text-right font-mono text-gray-700">
															{#if currentReading}
																{(cycle.billing_ids[billing.id] ?? 0).toLocaleString()}
																{getReadingUnit(currentMeterGroup?.utility_type || 'electricity')}
															{:else}
																N/A
															{/if}
														</td>
														<td
															class="px-6 py-3 text-right font-semibold {isMainMeter
																? 'text-purple-800'
																: 'text-gray-900'}"
														>
															{formatCurrency(
																(cycle.billing_ids[billing.id] ?? 0) * cycle.billing_rate
															)}
														</td>
														<td class="px-6 py-3">
															<StatusPill status={billing.payment_status} />
														</td>
														<td class="px-6 py-3">
															<div class="flex gap-1">
																{#if billing.payment_status === 'pending'}
																	<button
																		onclick={() => handleMarkAsPaid(billing.id)}
																		disabled={isLoading || markingAsPaidId === billing.id}
																		class="rounded p-2 text-green-700 hover:bg-green-100 disabled:opacity-50"
																		title="Mark as paid"
																	>
																		<CheckCircle2 size={18} />
																	</button>
																{/if}
																<button
																	onclick={() => openEditModal(billing)}
																	disabled={isLoading || isUpdating}
																	class="rounded p-2 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
																	title="Edit billing"
																>
																	<Pencil size={18} />
																</button>
																<button
																	onclick={() =>
																		crud.handleSoftDelete(
																			billing.id,
																			softDeleteBilling,
																			loadData,
																			() =>
																				confirm(
																					'Archive this billing? It can be restored from the archive.'
																				)
																		)}
																	disabled={isLoading || crud.deletingId === billing.id}
																	class="rounded p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
																	title="Archive billing"
																>
																	<Archive size={18} />
																</button>
															</div>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<TableSkeleton rows={3} cols={5} />
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if totalPages > 1}
				<div class="flex items-center justify-between py-2">
					<span class="text-sm text-gray-600">
						Page {currentPage} of {totalPages} ({filteredCycles.length} cycles)
					</span>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => (currentPage = Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							class="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
						>
							Previous
						</button>
						<button
							type="button"
							onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							class="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Edit Modal -->
<EditModal
	bind:isOpen={crud.editModalOpen}
	title="Edit Billing"
	isLoading={isUpdating}
	onClose={crud.closeEditModal}
	onSubmit={handleUpdate}
>
	<div class="space-y-4">
		<div>
			<label for="edit-property" class="block text-sm font-medium text-gray-700">Property</label>
			<select
				id="edit-property"
				bind:value={editData.property_id}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			>
				{#each properties as prop (prop.id)}
					<option value={prop.id}>{prop.room_name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="edit-previous-reading" class="block text-sm font-medium text-gray-700"
				>Previous Reading</label
			>
			<select
				id="edit-previous-reading"
				bind:value={editData.previous_reading_id}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			>
				{#each editReadings as reading (reading.id)}
					<option value={reading.id}>
						{formatReading(
							reading.reading_amount,
							meterGroups.find((m) => m.id === reading.meter_group_id)?.utility_type ||
								'electricity'
						)} - {formatDate(toDate(reading.reading_date))}
					</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="edit-current-reading" class="block text-sm font-medium text-gray-700"
				>Current Reading</label
			>
			<select
				id="edit-current-reading"
				bind:value={editData.current_reading_id}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			>
				{#each editReadings as reading (reading.id)}
					<option value={reading.id}>
						{formatReading(
							reading.reading_amount,
							meterGroups.find((m) => m.id === reading.meter_group_id)?.utility_type ||
								'electricity'
						)} - {formatDate(toDate(reading.reading_date))}
					</option>
				{/each}
			</select>
		</div>
	</div>
</EditModal>

<EditModal
	bind:isOpen={cycleEditModalOpen}
	title="Edit Billing Cycle"
	isLoading={isUpdatingCycle}
	onClose={closeCycleEditModal}
	onSubmit={handleUpdateCycle}
>
	<div class="space-y-4">
		<p class="text-sm text-gray-500">
			Use this to correct company errors or OCR misreads in the cycle's totals or dates. This does
			not change individual billing amounts.
		</p>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="cycle-edit-consumption" class="block text-sm font-medium text-gray-700"
					>Total Consumption</label
				>
				<input
					id="cycle-edit-consumption"
					type="number"
					step="0.01"
					bind:value={cycleEditConsumption}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>
			<div>
				<label for="cycle-edit-rate" class="block text-sm font-medium text-gray-700">Rate</label>
				<input
					id="cycle-edit-rate"
					type="number"
					step="0.01"
					bind:value={cycleEditRate}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="cycle-edit-start" class="block text-sm font-medium text-gray-700"
					>Start Date</label
				>
				<input
					id="cycle-edit-start"
					type="date"
					bind:value={cycleEditStartDate}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>
			<div>
				<label for="cycle-edit-end" class="block text-sm font-medium text-gray-700">End Date</label>
				<input
					id="cycle-edit-end"
					type="date"
					bind:value={cycleEditEndDate}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>
		</div>
		<div>
			<label for="cycle-edit-due" class="block text-sm font-medium text-gray-700"
				>Due Date (optional)</label
			>
			<input
				id="cycle-edit-due"
				type="date"
				bind:value={cycleEditDueDate}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>
	</div>
</EditModal>

<EditModal
	bind:isOpen={stragglerModalOpen}
	title="Add Straggler Billing"
	isLoading={isAddingStraggler}
	onClose={closeStragglerModal}
	onSubmit={handleAddStraggler}
	submitButtonText="Add to Cycle"
>
	<div class="space-y-4">
		<p class="text-sm text-gray-500">
			Adds one late-arriving billing to this cycle. Creates the billing from a reading pair, then
			folds its consumption into the cycle's total.
		</p>
		<div>
			<label for="straggler-property" class="block text-sm font-medium text-gray-700"
				>Property</label
			>
			<select
				id="straggler-property"
				bind:value={stragglerPropertyId}
				onchange={() => {
					stragglerPrevReadingId = '';
					stragglerCurrReadingId = '';
				}}
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			>
				<option value="">Select property...</option>
				{#each stragglerCandidateProperties as property (property.id)}
					<option value={property.id}>{property.room_name}</option>
				{/each}
			</select>
			{#if stragglerCycle && stragglerCandidateProperties.length === 0}
				<p class="mt-1 text-xs text-gray-500">
					Every property on this cycle's meter group already has a billing.
				</p>
			{/if}
		</div>
		{#if stragglerPropertyId}
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="straggler-prev-reading" class="block text-sm font-medium text-gray-700"
						>Previous Reading</label
					>
					<select
						id="straggler-prev-reading"
						bind:value={stragglerPrevReadingId}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					>
						<option value="">Select...</option>
						{#each stragglerAvailableReadings as reading (reading.id)}
							<option value={reading.id}
								>{formatDate(toDate(reading.reading_date))} — {reading.reading_amount}</option
							>
						{/each}
					</select>
				</div>
				<div>
					<label for="straggler-curr-reading" class="block text-sm font-medium text-gray-700"
						>Current Reading</label
					>
					<select
						id="straggler-curr-reading"
						bind:value={stragglerCurrReadingId}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					>
						<option value="">Select...</option>
						{#each stragglerAvailableReadings as reading (reading.id)}
							<option value={reading.id}
								>{formatDate(toDate(reading.reading_date))} — {reading.reading_amount}</option
							>
						{/each}
					</select>
				</div>
			</div>
			{#if stragglerAvailableReadings.length === 0}
				<p class="text-xs text-gray-500">
					No readings found for this property on this meter group.
				</p>
			{/if}
			{#if stragglerCurrReadingId}
				<p class="text-sm text-gray-700">
					Consumption preview: <span class="font-semibold">{stragglerConsumptionPreview}</span>
					{getReadingUnit(getCycleUtilityType(stragglerCycle!))}
				</p>
			{/if}
		{/if}
	</div>
</EditModal>
