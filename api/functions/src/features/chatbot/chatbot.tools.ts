import {AppError} from "../../utils/error.util";
import {UTILITY_TYPES, UtilityType} from "../../constants/utility.constants";
import {propertyRepository} from "../property/property.repository";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {readingRepository} from "../reading/reading.repository";
import {billingRepository} from "../billing/billing.repository";
import {billingCycleRepository} from "../billing-cycle/billing-cycle.repository";
import {calculateTrueReading, resolveVersionsSource} from "../reading/reading.util";
import {billAmount, sumMoney} from "../../utils/money.util";
import type {LlmToolDefinition} from "../../lib/llm.lib";
import type {Reading} from "../reading/reading.model";
import type {Property} from "../property/property.model";
import type {BillingCycle} from "../billing-cycle/billing-cycle.model";

const DEFAULT_SPIKE_MULTIPLIER = 5; // same threshold as the reading anomaly guard
const MAX_PROPERTIES_SCANNED = 1000;
const MAX_METER_GROUPS_SCANNED = 1000;

export interface TargetSelector {
  propertyNames?: string[]; // omit for all properties
  meterGroupName?: string; // scopes the search to a single meter group by name
  utilityType: UtilityType;
}

/**
 * Resolve which properties a tool call applies to, and (when meterGroupName is
 * given) which single meter group to restrict readings/billings to. Omitting
 * both propertyNames and meterGroupName means "all of the user's properties"
 * (portfolio-wide), matching how /reports/consumption already treats an
 * unfiltered query. Users only ever see room_name / meter_name in the UI,
 * never Firestore doc IDs, so lookups are name-based rather than requiring an
 * ID. propertyNames accepts multiple names in one call so multi-tenant
 * questions don't require one tool call per name.
 */
async function resolveSelection(
  selector: TargetSelector
): Promise<{properties: Property[]; restrictMeterGroupId?: string}> {
  if (selector.meterGroupName) {
    const meterGroup = await resolveMeterGroupByName(selector.meterGroupName);

    if (meterGroup.utility_type !== selector.utilityType) {
      throw new AppError(
        400,
        `Meter group "${selector.meterGroupName}" is a ${meterGroup.utility_type} meter, not ${selector.utilityType}`
      );
    }

    let properties = await propertiesOnMeterGroup(meterGroup.id);

    if (selector.propertyNames && selector.propertyNames.length > 0) {
      const normalizedTargets = new Set(selector.propertyNames.map((n) => n.trim().toLowerCase()));
      properties = properties.filter((p) => normalizedTargets.has(p.room_name.trim().toLowerCase()));

      if (properties.length === 0) {
        throw new AppError(
          404,
          `None of the given property names are on meter group "${selector.meterGroupName}"`
        );
      }
    }

    return {properties, restrictMeterGroupId: meterGroup.id};
  }

  return {properties: await resolvePropertiesByNames(selector.propertyNames)};
}

async function resolvePropertiesByNames(propertyNames?: string[]): Promise<Property[]> {
  const {data} = await propertyRepository.search({
    limit: MAX_PROPERTIES_SCANNED,
    orderBy: "created_at",
    archived: false,
  });

  if (!propertyNames || propertyNames.length === 0) return data;

  const normalizedTargets = propertyNames.map((n) => n.trim().toLowerCase());
  const matches = data.filter((p) => normalizedTargets.includes(p.room_name.trim().toLowerCase()));

  const matchedNames = new Set(matches.map((p) => p.room_name.trim().toLowerCase()));
  const missing = propertyNames.filter((n) => !matchedNames.has(n.trim().toLowerCase()));

  if (missing.length > 0) {
    throw new AppError(404, `No property found matching: ${missing.join(", ")}`);
  }

  return matches;
}

async function resolveMeterGroupByName(meterGroupName: string) {
  const {data} = await meterGroupRepository.search({
    limit: MAX_METER_GROUPS_SCANNED,
    orderBy: "created_at",
    archived: false,
  });

  const normalized = meterGroupName.trim().toLowerCase();
  const match = data.find((mg) => mg.meter_name.trim().toLowerCase() === normalized);

  if (!match) {
    throw new AppError(404, `No meter group found matching "${meterGroupName}"`);
  }

  return match;
}

