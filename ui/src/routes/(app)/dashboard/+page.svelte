<script lang="ts">
	import { onMount } from 'svelte';
	import { getProperties } from '$lib/api/properties';
	import { getTenants } from '$lib/api/tenants';
	import { getBillingCycles } from '$lib/api/billing-cycles';
	import { getBillingsByIds } from '$lib/stores/entity-lookup-cache';
	import { getMeterGroups } from '$lib/api/meter-groups';
	import { formatCurrency, formatFirestoreDate, getReadingUnit } from '$lib/utils/format';
	import { toDate } from '$lib/utils/timestamp';
	import { getCyclePaidAmount, getCycleOutstandingAmount } from '$lib/utils/billing-cycle.util';
	import { getUtilityTypeBadgeClasses } from '$lib/utils/utility-colors';
	import TableSkeleton from '$lib/components/shared/TableSkeleton.svelte';
	import type { BillingCycle } from '$lib/types/billing-cycle.types';
	import type { Billing } from '$lib/types/billing.types';
	import type { MeterGroup } from '$lib/types/meter-group.types';

	let isLoading = $state(true);
	let error = $state('');

	let propertyCount = $state(0);
	let tenantCount = $state(0);
	let allCycles = $state<BillingCycle[]>([]);
	let meterGroups = $state<MeterGroup[]>([]);
	let billingMap = $state<Map<string, Billing>>(new Map());
	let recentCyclesRangeMonths = $state<3 | 6 | 12>(3);

	const recentCycles = $derived.by(() => {
		const now = new Date();
		const cutoff = new Date(
			now.getFullYear(),
			now.getMonth() - recentCyclesRangeMonths,
			now.getDate()
		);
		return allCycles
			.filter((cycle) => toDate(cycle.billing_start_date) >= cutoff)
			.sort(
				(a, b) => toDate(b.billing_start_date).getTime() - toDate(a.billing_start_date).getTime()
			);
	});

	// Stat boxes are scoped to the same selected range as the cycles table below them —
	// otherwise "Billed"/"Collected"/"Outstanding" silently summed every cycle ever
	// regardless of which range tab was selected, which read as internally inconsistent.
	const totalBilled = $derived.by(() =>
		recentCycles.reduce((sum, cycle) => {
			const cycleTotal = Object.values(cycle.billing_ids).reduce(
				(s, consumption) => s + consumption * cycle.billing_rate,
				0
			);
			return sum + cycleTotal;
		}, 0)
	);
	const totalCollected = $derived.by(() =>
		recentCycles.reduce((sum, cycle) => sum + getCyclePaidAmount(cycle, billingMap), 0)
	);
	const totalOutstanding = $derived.by(() =>
		recentCycles.reduce((sum, cycle) => sum + getCycleOutstandingAmount(cycle, billingMap), 0)
	);

	// Bound the cycle fetch to the widest selectable range (12 months) instead of pulling
	// all-time history, then page through that window with cursors. Billings are resolved
	// per-ID (getBillingsByIds) from only the cycles in this window — replacing the old
	// full-billings-collection scan on every dashboard load.
	async function fetchCyclesInWindow(startDateIso: string) {
		const all: BillingCycle[] = [];
		let cursor: string | undefined;
		do {
			const page = await getBillingCycles({
				billingStartDate: startDateIso,
				limit: 100,
				cursor
			});
			all.push(...page.data);
			cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
		} while (cursor);
		return all;
	}

	onMount(async () => {
		try {
			const now = new Date();
			const windowStart = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());

			const [propertiesResult, tenantsResult, cyclesData, meterGroupsResult] = await Promise.all([
				getProperties({ limit: 100 }),
				getTenants({ limit: 100 }),
				fetchCyclesInWindow(windowStart.toISOString()),
				getMeterGroups({ limit: 100 })
			]);

			propertyCount = propertiesResult.data.length;
			tenantCount = tenantsResult.data.length;
			allCycles = cyclesData;
			meterGroups = meterGroupsResult.data;

			// Resolve only the billings referenced by the in-window cycles (for paid/outstanding
			// amounts) — the denormalized cycle fields already carry everything else the cards need.
			const billingIds = cyclesData.flatMap((cycle) => Object.keys(cycle.billing_ids));
			billingMap = await getBillingsByIds(billingIds);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load dashboard data';
		} finally {
			isLoading = false;
		}
	});
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Welcome back</h1>
		<p class="mt-2 text-gray-600">Dashboard · Property Utility Management</p>
	</div>

	{#if error}
		<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
	{/if}

	{#if isLoading}
		<div class="grid grid-cols-4 gap-4">
			{#each [1, 2, 3, 4] as _, i (i)}
				<div class="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
					<div class="mb-3 h-4 w-24 rounded bg-gray-200"></div>
					<div class="mb-2 h-8 w-20 rounded bg-gray-200"></div>
					<div class="h-3 w-16 rounded bg-gray-200"></div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid grid-cols-4 gap-4">
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<p class="text-sm font-medium text-gray-600">{recentCyclesRangeMonths} Month(s) Billed</p>
				<p class="mt-2 text-3xl font-bold">{formatCurrency(totalBilled)}</p>
				<p class="mt-1 text-xs text-gray-500">{recentCycles.length} cycle(s) in range</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<p class="text-sm font-medium text-gray-600">Collected (same range)</p>
				<p class="mt-2 text-3xl font-bold">{formatCurrency(totalCollected)}</p>
				<p class="mt-1 text-xs text-gray-500">
					{totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0}%
				</p>
			</div>
			<div
				class="rounded-lg border border-gray-200 bg-white p-6"
				style="background-color: var(--color-status-unpaid-bg)"
			>
				<p class="text-sm font-medium text-gray-600">Outstanding (same range)</p>
				<p class="mt-2 text-3xl font-bold">{formatCurrency(totalOutstanding)}</p>
				<p class="mt-1 text-xs text-gray-500">Pending payments</p>
			</div>
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<p class="text-sm font-medium text-gray-600">Properties</p>
				<p class="mt-2 text-3xl font-bold">{propertyCount}</p>
				<p class="mt-1 text-xs text-gray-500">{tenantCount} tenant(s)</p>
			</div>
		</div>
	{/if}

	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<div class="flex items-center justify-between">
			<h2 class="font-semibold">Recent Billing Cycles</h2>
			<div class="flex gap-1 rounded-lg border border-gray-200 p-1">
				{#each [3, 6, 12] as months (months)}
					<button
						type="button"
						onclick={() => (recentCyclesRangeMonths = months as 3 | 6 | 12)}
						class="rounded px-3 py-1 text-sm font-medium transition {recentCyclesRangeMonths ===
						months
							? 'bg-gray-900 text-white'
							: 'text-gray-600 hover:bg-gray-100'}"
					>
						{months}mo
					</button>
				{/each}
			</div>
		</div>
		{#if isLoading}
			<TableSkeleton rows={4} cols={4} />
		{:else if recentCycles.length === 0}
			<p class="mt-4 text-sm text-gray-600">
				No billing cycles yet. Create one from the Billings page.
			</p>
		{:else}
			<table class="mt-4 w-full text-sm">
				<caption class="sr-only">Recent billing cycles</caption>
				<thead>
					<tr class="border-b border-gray-100 text-left text-gray-500">
						<th scope="col" class="pb-2 font-medium">Period</th>
						<th scope="col" class="pb-2 font-medium">Meter Group</th>
						<th scope="col" class="pb-2 font-medium">Consumption</th>
						<th scope="col" class="pb-2 text-right font-medium">Paid</th>
						<th scope="col" class="pb-2 text-right font-medium">Outstanding</th>
					</tr>
				</thead>
				<tbody>
					{#each recentCycles as cycle (cycle.id)}
						{@const meterGroup = meterGroups.find((m) => m.id === cycle.meter_group_id)}
						<tr class="border-b border-gray-50">
							<td class="py-2 text-gray-700">
								{formatFirestoreDate(cycle.billing_start_date)} – {formatFirestoreDate(
									cycle.billing_end_date
								)}
							</td>
							<td class="py-2">
								<div class="flex items-center gap-2">
									<span>{meterGroup?.meter_name ?? 'Unknown'}</span>
									{#if meterGroup?.utility_type}
										<span
											class="rounded {getUtilityTypeBadgeClasses(
												meterGroup.utility_type
											)} px-2 py-0.5 text-xs font-medium capitalize">{meterGroup.utility_type}</span
										>
									{/if}
								</div>
							</td>
							<td class="py-2"
								>{cycle.billing_consumption.toLocaleString()}
								{getReadingUnit(meterGroup?.utility_type || 'electricity')}</td
							>
							<td class="py-2 text-right font-semibold text-green-700"
								>{formatCurrency(getCyclePaidAmount(cycle, billingMap))}</td
							>
							<td class="py-2 text-right font-semibold text-amber-700"
								>{formatCurrency(getCycleOutstandingAmount(cycle, billingMap))}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
