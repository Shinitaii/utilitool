<script lang="ts">
  import { listBillings, updateBillingStatus, type Billing } from '../lib/api/billings';
  import { listProperties } from '../lib/api/properties';
  import { formatDate } from '../lib/utils/timestamp';
  import { sessionCache } from '../lib/stores/session';
  import BottomNav from '../components/BottomNav.svelte';

  let billings: Billing[] = $state([]);
  let propertyNames: Record<string, string> = $state({});
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let expandedBillings: Set<string> = $state(new Set());

  $effect(async () => {
    try {
      const res = await listBillings();
      billings = res.data || [];

      // Fetch property names from cache or API
      let properties = sessionCache.getProperties();
      if (!properties) {
        const propsRes = await listProperties();
        properties = propsRes.data || [];
        sessionCache.setProperties(properties);
      }

      const names: Record<string, string> = {};
      const propertyMap = new Map(properties.map(p => [p.id, p.room_name]));

      const propertyIds = new Set(billings.map(b => b.property_id));
      for (const propId of propertyIds) {
        names[propId] = propertyMap.get(propId) || `Property ${propId.slice(0, 6)}`;
      }

      propertyNames = names;
    } catch (e) {
      error = 'Failed to load billings';
    } finally {
      isLoading = false;
    }
  });

  function toggleBilling(id: string) {
    if (expandedBillings.has(id)) {
      expandedBillings.delete(id);
    } else {
      expandedBillings.add(id);
    }
    expandedBillings = expandedBillings;
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

  async function markAsPaid(billingId: string) {
    try {
      error = null;
      await updateBillingStatus(billingId, 'paid');
      // Update local state
      const billing = billings.find(b => b.id === billingId);
      if (billing) {
        billing.payment_status = 'paid';
      }
    } catch (e: any) {
      error = e.message || 'Failed to update billing status';
    }
  }


  let groupedBillings = $derived.by(() => {
    const grouped = {
      pending: [] as Billing[],
      overdue: [] as Billing[],
      paid: [] as Billing[]
    };

    billings.forEach(b => {
      if (b.payment_status === 'paid') {
        grouped.paid.push(b);
      } else if (b.payment_status === 'overdue') {
        grouped.overdue.push(b);
      } else {
        grouped.pending.push(b);
      }
    });

    return grouped;
  });
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
  {:else if billings.length === 0}
    <div class="p-4 text-center py-8" style="color: var(--color-text-secondary)">No billings found</div>
  {:else}
    <div class="p-4 space-y-4">
      <!-- Overdue Section -->
      {#if groupedBillings.overdue.length > 0}
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--color-status-alert)">
            ⚠ Overdue ({groupedBillings.overdue.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.overdue as billing (billing.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => toggleBilling(billing.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleBilling(billing.id)}
                class="card-base w-full p-4 text-left transition cursor-pointer"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold" style="color: var(--color-text-primary)">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold" style="color: var(--color-accent)">{billing.current_reading_amount}</span>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-xs" style="color: var(--color-text-tertiary)">Created: {formatDate(billing.created_at)}</p>
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('overdue')}>{getStatusLabel('overdue')}</span>
                </div>

                {#if expandedBillings.has(billing.id)}
                  <div class="mt-3 pt-3 border-t space-y-2" style="border-color: var(--color-border)">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        markAsPaid(billing.id);
                      }}
                      class="w-full px-3 py-2 rounded text-sm font-semibold"
                      style="background-color: var(--color-status-good); color: white"
                    >
                      Mark as Paid
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Pending Section -->
      {#if groupedBillings.pending.length > 0}
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--color-text-secondary)">
            ⏳ Pending ({groupedBillings.pending.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.pending as billing (billing.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => toggleBilling(billing.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleBilling(billing.id)}
                class="card-base w-full p-4 text-left transition cursor-pointer"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold" style="color: var(--color-text-primary)">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold" style="color: var(--color-accent)">{billing.current_reading_amount}</span>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-xs" style="color: var(--color-text-tertiary)">Created: {formatDate(billing.created_at)}</p>
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('pending')}>{getStatusLabel('pending')}</span>
                </div>

                {#if expandedBillings.has(billing.id)}
                  <div class="mt-3 pt-3 border-t space-y-2" style="border-color: var(--color-border)">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        markAsPaid(billing.id);
                      }}
                      class="w-full px-3 py-2 rounded text-sm font-semibold"
                      style="background-color: var(--color-status-good); color: white"
                    >
                      Mark as Paid
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Paid Section -->
      {#if groupedBillings.paid.length > 0}
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--color-status-good)">
            ✓ Paid ({groupedBillings.paid.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.paid as billing (billing.id)}
              <div
                role="button"
                tabindex="0"
                onclick={() => toggleBilling(billing.id)}
                onkeydown={(e) => e.key === 'Enter' && toggleBilling(billing.id)}
                class="card-base w-full p-4 text-left transition opacity-75 cursor-pointer"
              >
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold" style="color: var(--color-text-primary)">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold" style="color: var(--color-accent)">{billing.current_reading_amount}</span>
                </div>
                <div class="flex items-center justify-between mt-1">
                  <p class="text-xs" style="color: var(--color-text-tertiary)">Paid: {formatDate(billing.updated_at)}</p>
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full border" style={getStatusColor('paid')}>{getStatusLabel('paid')}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <BottomNav active="billings" />
</div>