async function propertiesOnMeterGroup(meterGroupId: string): Promise<Property[]> {
  const {data} = await propertyRepository.search({
    limit: MAX_PROPERTIES_SCANNED,
    orderBy: "created_at",
    archived: false,
  });

  const matches = data.filter((p) => Object.values(p.meter_groups).some((e) => e.meter_group_id === meterGroupId));

  if (matches.length === 0) {
    throw new AppError(404, "No properties are attached to this meter group");
  }

  return matches;
}

/**
 * Meter group IDs on a property matching a given utility type. When
 * restrictMeterGroupId is set (a meterGroupName selector was used), it takes
 * precedence over the utility-type scan so a property with multiple
 * same-utility meter groups isn't ambiguously widened back out.
 */
async function meterGroupIdsForProperty(
  property: Property,
  utilityType: UtilityType,
  restrictMeterGroupId?: string
): Promise<string[]> {
  const meterGroupIds = Object.values(property.meter_groups).map((e) => e.meter_group_id);

  if (restrictMeterGroupId) {
    return meterGroupIds.includes(restrictMeterGroupId) ? [restrictMeterGroupId] : [];
  }

  const meterGroups = await meterGroupRepository.getByIds(meterGroupIds);

  return meterGroups
    .filter((mg): mg is NonNullable<typeof mg> => mg !== null && mg.utility_type === utilityType)
    .map((mg) => mg.id);
}

/** Accepts a date-only string ("2025-05-03") or a full ISO datetime; date-only start/end anchor to that day's UTC bounds. */
function startOfDayUtc(dateStr: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00.000Z` : dateStr;
  return new Date(iso);
}

function endOfDayUtc(dateStr: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T23:59:59.999Z` : dateStr;
  return new Date(iso);
}

async function fetchReadingsInRange(
  propertyId: string,
  meterGroupIds: string[],
  startDate: string,
  endDate: string
): Promise<Reading[]> {
  if (meterGroupIds.length === 0) return [];

  const {data} = await readingRepository.search({
    limit: 1000,
    orderBy: "reading_date",
    orderDirection: "asc",
    filters: {
      property_id: propertyId,
      reading_date: {$gte: startOfDayUtc(startDate), $lte: endOfDayUtc(endDate)},
    },
  });

  const meterGroupIdSet = new Set(meterGroupIds);
  return data.filter((r) => meterGroupIdSet.has(r.meter_group_id));
}

export interface GetUsageHistoryArgs extends TargetSelector {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
}

export async function getUsageHistory(args: GetUsageHistoryArgs) {
  const {properties, restrictMeterGroupId} = await resolveSelection(args);

  const properties_data = await Promise.all(properties.map(async (property) => {
    const meterGroupIds = await meterGroupIdsForProperty(property, args.utilityType, restrictMeterGroupId);
    const readings = await fetchReadingsInRange(property.id, meterGroupIds, args.startDate, args.endDate);
    return {
      propertyName: property.room_name,
      readings: readings.map((r) => ({
        date: r.reading_date.toDate().toISOString(),
        reading_amount: r.reading_amount,
      })),
    };
  }));

  return {utilityType: args.utilityType, properties: properties_data};
}

export interface GetAccumulatedTotalsArgs extends TargetSelector {
  startDate: string;
  endDate: string;
}

async function accumulatedTotalForProperty(
  property: Property,
  utilityType: UtilityType,
  startDate: string,
  endDate: string,
  restrictMeterGroupId?: string
): Promise<{propertyName: string; totalConsumption: number; readingCount: number}> {
  const meterGroupIds = await meterGroupIdsForProperty(property, utilityType, restrictMeterGroupId);
  const readings = await fetchReadingsInRange(property.id, meterGroupIds, startDate, endDate);

  if (readings.length < 2) {
    return {propertyName: property.room_name, totalConsumption: 0, readingCount: readings.length};
  }

  const meterGroups = await meterGroupRepository.getByIds(meterGroupIds);
  const meterGroupMap = new Map(meterGroups.filter((mg): mg is NonNullable<typeof mg> => mg !== null).map((mg) => [mg.id, mg]));

  const first = readings[0];
  const last = readings[readings.length - 1];
  const versionsSource = resolveVersionsSource(meterGroupMap.get(last.meter_group_id), property, last.meter_group_id);
  const totalConsumption = calculateTrueReading(last, versionsSource) - calculateTrueReading(first, versionsSource);

  return {
    propertyName: property.room_name,
    totalConsumption: Math.round(totalConsumption * 100) / 100,
    readingCount: readings.length,
  };
}

