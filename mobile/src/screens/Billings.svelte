<script lang="ts">
  import { listBillings, updateBillingStatus, type Billing } from '../lib/api/billings';
  import { getProperty } from '../lib/api/properties';
  import { getProperty as getPropertyForBilling } from '../lib/api/properties';

  let billings = $state<Billing[]>([]);
  let propertyNames = $state<Record<string, string>>({});
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let expandedBillings = $state<Set<string>>(new Set());

  $effect.pre(async () => {
    try {
      const res = await listBillings();
      billings = res.data || [];

      // Fetch property names
      const names: Record<string, string> = {};
      const propertyIds = new Set(billings.map(b => b.property_id));

      for (const propId of propertyIds) {
        try {
          const prop = await getPropertyForBilling(propId);
          names[propId] = prop.room_name;
        } catch (e) {
          names[propId] = `Property ${propId.slice(0, 6)}`;
        }
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
        return 'bg-green-100 text-green-800 border-green-300';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // Group billings by status
  $derived.by(() => {
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

<div class="min-h-screen bg-gray-50 pb-20">
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-xl font-bold">Billings</h1>
  </div>

  {#if error}
    <div class="bg-red-50 border border-red-200 text-red-700 p-4 m-4 rounded">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="p-4 text-center text-gray-500 py-8">Loading...</div>
  {:else if billings.length === 0}
    <div class="p-4 text-center text-gray-500 py-8">No billings found</div>
  {:else}
    <div class="p-4 space-y-4">
      <!-- Overdue Section -->
      {#if groupedBillings.overdue.length > 0}
        <div>
          <h3 class="text-sm font-semibold text-red-700 mb-2">
            ⚠ Overdue ({groupedBillings.overdue.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.overdue as billing (billing.id)}
              <button
                onclick={() => toggleBilling(billing.id)}
                class="w-full bg-white p-4 rounded-lg border-2 border-red-200 text-left hover:border-red-400 transition"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold text-gray-900">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold text-red-600">{billing.current_reading_amount}</span>
                </div>
                <p class="text-xs text-gray-500">Created: {formatDate(billing.created_at)}</p>

                {#if expandedBillings.has(billing.id)}
                  <div class="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        markAsPaid(billing.id);
                      }}
                      class="w-full px-3 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                    >
                      Mark as Paid
                    </button>
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Pending Section -->
      {#if groupedBillings.pending.length > 0}
        <div>
          <h3 class="text-sm font-semibold text-yellow-700 mb-2">
            ⏳ Pending ({groupedBillings.pending.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.pending as billing (billing.id)}
              <button
                onclick={() => toggleBilling(billing.id)}
                class="w-full bg-white p-4 rounded-lg border border-yellow-200 text-left hover:border-yellow-400 transition"
              >
                <div class="flex justify-between items-start mb-2">
                  <h4 class="font-semibold text-gray-900">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold text-yellow-600">{billing.current_reading_amount}</span>
                </div>
                <p class="text-xs text-gray-500">Created: {formatDate(billing.created_at)}</p>

                {#if expandedBillings.has(billing.id)}
                  <div class="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        markAsPaid(billing.id);
                      }}
                      class="w-full px-3 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                    >
                      Mark as Paid
                    </button>
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Paid Section -->
      {#if groupedBillings.paid.length > 0}
        <div>
          <h3 class="text-sm font-semibold text-green-700 mb-2">
            ✓ Paid ({groupedBillings.paid.length})
          </h3>
          <div class="space-y-2">
            {#each groupedBillings.paid as billing (billing.id)}
              <button
                onclick={() => toggleBilling(billing.id)}
                class="w-full bg-white p-4 rounded-lg border border-green-200 text-left hover:border-green-400 transition opacity-75"
              >
                <div class="flex justify-between items-start">
                  <h4 class="font-semibold text-gray-900">
                    {propertyNames[billing.property_id] || 'Loading...'}
                  </h4>
                  <span class="text-lg font-bold text-green-600">{billing.current_reading_amount}</span>
                </div>
                <p class="text-xs text-gray-500">Paid: {formatDate(billing.updated_at)}</p>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-blue-600 font-semibold">💰 Billings</a>
  </div>
</div>
