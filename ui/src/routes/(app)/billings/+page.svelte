<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillingCycles, createBillingCycle } from '$lib/api/billing-cycles';
  import { getBillings, createBilling, updateBilling, softDeleteBilling } from '$lib/api/billings';
  import { getReadings } from '$lib/api/readings';
  import { getProperties } from '$lib/api/properties';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { authStore, type AuthState } from '$lib/stores/auth.svelte';
  import type { BillingCycle } from '$lib/types/billing-cycle.types';
  import type { Billing, CreateBillingRequest, UpdateBillingRequest } from '$lib/types/billing.types';
  import type { Reading } from '$lib/types/reading.types';
  import type { Property } from '$lib/types/property.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { PaginatedResult } from '$lib/types/api.types';
  import { formatDate, formatCurrency } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import StatusPill from '$lib/components/shared/StatusPill.svelte';

  let cycles = $state<PaginatedResult<BillingCycle>>({
    data: [],
    nextCursor: null,
    hasMore: false
  });
  let billings = $state<Map<string, Billing[]>>(new Map());
  let allBillings = $state<Billing[]>([]);
  let readings = $state<Reading[]>([]);
  let properties = $state<Property[]>([]);
  let meterGroups = $state<MeterGroup[]>([]);
  let isLoading = $state(false);
  let error = $state('');
  let expandedCycleId = $state<string | null>(null);

  let createFormOpen = $state(false);
  let editModalOpen = $state(false);
  let editingBilling = $state<Billing | null>(null);

  // Billing cycle form state
  let cycleFormOpen = $state(false);
  let cycleFormMeterGroup = $state('');
  let cycleFormStartDate = $state('');
  let cycleFormEndDate = $state('');
  let cycleFormRate = $state(0);
  let cycleFormDiscoveredBillings = $state<DiscoveredBilling[]>([]);
  let cycleFormTotalConsumption = $state(0);
  let cycleFormConsumptionEdited = $state(false);
  let isCreatingCycle = $state(false);

  interface DiscoveredBilling {
    billingId: string;
    propertyName: string;
    consumption: number;
    amount: number;
  }

  let createFormData = $state<CreateBillingRequest>({
    property_id: '',
    previous_reading_id: '',
    current_reading_id: ''
  });

  let editFormData = $state<UpdateBillingRequest>({
    property_id: '',
    previous_reading_id: '',
    current_reading_id: ''
  });

  let editingBillingId = $state<string | null>(null);
  let deletingBillingId = $state<string | null>(null);
  let markingAsPaidId = $state<string | null>(null);

  let auth = $state<AuthState>({ isAuthenticated: false, user: null, isLoading: false, error: null });

  $effect(() => {
    return authStore.subscribe(value => { auth = value; });
  });

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const [cyclesResult, billingsResult, readingsResult, propertiesResult, meterGroupsResult] = await Promise.all([
        getBillingCycles({ limit: 100 }),
        getBillings({ limit: 100 }),
        getReadings({ limit: 100 }),
        getProperties({ limit: 100 }),
        getMeterGroups({ limit: 100 })
      ]);
      cycles = cyclesResult;
      allBillings = billingsResult.data;
      readings = readingsResult.data;
      properties = propertiesResult.data;
      meterGroups = meterGroupsResult.data;
      billings = new Map();
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

    const cycle = cycles.data.find(c => c.id === cycleId);
    if (cycle) {
      const cycleBillings = allBillings.filter(b => b.id in cycle.billing_ids);
      billings.set(cycleId, cycleBillings);
      billings = billings;
    }
  }

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    try {
      await createBilling(createFormData);
      createFormOpen = false;
      createFormData = {
        property_id: '',
        previous_reading_id: '',
        current_reading_id: ''
      };
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create billing';
    }
  }

  function openEditModal(billing: Billing) {
    editingBilling = billing;
    editFormData = {
      property_id: billing.property_id,
      previous_reading_id: billing.previous_reading_id,
      current_reading_id: billing.current_reading_id
    };
    editModalOpen = true;
  }

  async function handleUpdate() {
    if (!editingBilling) return;
    editingBillingId = editingBilling.id;
    try {
      await updateBilling(editingBilling.id, editFormData);
      editModalOpen = false;
      editingBilling = null;
      await loadData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update billing';
    } finally {
      editingBillingId = null;
    }
  }

  async function handleSoftDelete(id: string) {
    if (confirm('Archive this billing? It can be restored from the archive.')) {
      deletingBillingId = id;
      try {
        await softDeleteBilling(id);
        await loadData();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive billing';
      } finally {
        deletingBillingId = null;
      }
    }
  }

  async function handleMarkAsPaid(id: string) {
    markingAsPaidId = id;
    try {
      const paidAt = new Date().toISOString();
      await updateBilling(id, { payment_status: 'paid', paid_at: paidAt });

      // Update local state
      const billing = allBillings.find(b => b.id === id);
      if (billing) {
        billing.payment_status = 'paid';
        billing.paid_at = paidAt;
        allBillings = allBillings;

        // Update cache
        for (const [key, bills] of billings.entries()) {
          const idx = bills.findIndex(b => b.id === id);
          if (idx >= 0) {
            bills[idx] = billing;
          }
        }
        billings = billings;
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
    const endMonth = endDate.getUTCMonth();
    const endYear = endDate.getUTCFullYear();

    return allBillings
      .filter(billing => {
        const currReading = readings.find(r => r.id === billing.current_reading_id);
        if (!currReading) return false;
        if (currReading.meter_group_id !== cycleFormMeterGroup) return false;
        const readingDate = toDate(currReading.reading_date);
        return readingDate.getUTCMonth() === endMonth && readingDate.getUTCFullYear() === endYear;
      })
      .map(billing => {
        const currReading = readings.find(r => r.id === billing.current_reading_id)!;
        const prevReading = readings.find(r => r.id === billing.previous_reading_id);
        const property = properties.find(p => p.id === billing.property_id);

        const prevAmount = prevReading?.reading_amount ?? 0;
        const currAmount = currReading.reading_amount;
        // Cross-version pairs cannot be reduced to a simple diff in the UI (meter was reset between
        // versions). The billing cycle server validation handles the true value; here we fall back
        // to the naive diff so the preview is at least a reasonable estimate. The confirmed
        // consumption value stored in cycle.billing_ids is always authoritative after cycle creation.
        const consumption = currAmount - prevAmount;

        return {
          billingId: billing.id,
          propertyName: property?.room_name ?? billing.property_id.slice(0, 8),
          consumption,
          amount: consumption * cycleFormRate,
        };
      });
  }

  function handleDiscoverBillings() {
    error = '';
    cycleFormDiscoveredBillings = discoverBillings();
    const total = cycleFormDiscoveredBillings.reduce((sum, d) => sum + d.consumption, 0);
    cycleFormTotalConsumption = total;
    cycleFormConsumptionEdited = false;
  }

  function resetCycleForm() {
    cycleFormMeterGroup = '';
    cycleFormStartDate = '';
    cycleFormEndDate = '';
    cycleFormRate = 0;
    cycleFormDiscoveredBillings = [];
    cycleFormTotalConsumption = 0;
    cycleFormConsumptionEdited = false;
  }

  async function handleCreateCycle() {
    const discovered = cycleFormDiscoveredBillings.length > 0
      ? cycleFormDiscoveredBillings
      : discoverBillings();
    if (discovered.length === 0) {
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

      const totalConsumption = cycleFormConsumptionEdited
        ? cycleFormTotalConsumption
        : discovered.reduce((sum, d) => sum + d.consumption, 0);

      const startTs = {
        _seconds: Math.floor(new Date(cycleFormStartDate).getTime() / 1000),
        _nanoseconds: 0,
      };
      const endTs = {
        _seconds: Math.floor(new Date(cycleFormEndDate).getTime() / 1000),
        _nanoseconds: 0,
      };

      await createBillingCycle({
        billing_ids,
        billing_rate: cycleFormRate,
        billing_consumption: totalConsumption,
        billing_start_date: startTs,
        billing_end_date: endTs,
      });

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

  function escHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function printReceipts(cycle: BillingCycle) {
    const cycleBillings = billings.get(cycle.id) || [];

    const receiptHTML = cycleBillings.map(billing => {
      const property = properties.find(p => p.id === billing.property_id);
      const consumption = cycle.billing_ids[billing.id] ?? 0;
      const amount = consumption * cycle.billing_rate;
      const roomName = escHtml(property?.room_name || 'N/A');
      const qrUrl = auth?.user?.qr_payment_url ? escHtml(auth.user.qr_payment_url) : null;
      const statusColor = billing.payment_status === 'paid' ? '#2c6b3a' : '#8b5a3c';
      const statusLabel = billing.payment_status === 'paid' ? 'PAID' : 'PENDING';
      const paidOnLine = billing.paid_at
        ? `<p style="margin: 0; font-size: 12px; color: #666;">Paid on: ${escHtml(new Date(billing.paid_at).toLocaleDateString())}</p>`
        : '';
      const qrBlock = qrUrl
        ? `<div style="text-align: center; margin: 40px 0;">
              <p style="margin-bottom: 15px;"><strong>Scan to Pay:</strong></p>
              <img src="${qrUrl}" alt="Payment QR Code" style="max-width: 200px; height: auto; border: 1px solid #ddd; padding: 10px; background: white;" />
            </div>`
        : '';

      return `
        <div style="page-break-after: always; padding: 40px; font-family: 'Courier New', monospace; background: white; min-height: 100vh;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">UTILITY PAYMENT RECEIPT</h1>
          </div>

          <div style="margin-bottom: 30px; line-height: 1.8;">
            <p><strong>Property:</strong> ${roomName}</p>
            <p><strong>Billing Period:</strong> ${escHtml(formatDate(toDate(cycle.billing_start_date)))} to ${escHtml(formatDate(toDate(cycle.billing_end_date)))}</p>
            <p><strong>Consumption:</strong> ${escHtml(consumption.toLocaleString())} kWh</p>
            <p><strong>Rate:</strong> ₱${escHtml(cycle.billing_rate.toFixed(2))}/kWh</p>
          </div>

          <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 20px 0; margin: 30px 0; font-size: 20px; font-weight: bold;">
            <p style="margin: 0; text-align: right;">Amount Due: ${escHtml(formatCurrency(amount))}</p>
          </div>

          <div style="margin-bottom: 30px; padding: 20px; background: #f5f5f5; border-radius: 4px;">
            <p style="margin: 0; margin-bottom: 10px;"><strong>Status: <span style="color: ${statusColor};">${statusLabel}</span></strong></p>
            ${paidOnLine}
          </div>

          ${qrBlock}

          <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
            <p style="margin: 5px 0;">Thank you for your payment!</p>
            <p style="margin: 5px 0; margin-top: 15px;">For inquiries, please contact your property management.</p>
          </div>
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Receipts</title>
        </head>
        <body style="margin: 0; padding: 0; background: #f9f9f9;">
          ${receiptHTML}
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
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
        href="/billings/archive"
        class="rounded px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
      >
        Archive
      </a>
      <button
        onclick={() => (cycleFormOpen = !cycleFormOpen)}
        class="rounded px-4 py-2 text-white font-medium"
        style="background-color: var(--color-accent)"
      >
        + New
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
      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="cycle-meter-group" class="block text-sm font-medium text-gray-700">Meter Group</label>
          <select
            id="cycle-meter-group"
            bind:value={cycleFormMeterGroup}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a meter group</option>
            {#each meterGroups as mg (mg.id)}
              <option value={mg.id}>{mg.meter_name} ({mg.utility_type})</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="cycle-rate" class="block text-sm font-medium text-gray-700">Billing Rate (₱/kWh)</label>
          <input
            id="cycle-rate"
            type="number"
            step="0.01"
            min="0"
            bind:value={cycleFormRate}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label for="cycle-start-date" class="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            id="cycle-start-date"
            type="date"
            bind:value={cycleFormStartDate}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label for="cycle-end-date" class="block text-sm font-medium text-gray-700">End Date</label>
          <input
            id="cycle-end-date"
            type="date"
            bind:value={cycleFormEndDate}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      <div class="mt-4">
        <button
          type="button"
          onclick={handleDiscoverBillings}
          disabled={!cycleFormMeterGroup || !cycleFormEndDate}
          class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          Discover Billings
        </button>
      </div>

      {#if cycleFormDiscoveredBillings.length > 0}
        <div class="mt-4 overflow-x-auto rounded border border-gray-200">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left font-semibold text-gray-700">Property</th>
                <th class="px-4 py-2 text-right font-semibold text-gray-700">Consumption</th>
                <th class="px-4 py-2 text-right font-semibold text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {#each cycleFormDiscoveredBillings as d (d.billingId)}
                <tr class="border-b border-gray-100">
                  <td class="px-4 py-2 text-gray-900">{d.propertyName}</td>
                  <td class="px-4 py-2 text-right font-mono text-gray-700">{d.consumption.toLocaleString()} kWh</td>
                  <td class="px-4 py-2 text-right font-mono text-gray-900">{formatCurrency(d.amount)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label for="cycle-total-consumption" class="block text-sm font-medium text-gray-700">
              Total Consumption (kWh)
            </label>
            <input
              id="cycle-total-consumption"
              type="number"
              step="0.01"
              min="0"
              bind:value={cycleFormTotalConsumption}
              oninput={() => (cycleFormConsumptionEdited = true)}
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 font-mono"
            />
            <p class="mt-1 text-xs text-gray-500">
              Auto-calculated from discovered billings; you can override.
            </p>
          </div>
          <div>
            <div class="block text-sm font-medium text-gray-700">Total Amount</div>
            <div class="mt-1 px-3 py-2 font-mono font-semibold text-gray-900">
              {formatCurrency(cycleFormTotalConsumption * cycleFormRate)}
            </div>
          </div>
        </div>
      {:else if cycleFormMeterGroup && cycleFormEndDate}
        <p class="mt-4 text-sm text-gray-500">
          Click "Discover Billings" to find billings matching this meter group and end month.
        </p>
      {/if}

      <div class="mt-6 flex space-x-2">
        <button
          type="button"
          onclick={handleCreateCycle}
          disabled={isCreatingCycle || cycleFormDiscoveredBillings.length === 0}
          class="rounded px-4 py-2 text-white font-medium disabled:opacity-50"
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
          class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  <details class="rounded-lg border border-gray-200 bg-white" bind:open={createFormOpen}>
    <summary class="px-6 py-4 cursor-pointer font-medium text-sm text-gray-500">
      Manual Billing (Advanced)
    </summary>
    <div class="px-6 pb-6">
      <form onsubmit={handleCreate} class="space-y-4">
        <div>
          <label for="property-id" class="block text-sm font-medium text-gray-700">Property</label>
          <select
            id="property-id"
            bind:value={createFormData.property_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a property</option>
            {#each properties as prop (prop.id)}
              <option value={prop.id}>{prop.room_name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="previous-reading" class="block text-sm font-medium text-gray-700">Previous Reading</label>
          <select
            id="previous-reading"
            bind:value={createFormData.previous_reading_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select previous reading</option>
            {#each readings as reading (reading.id)}
              <option value={reading.id}>
                {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
              </option>
            {/each}
          </select>
        </div>
        <div>
          <label for="current-reading" class="block text-sm font-medium text-gray-700">Current Reading</label>
          <select
            id="current-reading"
            bind:value={createFormData.current_reading_id}
            required
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select current reading</option>
            {#each readings as reading (reading.id)}
              <option value={reading.id}>
                {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
              </option>
            {/each}
          </select>
        </div>
        <div class="flex space-x-2">
          <button
            type="submit"
            class="rounded px-4 py-2 text-white font-medium"
            style="background-color: var(--color-accent)"
          >
            Create
          </button>
          <button
            type="button"
            onclick={() => (createFormOpen = false)}
            class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </details>

  <div class="space-y-4">
    {#if cycles.data.length === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <EmptyState title="No billing cycles" message="Create cycles to manage billing periods" />
      </div>
    {:else}
      {#each cycles.data as cycle (cycle.id)}
        <div class="rounded-lg border border-gray-200 bg-white">
          <!-- Cycle Header Row -->
          <div class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
            <button
              onclick={() => toggleCycleExpand(cycle.id)}
              class="flex-1 text-left"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <div
                      class="text-gray-400 transition {expandedCycleId === cycle.id ? 'rotate-90' : ''}"
                    >
                      ▶
                    </div>
                    <div>
                      <div class="font-medium text-gray-900">
                        {formatDate(toDate(cycle.billing_start_date))} –
                        {formatDate(toDate(cycle.billing_end_date))}
                      </div>
                      <div class="text-sm text-gray-500">
                        {Object.keys(cycle.billing_ids).length} billing
                        {Object.keys(cycle.billing_ids).length === 1 ? 'record' : 'records'}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="ml-6 grid grid-cols-3 gap-8 text-right">
                  <div>
                    <div class="text-xs font-medium text-gray-600">Consumption</div>
                    <div class="font-mono font-semibold text-gray-900">
                      {cycle.billing_consumption.toLocaleString()} kWh
                    </div>
                  </div>
                  <div>
                    <div class="text-xs font-medium text-gray-600">Rate</div>
                    <div class="font-mono font-semibold text-gray-900">
                      ₱{cycle.billing_rate.toFixed(2)}/kWh
                    </div>
                  </div>
                  <div>
                    <div class="text-xs font-medium text-gray-600">Total Amount</div>
                    <div class="font-mono font-semibold text-gray-900">
                      {formatCurrency(cycle.billing_consumption * cycle.billing_rate)}
                    </div>
                  </div>
                </div>
              </div>
            </button>

            {#if expandedCycleId === cycle.id && (billings.get(cycle.id)?.length ?? 0) > 0}
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  printReceipts(cycle);
                }}
                class="ml-4 px-4 py-2 rounded text-sm font-medium text-white"
                style="background-color: var(--color-accent)"
              >
                Print Receipts
              </button>
            {/if}
          </div>

          <!-- Expanded Billings Table -->
          {#if expandedCycleId === cycle.id}
            <div class="border-t border-gray-200 bg-gray-50">
              {#if billings.get(cycle.id)?.length === 0}
                <div class="px-6 py-4">
                  <EmptyState title="No billings" message="No billings in this cycle yet" />
                </div>
              {:else if billings.has(cycle.id)}
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Previous Reading</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Current Reading</th>
                        <th class="px-6 py-3 text-right font-semibold text-gray-700">
                          Consumption
                        </th>
                        <th class="px-6 py-3 text-right font-semibold text-gray-700">Amount</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                        <th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each billings.get(cycle.id) || [] as billing (billing.id)}
                        <tr class="border-b border-gray-100 hover:bg-white">
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.property_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.previous_reading_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 font-mono text-xs text-gray-600">
                            {billing.current_reading_id.slice(0, 8)}...
                          </td>
                          <td class="px-6 py-3 text-right font-mono text-gray-700">
                            {(cycle.billing_ids[billing.id] ?? 0).toLocaleString()} kWh
                          </td>
                          <td class="px-6 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(
                              (cycle.billing_ids[billing.id] ?? 0) * cycle.billing_rate
                            )}
                          </td>
                          <td class="px-6 py-3">
                            <StatusPill status={billing.payment_status} />
                          </td>
                          <td class="px-6 py-3">
                            <div class="flex gap-2 flex-wrap">
                              {#if billing.payment_status === 'pending'}
                                <button
                                  onclick={() => handleMarkAsPaid(billing.id)}
                                  disabled={isLoading || markingAsPaidId === billing.id}
                                  class="px-3 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium text-sm disabled:opacity-50"
                                >
                                  {markingAsPaidId === billing.id ? 'Marking...' : 'Mark Paid'}
                                </button>
                              {/if}
                              <button
                                onclick={() => openEditModal(billing)}
                                disabled={isLoading || editingBillingId === billing.id}
                                class="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-sm disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                onclick={() => handleSoftDelete(billing.id)}
                                disabled={isLoading || deletingBillingId === billing.id}
                                class="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium text-sm disabled:opacity-50"
                              >
                                {deletingBillingId === billing.id ? 'Archiving...' : 'Archive'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <div class="px-6 py-4 text-center text-sm text-gray-500">
                  Loading billings...
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Edit Modal -->
<EditModal
  bind:isOpen={editModalOpen}
  title="Edit Billing"
  isLoading={editingBillingId === editingBilling?.id}
  onClose={() => {
    editModalOpen = false;
    editingBilling = null;
  }}
  onSubmit={handleUpdate}
>
  <div class="space-y-4">
    <div>
      <label for="edit-property" class="block text-sm font-medium text-gray-700">Property</label>
      <select
        id="edit-property"
        bind:value={editFormData.property_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each properties as prop (prop.id)}
          <option value={prop.id}>{prop.room_name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-previous-reading" class="block text-sm font-medium text-gray-700">Previous Reading</label>
      <select
        id="edit-previous-reading"
        bind:value={editFormData.previous_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each readings as reading (reading.id)}
          <option value={reading.id}>
            {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-current-reading" class="block text-sm font-medium text-gray-700">Current Reading</label>
      <select
        id="edit-current-reading"
        bind:value={editFormData.current_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each readings as reading (reading.id)}
          <option value={reading.id}>
            {reading.reading_amount.toLocaleString()} kWh - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
  </div>
</EditModal>
