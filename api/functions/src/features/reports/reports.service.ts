import {billingCycleRepository} from "../billing-cycle/billing-cycle.repository";
import {billingRepository} from "../billing/billing.repository";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {propertyRepository} from "../property/property.repository";
import {readingRepository} from "../reading/reading.repository";
import {calculateTrueReading, resolveVersionsSource} from "../reading/reading.util";
import {billAmount, sumMoney} from "../../utils/money.util";
import type {SearchFilter, RangeFilter} from "../../lib/repository.lib";
import type {BillingCycle} from "../billing-cycle/billing-cycle.model";
import type {WithoutBaseModel} from "../../utils/model.util";
import type {
  ReportSummary,
  ConsumptionReport,
  BillingTrendsReport,
  CollectionStatusReport,
  JoinedBilling,
} from "./reports.model";
import type {ReportQueryDTO} from "./reports.dto";

/**
 * Build date range filters for query-time filtering (H1 optimization).
 * Filters on billing_start_date for efficient range queries.
 */
function buildDateRangeFilters(query: ReportQueryDTO): SearchFilter<WithoutBaseModel<BillingCycle>> {
  const filters: SearchFilter<WithoutBaseModel<BillingCycle>> = {};
  if (query.startDate || query.endDate) {
    const rangeFilter: RangeFilter = {};
    if (query.startDate) {
      rangeFilter.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      rangeFilter.$lte = new Date(query.endDate);
    }
    filters.billing_start_date = rangeFilter;
  }
  return filters;
}

/**
 * Shared fetch/map-building pipeline for the report endpoints: cycles → billings →
 * properties → meter groups. Both buildJoinedData and getConsumption fetch these
 * identically; they diverge only in which readings they fetch afterward (current-only
 * vs current+previous, and against filteredBillings vs validBillings), so that step
 * stays in each caller.
 */
async function fetchReportContext(query: ReportQueryDTO) {
  // 1. Fetch billing cycles with date range filtering at query time (H1 optimization)
  const filters = buildDateRangeFilters(query);
  const cyclesResult = await billingCycleRepository.search({
    limit: 1000,
    orderBy: "created_at",
    filters,
  });

  let cycles = cyclesResult.data;

  // 2. Additional in-memory filter for endDate range to ensure both bounds are respected
  // (runs whenever endDate is supplied, not only alongside startDate — an endDate-only
  // query previously only constrained billing_start_date at query time, letting cycles
  // that start before endDate but end well after it leak through).
  if (query.endDate) {
    const endDate = new Date(query.endDate);
    cycles = cycles.filter((c) => c.billing_end_date.toDate() <= endDate);
  }

  // 3. Collect all unique billing IDs (filter out empty strings)
  const allBillingIds = new Set<string>();
  cycles.forEach((c) => {
    Object.keys(c.billing_ids).forEach((id) => {
      if (id && id.trim()) allBillingIds.add(id);
    });
  });

  // 4. Fetch all billings
  const billings = allBillingIds.size > 0 ? await billingRepository.getByIds(Array.from(allBillingIds)) : [];

  const validBillings = billings.filter((b): b is NonNullable<typeof b> => b !== null);

  // 5. Filter by propertyId if specified
  let filteredBillings = validBillings;
  if (query.propertyId) {
    filteredBillings = validBillings.filter((b) => b.property_id === query.propertyId);
  }

  // 6. Collect all unique property IDs and fetch properties (filter out empty)
  const propertyIds = new Set(filteredBillings.map((b) => b.property_id).filter((id) => id && id.trim()));
  const properties = await propertyRepository.getByIds(Array.from(propertyIds));

  const propertyMap = new Map(properties.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => [p.id, p]));

  // 7. Collect all unique meter group IDs
  const meterGroupIds = new Set<string>();
  propertyMap.forEach((prop) => {
    Object.values(prop.meter_groups).forEach((entry) => {
      if (entry?.meter_group_id && entry.meter_group_id.trim()) {
        meterGroupIds.add(entry.meter_group_id);
      }
    });
  });

  // 8. Fetch all meter groups for utility_type
  const meterGroups = await meterGroupRepository.getByIds(Array.from(meterGroupIds));

  const meterGroupMap = new Map(
    meterGroups.filter((mg): mg is NonNullable<typeof mg> => mg !== null).map((mg) => [mg.id, mg])
  );

  return {cycles, validBillings, filteredBillings, propertyMap, meterGroupMap};
}

