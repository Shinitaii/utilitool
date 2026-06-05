import {billingCycleRepository} from "./billing-cycle.repository";
import {BillingCycle} from "./billing-cycle.model";
import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingCycleValidator} from "./billing-cycle.validator";
import {AppError} from "../../utils/error.util";
import {propertyService} from "../property/property.service";
import {readingService} from "../reading/reading.service";
import {billingRepository} from "../billing/billing.repository";
import {findPreviousMonthReading, findCurrentMonthReading} from "../reading/reading.util";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";

const validator = new BillingCycleValidator();
const CACHE_TTL = 15 * 60; // 15 minutes

async function injectMainMeterBilling(
  userId: string,
  data: CreateBillingCycleDTO
): Promise<CreateBillingCycleDTO> {
  // limit: 1000 — meter groups are not expected to exceed this property count
  const allProperties = await propertyService.search(userId, {
    meterGroupId: data.meter_group_id,
    limit: 1000,
  });

  const mainMeterProperty = allProperties.data.find((p) =>
    Object.values(p.meter_groups).some(
      (e) => e.meter_group_id === data.meter_group_id && e.is_main_meter
    )
  );

  if (!mainMeterProperty) return data;

  const submeterTotal = Object.values(data.billing_ids).reduce(
    (sum, c) => sum + c,
    0
  );
  const derivedConsumption = data.billing_consumption - submeterTotal;

  const prevReading = await findPreviousMonthReading(
    data.meter_group_id,
    mainMeterProperty.id,
    data.billing_end_date
  );

  if (!prevReading) {
    throw new AppError(
      400,
      `Main meter property "${mainMeterProperty.id}" has no seed reading. ` +
        "Record a baseline reading via POST /readings/seed before creating this billing cycle."
    );
  }

  const derivedReadingAmount =
    prevReading.data.reading_amount + derivedConsumption;

  // Passes through readingService.create() — anomaly guard and duplicate-month check
  // apply to the derived reading. If the derived amount triggers the 5× anomaly
  // threshold (e.g. after meter replacement in the billing period), this will throw 422.
  // Operators should reset the meter group before creating the billing cycle.
  let derivedReading;
  try {
    derivedReading = await readingService.create(userId, {
      meter_group_id: data.meter_group_id,
      property_id: mainMeterProperty.id,
      reading_amount: derivedReadingAmount,
      reading_date: data.billing_end_date,
    });
  } catch (err) {
    if (!(err instanceof AppError) || err.statusCode !== 409) {
      throw err;
    }

    const existing = await findCurrentMonthReading(
      data.meter_group_id,
      mainMeterProperty.id,
      data.billing_end_date
    );
    if (!existing) throw err;

    const existingSnap = await firestore.collection(COLLECTIONS.READINGS).doc(existing.id).get();
    derivedReading = snapshotToModel(existingSnap);
  }

  const {data: billings} = await billingRepository.search({
    limit: 1,
    orderBy: "created_at",
    filters: {current_reading_id: derivedReading.id},
  });

  if (!billings.length) {
    throw new AppError(
      400,
      `Main meter reading was recorded but no billing was auto-created. ` +
        `Create it manually: POST /billings { property_id: "${mainMeterProperty.id}", ` +
        `previous_reading_id: "${prevReading.id}", current_reading_id: "${derivedReading.id}" }, ` +
        "then retry this billing cycle."
    );
  }

  return {
    ...data,
    billing_ids: {
      ...data.billing_ids,
      [billings[0].id]: derivedConsumption,
    },
  };
}

type BillingCycleSearchOptions = {
  billingStartDate?: string;
  billingEndDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingCycleService = {
  async create(userId: string, data: CreateBillingCycleDTO): Promise<BillingCycle> {
    const enrichedData = await injectMainMeterBilling(userId, data);
    await validator.validateCreate(enrichedData);
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.create(enrichedData);
  },

  async createBatch(userId: string, data: CreateBillingCycleDTO[]): Promise<BillingCycle[]> {
    const seenMeterGroups = new Set<string>();
    for (const item of data) {
      if (item.meter_group_id) {
        if (seenMeterGroups.has(item.meter_group_id)) {
          throw new AppError(
            400,
            `Duplicate meter_group_id "${item.meter_group_id}" in batch. ` +
            "Each billing cycle in a batch must be for a different meter group."
          );
        }
        seenMeterGroups.add(item.meter_group_id);
      }
    }
    const enriched = await Promise.all(data.map((item) => injectMainMeterBilling(userId, item)));
    await validator.validateBatch(enriched);
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.createBatch(enriched);
  },

  async search(
    userId: string,
    options: BillingCycleSearchOptions
  ): Promise<PaginatedResult<BillingCycle>> {
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);

    // For archived queries, we need custom date filtering
    if (options.archived) {
      const filters: Record<string, any> = {};
      if (options.billingStartDate) {
        filters.billing_start_date = {gte: new Date(options.billingStartDate)};
      }
      if (options.billingEndDate) {
        filters.billing_end_date = {lte: new Date(options.billingEndDate)};
      }
      return billingCycleRepository.search({
        limit: options.limit,
        orderBy: (options.sortBy ?? "created_at") as any,
        orderDirection: options.sortOrder ?? "desc",
        cursor: options.cursor,
        archived: true,
        filters,
      });
    }

    // Load active items via cache and apply date filters in memory
    const result = await cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: false,
      filters: {},
    });

    // Post-filter for date ranges (can't query dates directly in Firestore query)
    if (options.billingStartDate || options.billingEndDate) {
      if (options.billingStartDate) {
        const startDate = new Date(options.billingStartDate);
        result.data = result.data.filter((bc) => {
          const bcDate = bc.billing_start_date instanceof Date ? bc.billing_start_date : new Date(bc.billing_start_date as any);
          return bcDate >= startDate;
        });
      }
      if (options.billingEndDate) {
        const endDate = new Date(options.billingEndDate);
        result.data = result.data.filter((bc) => {
          const bcDate = bc.billing_end_date instanceof Date ? bc.billing_end_date : new Date(bc.billing_end_date as any);
          return bcDate <= endDate;
        });
      }
    }

    return result;
  },

  async getById(userId: string, id: string): Promise<BillingCycle | null> {
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async update(
    userId: string,
    id: string,
    data: Partial<CreateBillingCycleDTO>
  ): Promise<BillingCycle> {
    await validator.validateUpdate(data);
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateBillingCycleDTO>}[]): Promise<BillingCycle[]> {
    await validator.validateUpdateBatch(updates);
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<BillingCycle> {
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.softDelete(id);
  },

  async restore(userId: string, id: string): Promise<BillingCycle> {
    const billingCycle = await billingCycleRepository.getById(id);
    if (!billingCycle) {
      throw new AppError(404, "Billing cycle not found");
    }
    const cachedRepo = new CachedRepository(billingCycleRepository, userId, "billing-cycles", CACHE_TTL);
    return cachedRepo.restore(id);
  },
};