export async function getAccumulatedTotals(args: GetAccumulatedTotalsArgs) {
  const {properties, restrictMeterGroupId} = await resolveSelection(args);

  const properties_data = await Promise.all(
    properties.map((property) =>
      accumulatedTotalForProperty(property, args.utilityType, args.startDate, args.endDate, restrictMeterGroupId)
    )
  );

  const grandTotal = Math.round(properties_data.reduce((sum, p) => sum + p.totalConsumption, 0) * 100) / 100;

  return {utilityType: args.utilityType, properties: properties_data, grandTotal};
}

export interface DetectSpikesArgs extends TargetSelector {
  threshold?: number;
}

async function spikesForProperty(
  property: Property,
  utilityType: UtilityType,
  multiplier: number,
  restrictMeterGroupId?: string
): Promise<{propertyName: string; spikes: {date: string; delta: number; averageDelta: number}[]}> {
  const meterGroupIds = await meterGroupIdsForProperty(property, utilityType, restrictMeterGroupId);
  if (meterGroupIds.length === 0) {
    return {propertyName: property.room_name, spikes: []};
  }

  const {data: recentReadings} = await readingRepository.search({
    limit: 6,
    orderBy: "reading_date",
    orderDirection: "desc",
    filters: {property_id: property.id, meter_group_id: meterGroupIds[0]},
  });

  if (recentReadings.length < 3) {
    return {propertyName: property.room_name, spikes: []};
  }

  const deltas: number[] = [];
  for (let i = 0; i < recentReadings.length - 1; i++) {
    const delta = recentReadings[i].reading_amount - recentReadings[i + 1].reading_amount;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) {
    return {propertyName: property.room_name, spikes: []};
  }

  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const spikes = [];
  for (let i = 0; i < recentReadings.length - 1; i++) {
    const curr = recentReadings[i];
    const prev = recentReadings[i + 1];
    const delta = curr.reading_amount - prev.reading_amount;
    if (delta > multiplier * avgDelta) {
      spikes.push({
        date: curr.reading_date.toDate().toISOString(),
        delta,
        averageDelta: Math.round(avgDelta * 100) / 100,
      });
    }
  }

  return {propertyName: property.room_name, spikes};
}

export async function detectSpikes(args: DetectSpikesArgs) {
  const {properties, restrictMeterGroupId} = await resolveSelection(args);
  const multiplier = args.threshold ?? DEFAULT_SPIKE_MULTIPLIER;

  const properties_data = await Promise.all(
    properties.map((property) => spikesForProperty(property, args.utilityType, multiplier, restrictMeterGroupId))
  );

  return {utilityType: args.utilityType, properties: properties_data};
}

/** Billing cycles whose full period (start and end) falls within [startDate, endDate]. */
async function fetchCyclesInRange(startDate: string, endDate: string): Promise<BillingCycle[]> {
  const {data} = await billingCycleRepository.search({
    limit: 1000,
    orderBy: "billing_start_date",
    archived: false,
    filters: {billing_start_date: {$gte: startOfDayUtc(startDate)}},
  });

  const end = endOfDayUtc(endDate);
  return data.filter((c) => c.billing_end_date.toDate() <= end);
}

async function billingCostForProperty(
  property: Property,
  meterGroupIds: string[],
  cycles: BillingCycle[]
): Promise<{propertyName: string; consumption: number; cost: number}> {
  if (meterGroupIds.length === 0) {
    return {propertyName: property.room_name, consumption: 0, cost: 0};
  }

  const meterGroupIdSet = new Set(meterGroupIds);
  const relevantCycles = cycles.filter((c) => meterGroupIdSet.has(c.meter_group_id));
  if (relevantCycles.length === 0) {
    return {propertyName: property.room_name, consumption: 0, cost: 0};
  }

  const billingIdToCycle = new Map<string, BillingCycle>();
  relevantCycles.forEach((cycle) => {
    Object.keys(cycle.billing_ids).forEach((billingId) => billingIdToCycle.set(billingId, cycle));
  });

  const billings = await billingRepository.getByIds(Array.from(billingIdToCycle.keys()));

  let consumption = 0;
  const costs: number[] = [];

  billings.forEach((billing) => {
    if (!billing || billing.property_id !== property.id) return;
    const cycle = billingIdToCycle.get(billing.id);
    if (!cycle) return;

    const billedConsumption = cycle.billing_ids[billing.id] ?? 0;
    consumption += billedConsumption;
    costs.push(billAmount(billedConsumption, cycle.billing_rate));
  });

  return {
    propertyName: property.room_name,
    consumption: Math.round(consumption * 100) / 100,
    cost: sumMoney(costs),
  };
}

