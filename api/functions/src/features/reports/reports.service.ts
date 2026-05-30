import {billingCycleRepository} from "../billing-cycle/billing-cycle.repository";
import {billingRepository} from "../billing/billing.repository";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {propertyRepository} from "../property/property.repository";
import {readingRepository} from "../reading/reading.repository";
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
function buildDateRangeFilters(query: ReportQueryDTO): any {
  const filters: any = {};
  if (query.startDate || query.endDate) {
    const rangeFilter: any = {};
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

async function buildJoinedData(userId: string, query: ReportQueryDTO): Promise<JoinedBilling[]> {
  // 1. Fetch billing cycles with date range filtering at query time (H1 optimization)
  const filters = buildDateRangeFilters(query);
  const cyclesResult = await billingCycleRepository.search({
    limit: 1000,
    orderBy: "created_at",
    filters,
  });

  let cycles = cyclesResult.data;

  // 2. Additional in-memory filter for endDate range to ensure both bounds are respected
  if (query.startDate && query.endDate) {
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

  if (allBillingIds.size === 0) {
    return [];
  }

  // 4. Fetch all billings in parallel
  const billings = await Promise.all(
    Array.from(allBillingIds).map((id) => billingRepository.getById(id))
  );

  const validBillings = billings.filter((b): b is NonNullable<typeof b> => b !== null);

  // 5. Filter by propertyId if specified
  let filteredBillings = validBillings;
  if (query.propertyId) {
    filteredBillings = validBillings.filter((b) => b.property_id === query.propertyId);
  }

  // 6. Collect all unique property IDs and fetch properties (filter out empty)
  const propertyIds = new Set(filteredBillings.map((b) => b.property_id).filter((id) => id && id.trim()));
  const properties = await Promise.all(
    Array.from(propertyIds).map((id) => propertyRepository.getById(id))
  );

  const propertyMap = new Map(properties.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => [p.id, p]));

  // 7. Collect all unique meter group IDs
  const meterGroupIds = new Set<string>();
  propertyMap.forEach((prop) => {
    Object.values(prop.meter_groups).forEach((entry: any) => {
      if (typeof entry === "string") {
        if (entry.trim()) meterGroupIds.add(entry);
      } else if (entry?.meter_group_id && entry.meter_group_id.trim()) {
        meterGroupIds.add(entry.meter_group_id);
      }
    });
  });

  // 8. Fetch all meter groups for utility_type
  const meterGroups = await Promise.all(
    Array.from(meterGroupIds).map((id) => meterGroupRepository.getById(id))
  );

  const meterGroupMap = new Map(
    meterGroups.filter((mg): mg is NonNullable<typeof mg> => mg !== null).map((mg) => [mg.id, mg])
  );

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

  const readings = await Promise.all(
    Array.from(readingIds).map((id) => readingRepository.getById(id))
  );

  const readingMap = new Map(readings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, r]));

  // 9. Build joined data
  const now = new Date();
  const joinedData: JoinedBilling[] = [];

  console.log(`[Reports] Starting join: ${filteredBillings.length} filtered billings, ${readingMap.size} readings in map`);

  for (const billing of filteredBillings) {
    const property = propertyMap.get(billing.property_id);
    if (!property) {
      console.log(`[Reports] Property ${billing.property_id} not found in map for billing ${billing.id}`);
      continue;
    }

    // Get meter group and utility type from the reading (not from property)
    const reading = readingMap.get(billing.current_reading_id);
    if (!reading) {
      console.log(`[Reports] Current reading ${billing.current_reading_id} not found for billing ${billing.id}`);
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
      console.log(`[Reports] Missing readings for billing ${billing.id}: current=${!!currentReading}, previous=${!!previousReading}`);
      continue;
    }

    const consumption = currentReading.reading_amount - previousReading.reading_amount;

    // Find the cycle that contains this billing
    const cycle = cycles.find((c) => c.billing_ids.hasOwnProperty(billing.id));
    if (!cycle) continue;

    // Calculate amount as consumption × rate
    const amount = consumption * cycle.billing_rate;

    // Determine overdue status based on overdue_date if available, otherwise use billing_end_date
    const overdueDate = cycle.overdue_date ? cycle.overdue_date.toDate() : cycle.billing_end_date.toDate();
    const finalIsOverdue = billing.payment_status === "pending" && now > overdueDate;

    joinedData.push({
      billingId: billing.id,
      amount: amount || 0,
      consumption,
      cycleEndDate: cycle.billing_end_date.toDate(),
      utilityType,
      propertyId: billing.property_id,
      roomName: property.room_name,
      paymentStatus: billing.payment_status,
      isOverdue: finalIsOverdue,
    });
  }

  console.log(`[Reports] Built ${joinedData.length} joined billings from ${filteredBillings.length} filtered billings`);
  return joinedData;
}

