<script lang="ts">
  import { onMount } from 'svelte';
  let Bar = $state<any>();
  let Line = $state<any>();
  import {
    getSummaryReport,
    getConsumptionReport,
    getBillingTrendsReport,
    getCollectionStatusReport,
  } from '$lib/api/reports';
  import { getMeterGroups } from '$lib/api/meter-groups';
  import { getProperties } from '$lib/api/properties';
  import { formatCurrency } from '$lib/utils/format';
  import type {
    ReportSummary,
    ConsumptionReport,
    BillingTrendsReport,
    CollectionStatusReport,
  } from '$lib/types/reports.types';
  import type { MeterGroup } from '$lib/types/meter-group.types';
  import type { Property } from '$lib/types/property.types';

  let isLoading = $state(true);
  let error = $state('');

  let startDate = $state('');
  let endDate = $state('');
  let usePresent = $state(true);
  let selectedMeterGroupId = $state('');
  let selectedPropertyId = $state('');

  let meterGroups = $state<MeterGroup[]>([]);
  let properties = $state<Property[]>([]);

  let summary = $state<ReportSummary | null>(null);
  let consumption = $state<ConsumptionReport | null>(null);
  let billingTrends = $state<BillingTrendsReport | null>(null);
  let collectionStatus = $state<CollectionStatusReport | null>(null);

  const consumptionChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Consumption by Month',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Revenue Trends by Month',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  let consumptionChartData = $derived.by(() => {
    if (!consumption) return { labels: [], datasets: [] };
    return {
      labels: consumption.by_month.map((m) => m.period),
      datasets: [
        {
          label: 'Electricity',
          data: consumption.by_month.map((m) => m.electricity),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
        {
          label: 'Water',
          data: consumption.by_month.map((m) => m.water),
          backgroundColor: 'rgba(34, 197, 94, 0.5)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1,
        },
      ],
    };
  });

  let trendChartData = $derived.by(() => {
    if (!billingTrends) return { labels: [], datasets: [] };
    return {
      labels: billingTrends.by_month.map((m) => m.period),
      datasets: [
        {
          label: 'Total Billed',
          data: billingTrends.by_month.map((m) => m.total_billed),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          tension: 0.4,
        },
        {
          label: 'Total Collected',
          data: billingTrends.by_month.map((m) => m.total_collected),
          borderColor: 'rgba(34, 197, 94, 1)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          tension: 0.4,
        },
      ],
    };
  });

  async function loadFilters() {
    try {
      const [meterGroupsData, propertiesData] = await Promise.all([
        getMeterGroups({ limit: 100 }),
        getProperties({ limit: 100 }),
      ]);

      meterGroups = meterGroupsData.data || [];
      properties = propertiesData.data || [];
      console.log('Loaded meter groups:', meterGroups.length);
      console.log('Loaded properties:', properties.length);
    } catch (err) {
      console.error('Failed to load filter options:', err);
      error = 'Failed to load filter options';
    }
  }

  function formatDateToISO(value: string): string {
    if (!value) return '';
    // Convert date (2026-04-15) to ISO 8601 start of day (2026-04-15T00:00:00Z)
    return new Date(value + 'T00:00:00').toISOString();
  }

  async function loadReports() {
    try {
      isLoading = true;
      error = '';

      const params: Record<string, string> = {};
      if (startDate) params.startDate = formatDateToISO(startDate);
      if (!usePresent && endDate) params.endDate = formatDateToISO(endDate);
      if (selectedMeterGroupId) params.meterGroupId = selectedMeterGroupId;
      if (selectedPropertyId) params.propertyId = selectedPropertyId;

      const [summaryData, consumptionData, trendsData, collectionData] = await Promise.all([
        getSummaryReport(params),
        getConsumptionReport(params),
        getBillingTrendsReport(params),
        getCollectionStatusReport(params),
      ]);

      summary = summaryData;
      consumption = consumptionData;
      billingTrends = trendsData;
      collectionStatus = collectionData;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load reports';
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    // Lazy-load Chart.js and components
    const [{ Bar: BarComponent, Line: LineComponent }, ChartModule] = await Promise.all([
      import('svelte-chartjs'),
      import('chart.js'),
    ]);

    Bar = BarComponent;
    Line = LineComponent;

    const {
      Chart: ChartJS,
      CategoryScale,
      LinearScale,
      PointElement,
      LineElement,
      BarElement,
      Title,
      Tooltip,
      Legend,
    } = ChartModule;

    ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

    await loadFilters();
    await loadReports();
  });

  function handleApplyFilters() {
    loadReports();
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold">Reports</h1>
    <p class="mt-1 text-gray-600">Analytics and insights</p>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
  {/if}

  <!-- Filters -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label for="startDate" class="block text-sm font-medium text-gray-700">Start Date</label>
        <input
          id="startDate"
          type="date"
          bind:value={startDate}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <div class="block text-sm font-medium text-gray-700 mb-1">End Date</div>
        <div class="flex gap-2 items-center">
          <input
            id="endDate"
            type="date"
            bind:value={endDate}
            disabled={usePresent}
            class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          />
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              bind:checked={usePresent}
              class="rounded border-gray-300"
            />
            <span>To Present</span>
          </label>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label for="meterGroup" class="block text-sm font-medium text-gray-700">Meter Group</label>
        <select
          id="meterGroup"
          bind:value={selectedMeterGroupId}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Meter Groups</option>
          {#each meterGroups as group (group.id)}
            <option value={group.id}>{group.meter_name}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="property" class="block text-sm font-medium text-gray-700">Property</label>
        <select
          id="property"
          bind:value={selectedPropertyId}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Properties</option>
          {#each properties as prop (prop.id)}
            <option value={prop.id}>{prop.room_name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="flex justify-end">
      <button
        onclick={handleApplyFilters}
        class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Apply
      </button>
    </div>
  </div>

  {#if isLoading}
    <!-- Skeleton Loading -->
    <div class="grid grid-cols-4 gap-4">
      {#each [1, 2, 3, 4] as _}
        <div class="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-24 mb-3"></div>
          <div class="h-8 bg-gray-200 rounded w-32 mb-2"></div>
          <div class="h-3 bg-gray-200 rounded w-20"></div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-lg border border-gray-200 bg-white p-6 animate-pulse h-96"></div>
      <div class="rounded-lg border border-gray-200 bg-white p-6 animate-pulse h-96"></div>
    </div>
  {:else if summary}
    <!-- Summary Cards -->
    <div class="grid grid-cols-4 gap-4">
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">Total Revenue</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(summary.total_revenue)}</p>
        <p class="mt-1 text-xs text-gray-500">Amount collected</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">Collection Rate</p>
        <p class="mt-2 text-3xl font-bold">{Math.round(summary.collection_rate * 100)}%</p>
        <p class="mt-1 text-xs text-gray-500">
          {summary.paid_count} of {summary.paid_count + summary.pending_count + summary.overdue_count} paid
        </p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-sm font-medium text-gray-600">Pending Amount</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(summary.pending_amount)}</p>
        <p class="mt-1 text-xs text-gray-500">{summary.pending_count} pending</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6" style="background-color: var(--color-status-overdue-bg, #fee2e2)">
        <p class="text-sm font-medium text-gray-600">Overdue Amount</p>
        <p class="mt-2 text-3xl font-bold">{formatCurrency(summary.overdue_amount)}</p>
        <p class="mt-1 text-xs text-gray-500">{summary.overdue_count} overdue</p>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <Bar data={consumptionChartData} options={consumptionChartOptions} />
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <Line data={trendChartData} options={trendChartOptions} />
      </div>
    </div>

    <!-- Collection Status Cards -->
    {#if collectionStatus}
      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-lg border border-gray-200 bg-white p-6">
          <p class="text-sm font-medium text-gray-600">Paid</p>
          <p class="mt-2 text-3xl font-bold">{collectionStatus.paid.count}</p>
          <p class="mt-1 text-sm text-gray-500">{formatCurrency(collectionStatus.paid.amount)}</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-6">
          <p class="text-sm font-medium text-gray-600">Pending</p>
          <p class="mt-2 text-3xl font-bold">{collectionStatus.pending.count}</p>
          <p class="mt-1 text-sm text-gray-500">{formatCurrency(collectionStatus.pending.amount)}</p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-6" style="background-color: var(--color-status-overdue-bg, #fee2e2)">
          <p class="text-sm font-medium text-gray-600">Overdue</p>
          <p class="mt-2 text-3xl font-bold">{collectionStatus.overdue.count}</p>
          <p class="mt-1 text-sm text-gray-500">{formatCurrency(collectionStatus.overdue.amount)}</p>
        </div>
      </div>
    {/if}

    <!-- Property Consumption Table -->
    {#if consumption && consumption.by_property.length > 0}
      <div class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="mb-4 font-semibold">Consumption by Property</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Consumption by property</caption>
            <thead>
              <tr class="border-b border-gray-100 text-left text-gray-500">
                <th scope="col" class="pb-2 font-medium">Property</th>
                <th scope="col" class="pb-2 font-medium">Electricity</th>
                <th scope="col" class="pb-2 font-medium">Water</th>
                <th scope="col" class="pb-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each consumption.by_property as property (property.property_id)}
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="py-3">{property.room_name}</td>
                  <td class="py-3">{property.electricity.toLocaleString()} kWh</td>
                  <td class="py-3">{property.water.toLocaleString()} m³</td>
                  <td class="py-3 font-medium">
                    {#if property.electricity > 0 && property.water === 0}
                      {(property.electricity + property.water).toLocaleString()} kWh
                    {:else if property.water > 0 && property.electricity === 0}
                      {(property.electricity + property.water).toLocaleString()} m³
                    {:else if property.electricity > 0 && property.water > 0}
                      {property.electricity.toLocaleString()} kWh + {property.water.toLocaleString()} m³
                    {:else}
                      0
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
