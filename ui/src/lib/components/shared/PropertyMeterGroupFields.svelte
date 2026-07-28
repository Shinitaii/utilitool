<script lang="ts">
	import type { MeterGroup } from '$lib/types/meter-group.types';

	interface Props {
		electricityMeters: MeterGroup[];
		waterMeters: MeterGroup[];
		meterGroups: { electricity: string; water: string };
		isMainMeter: { electricity: boolean; water: boolean };
		getMainMeterPropertyForMeterGroup: (meterGroupId: string) => string | null;
		getMainMeterPropertyName: (meterGroupId: string) => string | null;
		/** Excludes this property from "already the main meter" warnings — pass the property
		 * being edited so its own existing main-meter flag doesn't warn against itself. */
		excludePropertyId?: string;
		/** Unique id prefix so this can be rendered twice on one page (create + edit forms). */
		idPrefix?: string;
		/** Edit-modal styling (text-sm, py-2) vs. the sidebar create-form's compact (text-xs, py-1). */
		compact?: boolean;
	}

	const {
		electricityMeters,
		waterMeters,
		meterGroups,
		isMainMeter,
		getMainMeterPropertyForMeterGroup,
		getMainMeterPropertyName,
		excludePropertyId,
		idPrefix = '',
		compact = false
	}: Props = $props();

	const labelClass = $derived(
		compact ? 'block text-xs font-medium text-gray-700' : 'block text-sm font-medium text-gray-700'
	);
	const selectClass = $derived(
		compact
			? 'mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm'
			: 'mt-1 w-full rounded border border-gray-300 px-3 py-2'
	);
	const checkboxLabelClass = $derived(
		compact
			? 'flex items-center gap-2 text-xs font-medium text-gray-700'
			: 'flex items-center gap-2 text-sm font-medium text-gray-700'
	);

	const electricityMainMeterProperty = $derived(
		meterGroups.electricity ? getMainMeterPropertyForMeterGroup(meterGroups.electricity) : null
	);
	const waterMainMeterProperty = $derived(
		meterGroups.water ? getMainMeterPropertyForMeterGroup(meterGroups.water) : null
	);
</script>

<div>
	<label for={`${idPrefix}electricity-meter`} class={labelClass}>Electricity Meter Group</label>
	<select
		id={`${idPrefix}electricity-meter`}
		bind:value={meterGroups.electricity}
		class={selectClass}
	>
		<option value="">Select electricity meter...</option>
		{#each electricityMeters as group (group.id)}
			<option value={group.id}>{group.meter_name}</option>
		{/each}
	</select>
</div>
<div>
	<label for={`${idPrefix}water-meter`} class={labelClass}>Water Meter Group</label>
	<select id={`${idPrefix}water-meter`} bind:value={meterGroups.water} class={selectClass}>
		<option value="">Select water meter...</option>
		{#each waterMeters as group (group.id)}
			<option value={group.id}>{group.meter_name}</option>
		{/each}
	</select>
</div>

{#if meterGroups.electricity || meterGroups.water}
	<div class="space-y-2">
		{#if meterGroups.electricity}
			<label class={checkboxLabelClass}>
				<input
					type="checkbox"
					bind:checked={isMainMeter.electricity}
					disabled={electricityMainMeterProperty !== null &&
						electricityMainMeterProperty !== excludePropertyId &&
						!isMainMeter.electricity}
					class="rounded disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<span>Main Meter (Electricity)</span>
			</label>
			{#if electricityMainMeterProperty !== null && electricityMainMeterProperty !== excludePropertyId && !isMainMeter.electricity}
				<p class="ml-6 text-xs text-amber-700">
					{getMainMeterPropertyName(meterGroups.electricity)} is already the main meter
				</p>
			{/if}
		{/if}
		{#if meterGroups.water}
			<label class={checkboxLabelClass}>
				<input
					type="checkbox"
					bind:checked={isMainMeter.water}
					disabled={waterMainMeterProperty !== null &&
						waterMainMeterProperty !== excludePropertyId &&
						!isMainMeter.water}
					class="rounded disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<span>Main Meter (Water)</span>
			</label>
			{#if waterMainMeterProperty !== null && waterMainMeterProperty !== excludePropertyId && !isMainMeter.water}
				<p class="ml-6 text-xs text-amber-700">
					{getMainMeterPropertyName(meterGroups.water)} is already the main meter
				</p>
			{/if}
		{/if}
	</div>
{/if}
