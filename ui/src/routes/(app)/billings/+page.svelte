<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillingCycles, createBillingCycle, ocrBillingCycle } from '$lib/api/billing-cycles';
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
  import { formatDate, formatCurrency, formatReading, getReadingUnit } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import EditModal from '$lib/components/shared/EditModal.svelte';
  import StatusPill from '$lib/components/shared/StatusPill.svelte';
  import { createCrudStore } from '$lib/stores/crud.svelte';
  import { CheckCircle2, Pencil, Archive, Printer, Plus, ChevronRight } from 'lucide-svelte';

  const crud = createCrudStore<Billing>();

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

  // Billing cycle form state
  let cycleFormOpen = $state(false);
  let cycleFormTab = $state<'manual' | 'auto'>('auto');
  let cycleFormMeterGroup = $state('');
  let cycleFormStartDate = $state('');
  let cycleFormEndDate = $state('');
  let cycleFormDueDate = $state('');
  let cycleFormRate = $state(0);
  let cycleFormDiscoveredBillings = $state<DiscoveredBilling[]>([]);
  let cycleFormTotalConsumption = $state(0);
  let cycleFormConsumptionEdited = $state(false);
  let isCreatingCycle = $state(false);

  // OCR state
  let billPhotoUrl = $state<string | null>(null);
  let isBillOcrLoading = $state(false);
  let billOcrRawAmount = $state<number | null>(null);

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

  let isUpdating = $state(false);
  let isCreating = $state(false);
  let markingAsPaidId = $state<string | null>(null);

  let auth = $state<AuthState>({ isAuthenticated: false, user: null, isLoading: false, error: null });

  // Filter readings for manual billing form based on selected property's meter groups
  const manualBillingReadings = $derived.by(() => {
    if (!readings || !createFormData.property_id) return readings || [];
    const selectedProp = properties.find(p => p.id === createFormData.property_id);
    if (!selectedProp) return readings;

    const meterGroupIds = [selectedProp.meter_groups.electricity, selectedProp.meter_groups.water].filter(Boolean);
    return readings.filter(r => meterGroupIds.includes(r.meter_group_id) && r.property_id === createFormData.property_id);
  });

  // Filter readings for edit modal based on selected property's meter groups
  const editModalReadings = $derived.by(() => {
    if (!readings || !editData.property_id) return readings || [];
    const selectedProp = properties.find(p => p.id === editData.property_id);
    if (!selectedProp) return readings;

    const meterGroupIds = [selectedProp.meter_groups.electricity, selectedProp.meter_groups.water].filter(Boolean);
    return readings.filter(r => meterGroupIds.includes(r.meter_group_id) && r.property_id === editData.property_id);
  });

  // Get utility type for cycle form meter group
  const cycleFormUtilityType = $derived.by(() => {
    const selectedMeterGroup = meterGroups.find(m => m.id === cycleFormMeterGroup);
    return selectedMeterGroup?.utility_type || 'electricity';
  });

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
    isCreating = true;
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
    } finally {
      isCreating = false;
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
    cycleFormDueDate = '';
    cycleFormRate = 0;
    cycleFormDiscoveredBillings = [];
    cycleFormTotalConsumption = 0;
    cycleFormConsumptionEdited = false;
    billPhotoUrl = null;
    isBillOcrLoading = false;
    billOcrRawAmount = null;
  }

  function autoCalculateCycleDates() {
    if (!cycleFormMeterGroup) return;

    // Find the last billing cycle for this meter group
    const meterGroupCycles = cycles.data
      .filter(c => {
        const cycleBillingIds = Object.keys(c.billing_ids);
        const cycleBillings = allBillings.filter(b => cycleBillingIds.includes(b.id));
        if (cycleBillings.length === 0) return false;
        const firstBilling = cycleBillings[0];
        const firstReading = readings.find(r => r.id === firstBilling.current_reading_id);
        return firstReading?.meter_group_id === cycleFormMeterGroup;
      })
      .sort((a, b) => new Date(toDate(b.billing_end_date)).getTime() - new Date(toDate(a.billing_end_date)).getTime());

    if (meterGroupCycles.length === 0) {
      // No previous cycle, use current month
      const now = new Date();
      const startDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const endDate = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
      const dueDate = new Date(endDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + 13);

      cycleFormStartDate = startDate.toISOString().split('T')[0];
      cycleFormEndDate = endDate.toISOString().split('T')[0];
      cycleFormDueDate = dueDate.toISOString().split('T')[0];
    } else {
      // Calculate next cycle based on last cycle
      const lastCycle = meterGroupCycles[0];
      const lastEndDate = toDate(lastCycle.billing_end_date);
      const nextStartDate = new Date(lastEndDate);
      nextStartDate.setUTCDate(nextStartDate.getUTCDate() + 1);

      const nextEndDate = new Date(nextStartDate);
      nextEndDate.setUTCMonth(nextEndDate.getUTCMonth() + 1);
      nextEndDate.setUTCDate(nextStartDate.getUTCDate() - 1);

      const nextDueDate = new Date(nextEndDate);
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
      billPhotoUrl = dataUrl;  // Set here, after success
      cycleFormStartDate = result.billing_start_date;
      cycleFormEndDate = result.billing_end_date;
      cycleFormRate = result.billing_rate;
      cycleFormTotalConsumption = result.billing_consumption;
      cycleFormConsumptionEdited = true;
      billOcrRawAmount = result.raw_amount;
    } catch (err) {
      billPhotoUrl = null;  // Clear on error
      error = err instanceof Error ? err.message : 'Failed to extract billing data from photo';
    } finally {
      isBillOcrLoading = false;
    }
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

      const createPayload: any = {
        meter_group_id: cycleFormMeterGroup,
        billing_ids,
        billing_rate: cycleFormRate,
        billing_consumption: totalConsumption,
        billing_start_date: startTs,
        billing_end_date: endTs,
      };

      if (cycleFormDueDate) {
        createPayload.overdue_date = {
          _seconds: Math.floor(new Date(cycleFormDueDate).getTime() / 1000),
          _nanoseconds: 0,
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

  function escHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCycleUtilityType(cycle: BillingCycle): string {
    const cycleBillingIds = Object.keys(cycle.billing_ids);
    const cycleBillings = allBillings.filter(b => cycleBillingIds.includes(b.id));
    if (cycleBillings.length > 0) {
      const firstBilling = cycleBillings[0];
      const firstReading = readings.find(r => r.id === firstBilling.current_reading_id);
      if (firstReading) {
        const meterGroup = meterGroups.find(m => m.id === firstReading.meter_group_id);
        return meterGroup?.utility_type || 'electricity';
      }
    }
    return 'electricity';
  }

  function getCycleMeterGroupId(cycle: BillingCycle): string | null {
    const cycleBillingIds = Object.keys(cycle.billing_ids);
    const cycleBillings = allBillings.filter(b => cycleBillingIds.includes(b.id));
    if (cycleBillings.length > 0) {
      const firstBilling = cycleBillings[0];
      const firstReading = readings.find(r => r.id === firstBilling.current_reading_id);
      if (firstReading) {
        return firstReading.meter_group_id;
      }
    }
    return null;
  }

  function getCycleMeterGroupName(cycle: BillingCycle): string {
    const meterGroupId = getCycleMeterGroupId(cycle);
    if (meterGroupId) {
      const meterGroup = meterGroups.find(m => m.id === meterGroupId);
      return meterGroup?.meter_name || 'Unknown';
    }
    return 'Unknown';
  }

  function getCyclePaidAmount(cycle: BillingCycle): number {
    const cycleBillingIds = Object.keys(cycle.billing_ids);
    const cycleBillings = allBillings.filter(b => cycleBillingIds.includes(b.id) && b.payment_status === 'paid');
    return cycleBillings.reduce((sum, billing) => {
      const consumption = cycle.billing_ids[billing.id] ?? 0;
      return sum + (consumption * cycle.billing_rate);
    }, 0);
  }

  const groupedCycles = $derived.by(() => {
    const groups = new Map<string, BillingCycle[]>();
    for (const cycle of cycles.data) {
      const meterGroupId = getCycleMeterGroupId(cycle);
      const key = meterGroupId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(cycle);
    }
    return Array.from(groups.entries()).map(([id, cyclesInGroup]) => ({
      meterGroupId: id === 'unknown' ? null : id,
      meterGroupName: id === 'unknown' ? 'Unknown' : meterGroups.find(m => m.id === id)?.meter_name || 'Unknown',
      cycles: cyclesInGroup
    }));
  });

  function printReceipts(cycle: BillingCycle) {
    const cycleBillings = billings.get(cycle.id) || [];
    // Determine utility type from first billing's reading
    let utilityType = 'electricity';
    if (cycleBillings.length > 0) {
      const firstBilling = cycleBillings[0];
      const firstReading = readings.find(r => r.id === firstBilling.current_reading_id);
      if (firstReading) {
        const meterGroup = meterGroups.find(m => m.id === firstReading.meter_group_id);
        utilityType = meterGroup?.utility_type || 'electricity';
      }
    }

    const unit = getReadingUnit(utilityType);

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
            ${cycle.overdue_date ? `<p><strong>Due Date:</strong> ${escHtml(formatDate(toDate(cycle.overdue_date)))}</p>` : ''}
            <p><strong>Consumption:</strong> ${escHtml(consumption.toLocaleString())} ${unit}</p>
            <p><strong>Rate:</strong> ₱${escHtml(cycle.billing_rate.toFixed(2))}/${unit}</p>
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

    const htmlContent = `
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
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (printWindow) {
      setTimeout(() => {
        printWindow.print();
      }, 500);
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
        class="p-2 rounded hover:bg-gray-100 text-gray-700"
        title="View archive"
        aria-label="View billings archive"
      >
        <Archive size={20} />
      </a>
      <button
        onclick={() => (cycleFormOpen = !cycleFormOpen)}
        class="p-2 rounded text-white"
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

      <!-- Tabs -->
      <div class="mt-4 flex border-b border-gray-200">
        <button
          onclick={() => { cycleFormTab = 'manual'; resetCycleForm(); cycleFormTab = 'manual'; }}
          class="px-4 py-2 font-medium text-sm border-b-2"
          class:border-blue-500={cycleFormTab === 'manual'}
          class:border-transparent={cycleFormTab !== 'manual'}
          class:text-blue-600={cycleFormTab === 'manual'}
          class:text-gray-600={cycleFormTab !== 'manual'}
        >
          Manual
        </button>
        <button
          onclick={() => { cycleFormTab = 'auto'; resetCycleForm(); autoCalculateCycleDates(); cycleFormTab = 'auto'; }}
          class="px-4 py-2 font-medium text-sm border-b-2"
          class:border-blue-500={cycleFormTab === 'auto'}
          class:border-transparent={cycleFormTab !== 'auto'}
          class:text-blue-600={cycleFormTab === 'auto'}
          class:text-gray-600={cycleFormTab !== 'auto'}
        >
          Automated
        </button>
      </div>

      <!-- Bill Photo OCR -->
      <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
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
            <span class="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {isBillOcrLoading ? 'Extracting...' : 'Upload Bill Photo'}
            </span>
          </label>
          {#if billPhotoUrl && !isBillOcrLoading}
            <span class="text-xs text-green-600">✓ Data extracted</span>
          {/if}
          {#if billOcrRawAmount !== null}
            <span class="text-xs text-gray-500">Bill total: ₱{billOcrRawAmount.toLocaleString()}</span>
          {/if}
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label for="cycle-meter-group" class="block text-sm font-medium text-gray-700">Meter Group</label>
          <select
            id="cycle-meter-group"
            bind:value={cycleFormMeterGroup}
            onchange={() => {
              if (cycleFormTab === 'auto') autoCalculateCycleDates();
              if (cycleFormEndDate) handleDiscoverBillings();
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
          <label for="cycle-rate" class="block text-sm font-medium text-gray-700">Billing Rate (₱/{getReadingUnit(cycleFormUtilityType)})</label>
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
        <div>
          <label for="cycle-due-date" class="block text-sm font-medium text-gray-700">Due Date (optional)</label>
          <input
            id="cycle-due-date"
            type="date"
            bind:value={cycleFormDueDate}
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
                <th scope="col" class="px-4 py-2 text-left font-semibold text-gray-700">Property</th>
                <th scope="col" class="px-4 py-2 text-right font-semibold text-gray-700">Consumption</th>
                <th scope="col" class="px-4 py-2 text-right font-semibold text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {#each cycleFormDiscoveredBillings as d (d.billingId)}
                <tr class="border-b border-gray-100">
                  <td class="px-4 py-2 text-gray-900">{d.propertyName}</td>
                  <td class="px-4 py-2 text-right font-mono text-gray-700">{d.consumption.toLocaleString()} {getReadingUnit(cycleFormUtilityType)}</td>
                  <td class="px-4 py-2 text-right font-mono text-gray-900">{formatCurrency(d.amount)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label for="cycle-total-consumption" class="block text-sm font-medium text-gray-700">
              Total Consumption ({getReadingUnit(cycleFormUtilityType)})
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

      <!-- Manual Billing (Advanced) Tab -->
      <details class="mt-6 rounded-lg border border-gray-200 bg-white">
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
                disabled={!createFormData.property_id}
                class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
              >
                <option value="">Select previous reading</option>
                {#each manualBillingReadings as reading (reading.id)}
                  <option value={reading.id}>
                    {formatReading(reading.reading_amount, meterGroups.find(m => m.id === reading.meter_group_id)?.utility_type || 'electricity')} - {formatDate(toDate(reading.reading_date))}
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
                disabled={!createFormData.property_id}
                class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
              >
                <option value="">Select current reading</option>
                {#each manualBillingReadings as reading (reading.id)}
                  <option value={reading.id}>
                    {formatReading(reading.reading_amount, meterGroups.find(m => m.id === reading.meter_group_id)?.utility_type || 'electricity')} - {formatDate(toDate(reading.reading_date))}
                  </option>
                {/each}
              </select>
            </div>
            <div class="flex space-x-2">
              <button
                type="submit"
                disabled={isCreating}
                class="rounded px-4 py-2 text-white font-medium disabled:opacity-50"
                style="background-color: var(--color-accent)"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                disabled={isCreating}
                onclick={() => (createFormOpen = false)}
                class="rounded px-4 py-2 border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  {/if}


  <div class="space-y-4">
    {#if cycles.data.length === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <EmptyState title="No billing cycles" message="Create cycles to manage billing periods" />
      </div>
    {:else}
      {#each groupedCycles as group (group.meterGroupId || 'unknown')}
        <div class="space-y-2">
          <h2 class="px-6 text-sm font-semibold text-gray-600">
            {group.meterGroupName}
            {#if group.meterGroupId}
              <span class="text-gray-500 font-normal">({meterGroups.find(m => m.id === group.meterGroupId)?.utility_type})</span>
            {/if}
          </h2>
          {#each group.cycles as cycle (cycle.id)}
            <div class="rounded-lg border border-gray-200 bg-white">
              <!-- Cycle Header Row -->
              <div class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
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
                          class="text-gray-400 transition {expandedCycleId === cycle.id ? 'rotate-90' : ''}"
                        >
                          <ChevronRight size={20} />
                        </div>
                        <div>
                          <div class="font-medium text-gray-900">
                            {formatDate(toDate(cycle.billing_start_date))} –
                            {formatDate(toDate(cycle.billing_end_date))}
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
                          {cycle.billing_consumption.toLocaleString()} {getReadingUnit(getCycleUtilityType(cycle))}
                        </div>
                      </div>
                      <div>
                        <div class="text-xs font-medium text-gray-600">Rate</div>
                        <div class="font-mono font-semibold text-gray-900">
                          ₱{cycle.billing_rate.toFixed(2)}/{getReadingUnit(getCycleUtilityType(cycle))}
                        </div>
                      </div>
                      <div>
                        <div class="text-xs font-medium text-gray-600">Total Amount</div>
                        <div class="font-mono font-semibold text-gray-900">
                          {formatCurrency(cycle.billing_consumption * cycle.billing_rate)}
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

                {#if expandedCycleId === cycle.id && (billings.get(cycle.id)?.length ?? 0) > 0}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      printReceipts(cycle);
                    }}
                    class="ml-4 p-2 rounded hover:bg-gray-100 text-gray-700"
                    title="Print receipts"
                  >
                    <Printer size={20} />
                  </button>
                {/if}
              </div>

              <!-- Expanded Billings Table -->
              {#if expandedCycleId === cycle.id}
                <div id={`cycle-detail-${cycle.id}`} class="border-t border-gray-200 bg-gray-50">
                  {#if billings.get(cycle.id)?.length === 0}
                    <div class="px-6 py-4">
                      <EmptyState title="No billings" message="No billings in this cycle yet" />
                    </div>
                  {:else if billings.has(cycle.id)}
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead class="border-b border-gray-200 bg-gray-50">
                          <tr>
                            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Property</th>
                            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Previous Reading</th>
                            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Current Reading</th>
                            <th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">
                              Consumption
                            </th>
                            <th scope="col" class="px-6 py-3 text-right font-semibold text-gray-700">Amount</th>
                            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                            <th scope="col" class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each billings.get(cycle.id) || [] as billing (billing.id)}
                            {@const billingProperty = properties.find(p => p.id === billing.property_id)}
                            {@const meterEntry = cycle.meter_group_id ? (
                              meterGroups.find(m => m.id === cycle.meter_group_id)?.utility_type === 'water'
                                ? billingProperty?.meter_groups.water
                                : billingProperty?.meter_groups.electricity
                            ) : null}
                            {@const isMainMeter = typeof meterEntry === 'string' ? false : meterEntry?.is_main_meter ?? false}
                            <tr class="border-b border-gray-100 hover:bg-white">
                              <td class="px-6 py-3 text-gray-900">
                                <div class="flex items-center gap-2">
                                  <span>{billingProperty?.room_name ?? 'Unknown Property'}</span>
                                  {#if isMainMeter}
                                    <span class="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                                      Derived
                                    </span>
                                  {/if}
                                </div>
                              </td>
                              <td class="px-6 py-3 font-mono text-gray-700">
                                {#if readings.find(r => r.id === billing.previous_reading_id)}
                                  {formatReading(readings.find(r => r.id === billing.previous_reading_id)?.reading_amount || 0, meterGroups.find(m => m.id === readings.find(r => r.id === billing.previous_reading_id)?.meter_group_id)?.utility_type || 'electricity')}
                                {:else}
                                  N/A
                                {/if}
                              </td>
                              <td class="px-6 py-3 font-mono text-gray-700">
                                {#if readings.find(r => r.id === billing.current_reading_id)}
                                  {formatReading(readings.find(r => r.id === billing.current_reading_id)?.reading_amount || 0, meterGroups.find(m => m.id === readings.find(r => r.id === billing.current_reading_id)?.meter_group_id)?.utility_type || 'electricity')}
                                {:else}
                                  N/A
                                {/if}
                              </td>
                              <td class="px-6 py-3 text-right font-mono text-gray-700">
                                {#if readings.find(r => r.id === billing.current_reading_id)}
                                  {(cycle.billing_ids[billing.id] ?? 0).toLocaleString()} {getReadingUnit(meterGroups.find(m => m.id === readings.find(r => r.id === billing.current_reading_id)?.meter_group_id)?.utility_type || 'electricity')}
                                {:else}
                                  N/A
                                {/if}
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
                                <div class="flex gap-1">
                                  {#if billing.payment_status === 'pending'}
                                    <button
                                      onclick={() => handleMarkAsPaid(billing.id)}
                                      disabled={isLoading || markingAsPaidId === billing.id}
                                      class="p-2 rounded hover:bg-green-100 text-green-700 disabled:opacity-50"
                                      title="Mark as paid"
                                    >
                                      <CheckCircle2 size={18} />
                                    </button>
                                  {/if}
                                  <button
                                    onclick={() => openEditModal(billing)}
                                    disabled={isLoading || isUpdating}
                                    class="p-2 rounded hover:bg-blue-100 text-blue-700 disabled:opacity-50"
                                    title="Edit billing"
                                  >
                                    <Pencil size={18} />
                                  </button>
                                  <button
                                    onclick={() => crud.handleSoftDelete(billing.id, softDeleteBilling, loadData, () => confirm('Archive this billing? It can be restored from the archive.'))}
                                    disabled={isLoading || crud.deletingId === billing.id}
                                    class="p-2 rounded hover:bg-red-100 text-red-700 disabled:opacity-50"
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
                    <div class="px-6 py-4 text-center text-sm text-gray-500">
                      Loading billings...
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
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
      <label for="edit-previous-reading" class="block text-sm font-medium text-gray-700">Previous Reading</label>
      <select
        id="edit-previous-reading"
        bind:value={editData.previous_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each editModalReadings as reading (reading.id)}
          <option value={reading.id}>
            {formatReading(reading.reading_amount, meterGroups.find(m => m.id === reading.meter_group_id)?.utility_type || 'electricity')} - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
    <div>
      <label for="edit-current-reading" class="block text-sm font-medium text-gray-700">Current Reading</label>
      <select
        id="edit-current-reading"
        bind:value={editData.current_reading_id}
        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
      >
        {#each editModalReadings as reading (reading.id)}
          <option value={reading.id}>
            {formatReading(reading.reading_amount, meterGroups.find(m => m.id === reading.meter_group_id)?.utility_type || 'electricity')} - {formatDate(toDate(reading.reading_date))}
          </option>
        {/each}
      </select>
    </div>
  </div>
</EditModal>