export async function getSummary(userId: string, query: ReportQueryDTO): Promise<ReportSummary> {
  const joinedData = await buildJoinedData(userId, query);

  const totalRevenue = joinedData
    .filter((j) => j.paymentStatus === "paid")
    .reduce((sum, j) => sum + j.amount, 0);

  const totalBilled = joinedData.reduce((sum, j) => sum + j.amount, 0);
  const collectionRate = totalBilled > 0 ? totalRevenue / totalBilled : 0;

  const paid = joinedData.filter((j) => j.paymentStatus === "paid");
  const pending = joinedData.filter((j) => j.paymentStatus === "pending" && !j.isOverdue);
  const overdue = joinedData.filter((j) => j.isOverdue);

  return {
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_billed: Math.round(totalBilled * 100) / 100,
    collection_rate: Math.round(collectionRate * 10000) / 10000,
    paid_count: paid.length,
    pending_count: pending.length,
    overdue_count: overdue.length,
    pending_amount: Math.round(pending.reduce((sum, j) => sum + j.amount, 0) * 100) / 100,
    overdue_amount: Math.round(overdue.reduce((sum, j) => sum + j.amount, 0) * 100) / 100,
  };
}

export async function getConsumption(userId: string, query: ReportQueryDTO): Promise<ConsumptionReport> {
  const filters = buildDateRangeFilters(query);
  const cyclesResult = await billingCycleRepository.search({
    limit: 1000,
    orderBy: "created_at",
    filters,
  });

  let cycles = cyclesResult.data;

  // Additional in-memory filter for endDate range to ensure both bounds are respected
  if (query.startDate && query.endDate) {
    const endDate = new Date(query.endDate);
    cycles = cycles.filter((c) => c.billing_end_date.toDate() <= endDate);
  }

  // Collect all billing IDs (filter out empty)
  const allBillingIds = new Set<string>();
  cycles.forEach((c) => {
    Object.keys(c.billing_ids).forEach((id) => {
      if (id && id.trim()) allBillingIds.add(id);
    });
  });

  const billings = await Promise.all(
    Array.from(allBillingIds).map((id) => billingRepository.getById(id))
  );

  const validBillings = billings.filter((b): b is NonNullable<typeof b> => b !== null);

  let filteredBillings = validBillings;
  if (query.propertyId) {
    filteredBillings = validBillings.filter((b) => b.property_id === query.propertyId);
  }

  // Collect properties (filter out empty)
  const propertyIds = new Set(filteredBillings.map((b) => b.property_id).filter((id) => id && id.trim()));
  const properties = await Promise.all(
    Array.from(propertyIds).map((id) => propertyRepository.getById(id))
  );

  const propertyMap = new Map(properties.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => [p.id, p]));

  // Collect meter groups
  const meterGroupIds = new Set<string>();
  propertyMap.forEach((prop) => {
    Object.values(prop.meter_groups).forEach((entry: any) => {
      if (typeof entry === "string") {
        if (entry.trim()) meterGroupIds.add(entry);
      } else if (entry?.meter_group_id && entry.meter_group_id.trim()) {
        meterGroupIds.add(entry.meter_group_id);
      }
    });
  });

  const meterGroups = await Promise.all(
    Array.from(meterGroupIds).map((id) => meterGroupRepository.getById(id))
  );

  const meterGroupMap = new Map(
    meterGroups.filter((mg): mg is NonNullable<typeof mg> => mg !== null).map((mg) => [mg.id, mg])
  );

  // Fetch all current readings to determine meter group for each billing
  const readingIds = new Set<string>();
  validBillings.forEach((b) => {
    if (b.current_reading_id && b.current_reading_id.trim()) {
      readingIds.add(b.current_reading_id);
    }
  });

  const readings = await Promise.all(
    Array.from(readingIds).map((id) => readingRepository.getById(id))
  );

  const readingMap = new Map(readings.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => [r.id, r]));

  // Group by month
  const monthMap = new Map<string, Record<string, number>>();

  for (const cycle of cycles) {
    const month = cycle.billing_start_date.toDate().toISOString().slice(0, 7);

    for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
      const billing = validBillings.find((b) => b.id === billingId);
      if (!billing) continue;

      const property = propertyMap.get(billing.property_id);
      if (!property) continue;

      // Get utility type from the reading's meter group (accurate source)
      let utilityType = "unknown";
      const reading = readingMap.get(billing.current_reading_id);
      if (reading) {
        const readingMeterGroup = meterGroupMap.get(reading.meter_group_id);
        if (readingMeterGroup) {
          utilityType = readingMeterGroup.utility_type;
        }
      }

      // Apply meter group filter if specified
      if (query.meterGroupId && reading?.meter_group_id !== query.meterGroupId) {
        continue;
      }

      if (!monthMap.has(month)) {
        monthMap.set(month, {electricity: 0, water: 0});
      }

      const monthData = monthMap.get(month)!;
      if (utilityType === "electricity") {
        monthData.electricity += consumption;
      } else if (utilityType === "water") {
        monthData.water += consumption;
      }
    }
  }

  const by_month = Array.from(monthMap.entries())
    .map(([period, data]) => ({
      period,
      electricity: Math.round(data.electricity * 100) / 100,
      water: Math.round(data.water * 100) / 100,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // Group by property
  const propertyConsumption = new Map<string, Record<string, number>>();

  for (const cycle of cycles) {
    for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
      const billing = validBillings.find((b) => b.id === billingId);
      if (!billing) continue;

      const property = propertyMap.get(billing.property_id);
      if (!property) continue;

      if (query.propertyId && billing.property_id !== query.propertyId) continue;

      // Get utility type from the reading's meter group (accurate source)
      let utilityType = "unknown";
      const reading = readingMap.get(billing.current_reading_id);
      if (reading) {
        const readingMeterGroup = meterGroupMap.get(reading.meter_group_id);
        if (readingMeterGroup) {
          utilityType = readingMeterGroup.utility_type;
        }
      }

      // Apply meter group filter if specified
      if (query.meterGroupId && reading?.meter_group_id !== query.meterGroupId) {
        continue;
      }

      if (!propertyConsumption.has(billing.property_id)) {
        propertyConsumption.set(billing.property_id, {electricity: 0, water: 0});
      }

      const propData = propertyConsumption.get(billing.property_id)!;
      if (utilityType === "electricity") {
        propData.electricity += consumption;
      } else if (utilityType === "water") {
        propData.water += consumption;
      }
    }
  }

  const by_property = Array.from(propertyConsumption.entries())
    .map(([propId, data]) => ({
      property_id: propId,
      room_name: propertyMap.get(propId)?.room_name || "Unknown",
      electricity: Math.round(data.electricity * 100) / 100,
      water: Math.round(data.water * 100) / 100,
    }))
    .sort((a, b) => a.room_name.localeCompare(b.room_name));

  return {by_month, by_property};
}

export async function getBillingTrends(userId: string, query: ReportQueryDTO): Promise<BillingTrendsReport> {
  const joinedData = await buildJoinedData(userId, query);

  // Group by month
  const monthMap = new Map<string, { billed: number; collected: number; pending: number; overdue: number }>();

  for (const billing of joinedData) {
    const month = billing.cycleEndDate.toISOString().slice(0, 7);

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
      amount: Math.round(paid.reduce((sum, j) => sum + j.amount, 0) * 100) / 100,
    },
    pending: {
      count: pending.length,
      amount: Math.round(pending.reduce((sum, j) => sum + j.amount, 0) * 100) / 100,
    },
    overdue: {
      count: overdue.length,
      amount: Math.round(overdue.reduce((sum, j) => sum + j.amount, 0) * 100) / 100,
    },
  };
}
