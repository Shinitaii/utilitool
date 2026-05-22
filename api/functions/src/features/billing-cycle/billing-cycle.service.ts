import {billingCycleRepository} from "./billing-cycle.repository";
import {BillingCycle} from "./billing-cycle.model";
import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingCycleValidator} from "./billing-cycle.validator";
import {AppError} from "../../utils/error.util";
import {propertyService} from "../property/property.service";
import {readingService} from "../reading/reading.service";
import {billingRepository} from "../billing/billing.repository";
import {findPreviousMonthReading} from "../reading/reading.util";

const validator = new BillingCycleValidator();

async function injectMainMeterBilling(
  data: CreateBillingCycleDTO
): Promise<CreateBillingCycleDTO> {
  const allProperties = await propertyService.search({
    meterGroupId: data.meter_group_id,
    limit: 100,
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
        `Record a baseline reading via POST /readings/seed before creating this billing cycle.`
    );
  }

  const derivedReadingAmount =
    prevReading.data.reading_amount + derivedConsumption;

  const derivedReading = await readingService.create({
    meter_group_id: data.meter_group_id,
    property_id: mainMeterProperty.id,
    reading_amount: derivedReadingAmount,
    reading_date: data.billing_end_date,
  });

  const {data: billings} = await billingRepository.search({
    limit: 1,
    orderBy: "created_at",
    filters: {current_reading_id: derivedReading.id},
  });

  if (!billings.length) {
    throw new AppError(
      500,
      "Failed to auto-create billing for main meter property. " +
        "Ensure the main meter property has a seed reading from a prior month."
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
  async create(data: CreateBillingCycleDTO): Promise<BillingCycle> {
    const enrichedData = await injectMainMeterBilling(data);
    await validator.validateCreate(enrichedData);
    return billingCycleRepository.create(enrichedData);
  },

  async createBatch(data: CreateBillingCycleDTO[]): Promise<BillingCycle[]> {
    const enriched = await Promise.all(data.map(injectMainMeterBilling));
    await validator.validateBatch(enriched);
    return billingCycleRepository.createBatch(enriched);
  },

  async search(
    options: BillingCycleSearchOptions
  ): Promise<PaginatedResult<BillingCycle>> {
    const filters: Record<string, any> = {};
    if (options.billingStartDate) {
      filters.billing_start_date = { gte: new Date(options.billingStartDate) };
    }
    if (options.billingEndDate) {
      filters.billing_end_date = { lte: new Date(options.billingEndDate) };
    }
    return billingCycleRepository.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters,
    });
  },

  async getById(id: string): Promise<BillingCycle | null> {
    return billingCycleRepository.getById(id);
  },

  async update(
    id: string,
    data: Partial<CreateBillingCycleDTO>
  ): Promise<BillingCycle> {
    await validator.validateUpdate(data);
    return billingCycleRepository.update(id, data);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateBillingCycleDTO>}[]): Promise<BillingCycle[]> {
    await validator.validateUpdateBatch(updates);
    return billingCycleRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    return billingCycleRepository.delete(id);
  },

  async softDelete(id: string): Promise<BillingCycle> {
    return billingCycleRepository.softDelete(id);
  },

  async restore(id: string): Promise<BillingCycle> {
    const billingCycle = await billingCycleRepository.getById(id);
    if (!billingCycle) {
      throw new AppError(404, "Billing cycle not found");
    }
    return billingCycleRepository.restore(id);
  },
};