async function buildJoinedData(userId: string, query: ReportQueryDTO): Promise<JoinedBilling[]> {
  const {cycles, filteredBillings, propertyMap, meterGroupMap} = await fetchReportContext(query);

  if (filteredBillings.length === 0) {
    return [];
  }

  // Fetch all readings (current and previous) for consumption calculation
  const readingIds = new Set<string>();
  filteredBillings.forEach((b) => {
    if (b.current_reading_id && b.current_reading_id.trim()) {
      readingIds.add(b.current_reading_id);
    }
    if (b.previous_reading_id && b.previous_reading_id.trim()) {
      readingIds.add(b.previous_reading_id);
    }
  });

  const readings = await readingRepository.getByIds(Array.from(readingIds));

  const readingMap = new Map(readings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, r]));

  // 9. Build joined data
  const now = new Date();
  const joinedData: JoinedBilling[] = [];

  type Cycle = typeof cycles[number];
  const cycleByBillingId = new Map<string, Cycle>();
  cycles.forEach((c) => {
    Object.keys(c.billing_ids).forEach((billingId) => {
      cycleByBillingId.set(billingId, c);
    });
  });

  for (const billing of filteredBillings) {
    const property = propertyMap.get(billing.property_id);
    if (!property) {
      continue;
    }

    // Get meter group and utility type from the reading (not from property)
    const reading = readingMap.get(billing.current_reading_id);
    if (!reading) {
      continue;
    }

    const meterGroupId = reading.meter_group_id;
    const meterGroup = meterGroupMap.get(meterGroupId);
    const utilityType = meterGroup?.utility_type || "unknown";

    // Filter by meterGroupId if specified
    if (query.meterGroupId && meterGroupId !== query.meterGroupId) {
      continue;
    }

    // Calculate consumption from readings
    const currentReading = readingMap.get(billing.current_reading_id);
    const previousReading = readingMap.get(billing.previous_reading_id);
    if (!currentReading || !previousReading) {
      continue;
    }

    const versionsSource = resolveVersionsSource(meterGroup, property, meterGroupId);
    const consumption = calculateTrueReading(currentReading, versionsSource) - calculateTrueReading(previousReading, versionsSource);

    // Find the cycle that contains this billing
    const cycle = cycleByBillingId.get(billing.id);
    if (!cycle) continue;

    // Calculate amount as consumption × rate
    const amount = billAmount(consumption, cycle.billing_rate);

    // Determine overdue status based on overdue_date if available, otherwise use billing_end_date
    const overdueDate = cycle.overdue_date ? cycle.overdue_date.toDate() : cycle.billing_end_date.toDate();
    const finalIsOverdue = billing.payment_status === "pending" && now > overdueDate;

    joinedData.push({
      billingId: billing.id,
      amount: amount || 0,
      consumption,
      cycleStartDate: cycle.billing_start_date.toDate(),
      cycleEndDate: cycle.billing_end_date.toDate(),
      utilityType,
      propertyId: billing.property_id,
      roomName: property.room_name,
      paymentStatus: billing.payment_status,
      isOverdue: finalIsOverdue,
    });
  }

  return joinedData;
}

export async function getSummary(userId: string, query: ReportQueryDTO): Promise<ReportSummary> {
  const joinedData = await buildJoinedData(userId, query);

  const totalRevenue = sumMoney(
    joinedData.filter((j) => j.paymentStatus === "paid").map((j) => j.amount)
  );

  const totalBilled = sumMoney(joinedData.map((j) => j.amount));
  const collectionRate = totalBilled > 0 ? totalRevenue / totalBilled : 0;

  const paid = joinedData.filter((j) => j.paymentStatus === "paid");
  const pending = joinedData.filter((j) => j.paymentStatus === "pending" && !j.isOverdue);
  const overdue = joinedData.filter((j) => j.isOverdue);

  return {
    total_revenue: totalRevenue,
    total_billed: totalBilled,
    collection_rate: Math.round(collectionRate * 10000) / 10000,
    paid_count: paid.length,
    pending_count: pending.length,
    overdue_count: overdue.length,
    pending_amount: sumMoney(pending.map((j) => j.amount)),
    overdue_amount: sumMoney(overdue.map((j) => j.amount)),
  };
}

