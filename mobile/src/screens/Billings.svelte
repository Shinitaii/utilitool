<script lang="ts">
  import { listBillingCycles, type BillingCycle } from '../lib/api/billing-cycles';
  import { listBillings, updateBillingStatus, type Billing } from '../lib/api/billings';
  import { listMeterGroups, type MeterGroup } from '../lib/api/meter-groups';
  import { formatTimestampDate } from '../lib/utils/timestamp';
  import { getReadingUnit } from '../lib/utils/format';
  import { getStatusSummary } from '../lib/utils/billing-cycle.util';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let cycles: BillingCycle[] = $state([]);
  let propertyNames: Record<string, string> = $state({});
  let meterGroups: MeterGroup[] = $state([]);
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let expandedCycleId: string | null = $state(null);
  let billingMap = $state<Map<string, Billing>>(new Map());

  $effect(async () => {
    try {
      isLoading = true;
      error = null;

      const [cyclesRes, billingsRes, meterGroupsRes] = await Promise.all([
        listBillingCycles({ limit: 50 }),
        listBillings(),
        listMeterGroups()
      ]);

      cycles = cyclesRes.data || [];
      billingMap = new Map((billingsRes.data || []).map(b => [b.id, b]));

      if (meterGroupsRes.data) {
        meterGroups = meterGroupsRes.data;
      }

      const properties = await sessionCache.getOrFetchProperties();

      const names: Record<string, string> = {};
      const propertyMap = new Map(properties.map(p => [p.id, p.room_name]));

      const allPropertyIds = new Set<string>();
      cycles.forEach(cycle => {
        Object.keys(cycle.billing_ids).forEach(billingId => {
          const billing = billingMap.get(billingId);
          if (billing) {
            allPropertyIds.add(billing.property_id);
          }
        });
      });

      for (const propId of allPropertyIds) {
        names[propId] = propertyMap.get(propId) || `Property ${propId.slice(0, 6)}`;
      }

      propertyNames = names;
    } catch (e) {
      error = 'Failed to load billings';
    } finally {
      isLoading = false;
    }
  });

  function toggleCycleExpand(cycleId: string) {
    expandedCycleId = expandedCycleId === cycleId ? null : cycleId;
  }

  function getMeterGroupName(meterGroupId: string): string {
    return meterGroups.find(m => m.id === meterGroupId)?.meter_name || 'Unknown';
  }

  function getCycleUtilityType(cycle: BillingCycle): string {
    return meterGroups.find(m => m.id === cycle.meter_group_id)?.utility_type || 'electricity';
  }

  // Per-property breakdown — mirrors the desktop UI's expanded cycle view
  // (consumption comes from the cycle's confirmed billing_ids map; amount = consumption × rate).
  function getBillingConsumption(cycle: BillingCycle, billingId: string): number {
    return cycle.billing_ids[billingId] ?? 0;
  }

  function getBillingAmount(cycle: BillingCycle, billingId: string): number {
    return getBillingConsumption(cycle, billingId) * cycle.billing_rate;
  }

  function formatCurrency(amount: number): string {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function markAsPaid(billingId: string) {
    try {
      error = null;
      await updateBillingStatus(billingId, 'paid');
      const billing = billingMap.get(billingId);
      if (billing) {
        billing.payment_status = 'paid';
        billingMap = billingMap;
      }
    } catch (e: any) {
      error = e.message || 'Failed to update billing status';
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'paid':
        return 'background-color: #d4edda; color: var(--color-status-good); border-color: var(--color-status-good)';
      case 'overdue':
        return 'background-color: #fde5e0; color: var(--color-status-alert); border-color: var(--color-status-alert)';
      default:
        return 'background-color: #fef3cd; color: #7a5c00; border-color: #c89a00';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'paid':
        return '✓ Paid';
      case 'overdue':
        return '⚠ Overdue';
      default:
        return '⏳ Pending';
    }
  }

  let groupedCycles = $derived.by(() => {
    const grouped = new Map<string, BillingCycle[]>();
    cycles.forEach(cycle => {
      const key = cycle.meter_group_id;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(cycle);
    });
    return Array.from(grouped.entries()).map(([mgId, cycleList]) => ({
      meterGroupId: mgId,
      meterGroupName: getMeterGroupName(mgId),
      cycles: cycleList
    }));
  });

  function getCycleBillings(cycle: BillingCycle): Billing[] {
    return Object.keys(cycle.billing_ids)
      .map(billingId => billingMap.get(billingId))
      .filter((b): b is Billing => !!b);
  }
</script>

<div class="min-h-screen pb-20" style="background-color: var(--color-bg-primary)">
  <div class="p-4 border-b bg-white" style="border-color: var(--color-border)">
    <h1 class="text-xl font-bold" style="color: var(--color-text-primary)">Billings</h1>
  </div>

  {#if error}
    <div class="p-4 m-4 rounded" style="background-color: #fde5e0; color: var(--color-status-alert); border: 1px solid var(--color-status-alert)">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">Loading...</div>
  {:else if cycles.length === 0}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">No billing cycles found</div>
  {:else}
    <div class="p-4 space-y-4">
      {#each groupedCycles as group (group.meterGroupId)}
        <div>
          <h2 class="text-sm font-semibold mb-2" style="color: var(--color-text-secondary)">
            {group.meterGroupName}
          </h2>
          <div class="space-y-2">
            {#each group.cycles as cycle (cycle.id)}
              {@const billings = getCycleBillings(cycle)}
              {@const statusSummary = getStatusSummary(cycle, billingMap)}
              <div
                role="button"
                tabindex="0"
                onclick={() => toggleCycleExpand(cycle.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleCycleExpand(cycle.id)}
                class="card-base w-full p-4 text-left transition cursor-pointer"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold" style="color: var(--color-text-primary)">
                    {formatTimestampDate(cycle.billing_start_date)} – {formatTimestampDate(cycle.billing_end_date)}
                  </h4>
                  <span class="text-xs font-semibold text-gray-600">{billings.length} billing(s)</span>
                </div>

                <div class="space-y-1 mb-2">
                  <div class="text-xs" style="color: var(--color-text-tertiary)">
                    Rate: ₱{cycle.billing_rate.toFixed(2)} | Consumption: {cycle.billing_consumption.toLocaleString()}
                  </div>
                  {#if cycle.overdue_date}
                    <div class="text-xs" style="color: var(--color-status-alert)">
                      Due: {formatTimestampDate(cycle.overdue_date)}
                    </div>
                  {/if}
                </div>

                <!-- Status Summary Badges -->
                <div class="flex gap-2 flex-wrap">
                  {#if statusSummary.overdue > 0}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('overdue')}>
                      ⚠ {statusSummary.overdue} overdue
                    </span>
                  {/if}
                  {#if statusSummary.pending > 0}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('pending')}>
                      ⏳ {statusSummary.pending} pending
                    </span>
                  {/if}
                  {#if statusSummary.paid > 0}
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('paid')}>
                      ✓ {statusSummary.paid} paid
                    </span>
                  {/if}
                </div>

                <!-- Expanded Billings List -->
                {#if expandedCycleId === cycle.id}
                  <div class="mt-3 pt-3 border-t space-y-2" style="border-color: var(--color-border)">
                    {#each billings as billing (billing.id)}
                      <div class="flex justify-between items-center p-2 rounded" style="background-color: var(--color-bg-secondary)">
                        <div>
                          <div class="text-sm font-medium" style="color: var(--color-text-primary)">
                            {propertyNames[billing.property_id] || 'Loading...'}
                          </div>
                          <div class="text-xs" style="color: var(--color-text-tertiary)">
                            {getBillingConsumption(cycle, billing.id).toLocaleString()} {getReadingUnit(getCycleUtilityType(cycle))} · {formatCurrency(getBillingAmount(cycle, billing.id))}
                          </div>
                          <div class="text-xs" style="color: var(--color-text-tertiary)">
                            Status: {getStatusLabel(billing.payment_status)}
                          </div>
                        </div>
                        {#if billing.payment_status === 'pending' || billing.payment_status === 'overdue'}
                          <button
                            onclick={(e) => {
                              e.stopPropagation();
                              markAsPaid(billing.id);
                            }}
                            class="px-2 py-1 rounded text-xs font-semibold"
                            style="background-color: var(--color-status-good); color: white"
                          >
                            Mark Paid
                          </button>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <BottomNav active="billings" />
</div>
