import {billingCycleRepository} from "./billing-cycle.repository";
import {BillingCycle} from "./billing-cycle.model";
import {CreateBillingCycleDTO} from "./billing-cycle.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingCycleValidator} from "./billing-cycle.validator";
import {AppError} from "../../utils/error.util";

const validator = new BillingCycleValidator();

type BillingCycleSearchOptions = {
  billingStartDate?: string;
  billingEndDate?: string;
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingCycleService = {
  async create(data: CreateBillingCycleDTO): Promise<BillingCycle> {
    await validator.validateCreate(data);
    return billingCycleRepository.create(data);
  },

  async createBatch(data: CreateBillingCycleDTO[]): Promise<BillingCycle[]> {
    await validator.validateBatch(data);
    return billingCycleRepository.createBatch(data);
  },

  async search(
    options: BillingCycleSearchOptions
  ): Promise<PaginatedResult<BillingCycle>> {
    return billingCycleRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {},
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