export async function getConsumption(userId: string, query: ReportQueryDTO): Promise<ConsumptionReport> {
  // Reuses buildJoinedData so consumption here is computed the same version-aware way
  // (calculateTrueReading against Property.meter_groups[entry].versions) as every other
  // report — previously this endpoint read the raw, non-version-aware number frozen on
  // cycle.billing_ids at cycle-creation time, so a cycle whose meter reset after creation
  // (or was backfilled with the old naive number) showed different consumption here than
  // on the Summary/Billing-Trends/Collection-Status reports for the same underlying data.
  const joinedData = await buildJoinedData(userId, query);

  const monthMap = new Map<string, Record<string, number>>();
  for (const j of joinedData) {
    const month = j.cycleStartDate.toISOString().slice(0, 7);
    if (!monthMap.has(month)) {
      monthMap.set(month, {electricity: 0, water: 0});
    }
    const monthData = monthMap.get(month)!;
    if (j.utilityType === "electricity") {
      monthData.electricity += j.consumption;
    } else if (j.utilityType === "water") {
      monthData.water += j.consumption;
    }
  }

  const by_month = Array.from(monthMap.entries())
    .map(([period, data]) => ({
      period,
      electricity: Math.round(data.electricity * 100) / 100,
      water: Math.round(data.water * 100) / 100,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const propertyConsumption = new Map<string, Record<string, number>>();
  for (const j of joinedData) {
    if (!propertyConsumption.has(j.propertyId)) {
      propertyConsumption.set(j.propertyId, {electricity: 0, water: 0});
    }
    const propData = propertyConsumption.get(j.propertyId)!;
    if (j.utilityType === "electricity") {
      propData.electricity += j.consumption;
    } else if (j.utilityType === "water") {
      propData.water += j.consumption;
    }
  }

  const by_property = Array.from(propertyConsumption.entries())
    .map(([propId, data]) => {
      const j = joinedData.find((jb) => jb.propertyId === propId);
      return {
        property_id: propId,
        room_name: j?.roomName || "Unknown",
        electricity: Math.round(data.electricity * 100) / 100,
        water: Math.round(data.water * 100) / 100,
      };
    })
    .sort((a, b) => a.room_name.localeCompare(b.room_name));

  return {by_month, by_property};
}

export async function getBillingTrends(userId: string, query: ReportQueryDTO): Promise<BillingTrendsReport> {
  const joinedData = await buildJoinedData(userId, query);

  // Group by month
  const monthMap = new Map<string, { billed: number; collected: number; pending: number; overdue: number }>();

  for (const billing of joinedData) {
    // Bucketed by cycle start date to match getConsumption's grouping (both use
    // billing_start_date) — bucketing by end date instead put the same cycle in a
    // different month on this chart vs. the Consumption chart whenever a cycle spans
    // a month boundary.
    const month = billing.cycleStartDate.toISOString().slice(0, 7);

    if (!monthMap.has(month)) {
      monthMap.set(month, {billed: 0, collected: 0, pending: 0, overdue: 0});
    }

    const monthData = monthMap.get(month)!;
    monthData.billed += billing.amount;

    if (billing.paymentStatus === "paid") {
      monthData.collected += billing.amount;
    } else if (billing.isOverdue) {
      monthData.overdue += billing.amount;
    } else {
      monthData.pending += billing.amount;
    }
  }

  const by_month = Array.from(monthMap.entries())
    .map(([period, data]) => ({
      period,
      total_billed: Math.round(data.billed * 100) / 100,
      total_collected: Math.round(data.collected * 100) / 100,
      total_pending: Math.round(data.pending * 100) / 100,
      total_overdue: Math.round(data.overdue * 100) / 100,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  return {by_month};
}

export async function getCollectionStatus(
  userId: string,
  query: ReportQueryDTO
): Promise<CollectionStatusReport> {
  const joinedData = await buildJoinedData(userId, query);

  const paid = joinedData.filter((j) => j.paymentStatus === "paid");
  const pending = joinedData.filter((j) => j.paymentStatus === "pending" && !j.isOverdue);
  const overdue = joinedData.filter((j) => j.isOverdue);

  return {
    paid: {
      count: paid.length,
      amount: sumMoney(paid.map((j) => j.amount)),
    },
    pending: {
      count: pending.length,
      amount: sumMoney(pending.map((j) => j.amount)),
    },
    overdue: {
      count: overdue.length,
      amount: sumMoney(overdue.map((j) => j.amount)),
    },
  };
}
