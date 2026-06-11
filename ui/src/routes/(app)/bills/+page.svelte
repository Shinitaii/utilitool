<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ocrBill } from '$lib/api/bills';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getBillings } from '$lib/api/billings';
  import { createBillingCycle } from '$lib/api/billing-cycles';
  import { uploadToStorage } from '$lib/utils/firebase-storage';
  import { formatCurrency, formatDate } from '$lib/utils/format';
  import { billAmount } from '$lib/utils/money';
  import { toDate } from '$lib/utils/timestamp';
  import type { OcrBillResponse } from '$lib/types/bill.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Billing } from '$lib/types/billing.types';

  const TOLERANCE_RATE = 0.03;

  let step = $state(1);
  let selectedMeterGroup = $state('');
  let meterGroups = $state<MeterGroup[]>([]);
  let billings = $state<Billing[]>([]);
  let isLoading = $state(false);
  let isUploadingFile = $state(false);
  let error = $state('');

  let billImageUrl = $state('');
  let ocrResult = $state<OcrBillResponse | null>(null);

  let reviewForm = $state({
    billing_start_date: '',
    billing_end_date: '',
    billing_consumption: 0,
    billing_rate: 0,
    billing_ids: {} as Record<string, number>,
  });

  onMount(async () => {
    await loadMeterGroups();
  });

  async function loadMeterGroups() {
    isLoading = true;
    error = '';
    try {
      const result = await getMeterGroups({ limit: 100 });
      meterGroups = result.data;
      if (meterGroups.length > 0) {
        selectedMeterGroup = meterGroups[0].id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load meter groups';
    } finally {
      isLoading = false;
    }
  }

  async function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isUploadingFile = true;
    error = '';
    try {
      const timestamp = Date.now();
      const path = `bills/${timestamp}_${file.name}`;
      billImageUrl = await uploadToStorage(file, path);

      ocrResult = await ocrBill(billImageUrl);
      reviewForm.billing_start_date = ocrResult.billing_start_date;
      reviewForm.billing_end_date = ocrResult.billing_end_date;
      reviewForm.billing_consumption = ocrResult.billing_consumption;
      reviewForm.billing_rate = ocrResult.billing_rate;

      await loadBillings();
      step = 2;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to upload bill or extract data';
    } finally {
      isUploadingFile = false;
    }
  }

  async function loadBillings() {
    try {
      const result = await getBillings({ limit: 100 });
      billings = result.data;
    } catch (err) {
      console.error('Failed to load billings:', err);
    }
  }

  function toggleBillingId(billingId: string) {
    if (billingId in reviewForm.billing_ids) {
      delete reviewForm.billing_ids[billingId];
    } else {
      reviewForm.billing_ids[billingId] = 0;
    }
  }

  function getRunningTotal(): number {
    return Object.values(reviewForm.billing_ids).reduce((a, b) => a + b, 0);
  }

  function getVariance(): number {
    const total = getRunningTotal();
    return Math.abs(total - reviewForm.billing_consumption);
  }

  function isWithinTolerance(): boolean {
    return getVariance() <= (reviewForm.billing_consumption * TOLERANCE_RATE);
  }

  async function handleSubmit() {
    isLoading = true;
    error = '';
    try {
      if (!isWithinTolerance()) {
        error = `Billing consumption variance exceeds ${(TOLERANCE_RATE * 100).toFixed(0)}% tolerance. Difference: ${getVariance().toFixed(2)}`;
        isLoading = false;
        return;
      }

      const payload = {
        billing_ids: reviewForm.billing_ids,
        billing_rate: reviewForm.billing_rate,
        billing_consumption: reviewForm.billing_consumption,
        billing_start_date: reviewForm.billing_start_date,
        billing_end_date: reviewForm.billing_end_date,
      };

      await createBillingCycle(payload);

      step = 1;
      selectedMeterGroup = meterGroups.length > 0 ? meterGroups[0].id : '';
      billImageUrl = '';
      ocrResult = null;
      reviewForm = {
        billing_start_date: '',
        billing_end_date: '',
        billing_consumption: 0,
        billing_rate: 0,
        billing_ids: {},
      };

      await goto('/billings');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create billing cycle';
    } finally {
      isLoading = false;
    }
  }

  function goBack() {
    step = step - 1;
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Bill Upload & OCR</h1>
    <p class="mt-1 text-gray-600">Extract utility bill data and create billing cycles</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <!-- Step 1: Upload -->
  {#if step === 1}
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Step 1: Upload Bill Image</h2>
        <span class="text-sm text-gray-500">1 of 3</span>
      </div>

      <div class="space-y-4">
        <div>
          <label for="meter-group" class="block text-sm font-medium text-gray-700">
            Meter Group
          </label>
          <select
            id="meter-group"
            bind:value={selectedMeterGroup}
            disabled={isUploadingFile}
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
          >
            {#each meterGroups as group (group.id)}
              <option value={group.id}>
                {group.meter_name} ({group.utility_type})
              </option>
            {/each}
          </select>
        </div>

        <div>
          <label for="bill-image" class="block text-sm font-medium text-gray-700">
            Bill Image (JPEG/PNG)
          </label>
          <input
            id="bill-image"
            type="file"
            accept="image/*"
            onchange={handleFileSelect}
            disabled={isUploadingFile}
            class="mt-1 block w-full text-sm text-gray-500 file:rounded file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            style="--tw-file-bg: var(--color-accent)"
          />
        </div>

        {#if isUploadingFile}
          <div class="text-center text-sm text-gray-600">
            <p>Uploading and analyzing bill...</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Step 2: Review -->
  {#if step === 2 && ocrResult}
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Step 2: Review & Map Billings</h2>
        <span class="text-sm text-gray-500">2 of 3</span>
      </div>

      <div class="space-y-6">
        <!-- OCR Results -->
        <div class="rounded bg-blue-50 p-4">
          <h3 class="font-semibold text-blue-900">OCR Results (Editable)</h3>
          <div class="mt-4 space-y-4">
            <div>
              <label for="start-date" class="block text-sm font-medium text-gray-700">
                Billing Start Date
              </label>
              <input
                id="start-date"
                type="date"
                bind:value={reviewForm.billing_start_date}
                class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label for="end-date" class="block text-sm font-medium text-gray-700">
                Billing End Date
              </label>
              <input
                id="end-date"
                type="date"
                bind:value={reviewForm.billing_end_date}
                class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="consumption" class="block text-sm font-medium text-gray-700">
                  Consumption
                </label>
                <input
                  id="consumption"
                  type="number"
                  bind:value={reviewForm.billing_consumption}
                  step="0.01"
                  min="0"
                  class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label for="rate" class="block text-sm font-medium text-gray-700">Rate</label>
                <input
                  id="rate"
                  type="number"
                  bind:value={reviewForm.billing_rate}
                  step="0.01"
                  min="0"
                  class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div>
              <p class="text-sm text-gray-600">
                Raw Amount: <span class="font-semibold">{formatCurrency(ocrResult.raw_amount)}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Billing Selection -->
        <div>
          <h3 class="mb-2 font-semibold">Select Billings to Include</h3>
          <div class="space-y-2 max-h-64 overflow-y-auto rounded border border-gray-300 bg-gray-50 p-3">
            {#if billings.length === 0}
              <p class="text-sm text-gray-500">No billings found for this period</p>
            {:else}
              {#each billings as billing (billing.id)}
                <label class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={billing.id in reviewForm.billing_ids}
                    onchange={() => toggleBillingId(billing.id)}
                    class="rounded border-gray-300"
                  />
                  <span class="flex-1 text-sm">{billing.property_id || 'Unknown Property'}</span>
                </label>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Per-Billing Consumption Input -->
        {#if Object.keys(reviewForm.billing_ids).length > 0}
          <div>
            <h3 class="mb-2 font-semibold">Consumption per Billing</h3>
            <div class="space-y-2">
              {#each Object.keys(reviewForm.billing_ids) as billingId (billingId)}
                <div class="flex items-center gap-2">
                  <label for="consumption-{billingId}" class="flex-1 text-sm text-gray-700">
                    {billings.find((b) => b.id === billingId)?.property_id || billingId}
                  </label>
                  <input
                    id="consumption-{billingId}"
                    type="number"
                    bind:value={reviewForm.billing_ids[billingId]}
                    step="0.01"
                    min="0"
                    class="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
              {/each}
            </div>
            <div class="mt-4 rounded bg-yellow-50 p-3">
              <p class="text-sm font-semibold text-yellow-900">
                Total Consumption: {getRunningTotal().toFixed(2)} / {reviewForm.billing_consumption.toFixed(2)}
              </p>
              <p class="text-xs text-yellow-800">
                Variance: {getVariance().toFixed(2)} (Within 3% tolerance: {isWithinTolerance() ? '✓' : '✗'})
              </p>
            </div>
          </div>
        {/if}
      </div>

      <div class="mt-6 flex gap-3">
        <button
          onclick={goBack}
          disabled={isLoading}
          class="rounded px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
        >
          Back
        </button>
        <button
          onclick={() => (step = 3)}
          disabled={Object.keys(reviewForm.billing_ids).length === 0 || !isWithinTolerance() || isLoading}
          class="rounded px-4 py-2 text-white font-medium disabled:opacity-50"
          style="background-color: var(--color-accent)"
        >
          Next →
        </button>
      </div>
    </div>
  {/if}

  <!-- Step 3: Submit -->
  {#if step === 3 && ocrResult}
    <div class="rounded-lg border border-gray-200 bg-white p-6">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Step 3: Review & Submit</h2>
        <span class="text-sm text-gray-500">3 of 3</span>
      </div>

      <div class="space-y-4 bg-gray-50 p-4 rounded">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-xs text-gray-600">Billing Period</p>
            <p class="font-semibold">
              {formatDate(new Date(reviewForm.billing_start_date))} – {formatDate(
                new Date(reviewForm.billing_end_date)
              )}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-600">Total Consumption</p>
            <p class="font-semibold">{reviewForm.billing_consumption.toFixed(2)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-600">Rate</p>
            <p class="font-semibold">{formatCurrency(reviewForm.billing_rate)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-600">Calculated Total</p>
            <p class="font-semibold">
              {formatCurrency(billAmount(reviewForm.billing_consumption, reviewForm.billing_rate))}
            </p>
          </div>
        </div>

        <div class="border-t border-gray-300 pt-4">
          <p class="text-sm font-semibold text-gray-700 mb-2">Billings ({Object.keys(reviewForm.billing_ids).length})</p>
          <ul class="text-sm space-y-1 text-gray-600">
            {#each Object.keys(reviewForm.billing_ids) as billingId (billingId)}
              <li>
                {billings.find((b) => b.id === billingId)?.property_id || billingId}:
                <span class="font-mono">{reviewForm.billing_ids[billingId]?.toFixed(2) || '0.00'}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="mt-6 flex gap-3">
        <button
          onclick={goBack}
          disabled={isLoading}
          class="rounded px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
        >
          Back
        </button>
        <button
          onclick={handleSubmit}
          disabled={isLoading}
          class="rounded px-4 py-2 text-white font-medium disabled:opacity-50"
          style="background-color: var(--color-accent)"
        >
          {isLoading ? 'Creating Cycle...' : 'Create Billing Cycle'}
        </button>
      </div>
    </div>
  {/if}
</div>