export interface GetBillingCostArgs extends TargetSelector {
  startDate: string;
  endDate: string;
}

/**
 * Actual peso cost (consumption × the billing cycle's rate), not raw
 * consumption units. get_accumulated_totals returns units only — this is the
 * tool to call whenever the user asks about price/cost/bill amount.
 */
export async function getBillingCost(args: GetBillingCostArgs) {
  const {properties, restrictMeterGroupId} = await resolveSelection(args);
  const cycles = await fetchCyclesInRange(args.startDate, args.endDate);

  const properties_data = await Promise.all(properties.map(async (property) => {
    const meterGroupIds = await meterGroupIdsForProperty(property, args.utilityType, restrictMeterGroupId);
    return billingCostForProperty(property, meterGroupIds, cycles);
  }));

  const grandTotalConsumption = Math.round(properties_data.reduce((sum, p) => sum + p.consumption, 0) * 100) / 100;
  const grandTotalCost = sumMoney(properties_data.map((p) => p.cost));

  return {
    utilityType: args.utilityType,
    currency: "PHP",
    properties: properties_data,
    grandTotalConsumption,
    grandTotalCost,
  };
}

const propertyNamesParam = {
  type: "array",
  items: {type: "string"},
  description:
    "One or more property names as shown to the user (Property.room_name). Pass every name the " +
    "user asked about in a single call instead of calling the tool once per name. Omit to include " +
    "all of the user's properties.",
};

const meterGroupNameParam = {
  type: "string",
  description:
    "Meter group name (MeterGroup.meter_name) to scope the query to. Combine with propertyNames to " +
    "narrow further within that meter group. Omit to search across all meter groups.",
};

const utilityTypeParam = {
  type: "string",
  enum: Object.values(UTILITY_TYPES),
  description: "Utility type — electricity or water",
};

export const chatbotToolDefinitions: LlmToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_usage_history",
      description: "Get raw meter reading history for a utility type within a date range, for named properties, a meter group, or all properties.",
      parameters: {
        type: "object",
        properties: {
          propertyNames: propertyNamesParam,
          meterGroupName: meterGroupNameParam,
          utilityType: utilityTypeParam,
          startDate: {type: "string", format: "date", description: "Start of range, YYYY-MM-DD"},
          endDate: {type: "string", format: "date", description: "End of range, YYYY-MM-DD"},
        },
        required: ["utilityType", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_accumulated_totals",
      description: "Get total consumption (in usage units, not currency) for a utility type across a date range, accounting for meter resets, for named properties, a meter group, or all properties.",
      parameters: {
        type: "object",
        properties: {
          propertyNames: propertyNamesParam,
          meterGroupName: meterGroupNameParam,
          utilityType: utilityTypeParam,
          startDate: {type: "string", format: "date", description: "Start of range, YYYY-MM-DD"},
          endDate: {type: "string", format: "date", description: "End of range, YYYY-MM-DD"},
        },
        required: ["utilityType", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_billing_cost",
      description: "Get the actual peso cost (consumption x billing rate from the relevant billing cycles) for a utility type across a date range, for named properties, a meter group, or all properties. Use this whenever the user asks about price, cost, or bill amount — not get_accumulated_totals, which only returns unit counts.",
      parameters: {
        type: "object",
        properties: {
          propertyNames: propertyNamesParam,
          meterGroupName: meterGroupNameParam,
          utilityType: utilityTypeParam,
          startDate: {type: "string", format: "date", description: "Start of range, YYYY-MM-DD"},
          endDate: {type: "string", format: "date", description: "End of range, YYYY-MM-DD"},
        },
        required: ["utilityType", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_spikes",
      description: "Detect anomalous consumption spikes in recent meter readings for a utility type, for named properties, a meter group, or all properties.",
      parameters: {
        type: "object",
        properties: {
          propertyNames: propertyNamesParam,
          meterGroupName: meterGroupNameParam,
          utilityType: utilityTypeParam,
          threshold: {
            type: "number",
            description: "Multiplier over the rolling average delta to flag as a spike (default 5)",
          },
        },
        required: ["utilityType"],
      },
    },
  },
];

export const chatbotToolHandlers: Record<string, (args: any) => Promise<unknown>> = {
  get_usage_history: getUsageHistory,
  get_accumulated_totals: getAccumulatedTotals,
  get_billing_cost: getBillingCost,
  detect_spikes: detectSpikes,
};
