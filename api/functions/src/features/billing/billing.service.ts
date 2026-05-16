import {billingRepository} from "./billing.repository";
import {Billing} from "./billing.model";
import {CreateBillingDTO} from "./billing.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingValidator} from "./billing.validator";

const validator = new BillingValidator();

type BillingSearchOptions = {
  propertyId?: string;
  limit: number;
  cursor?: string | null;
};

export const billingService = {
  async create(data: CreateBillingDTO): Promise<Billing> {
    await validator.validateCreate(data);
    return billingRepository.create(data);
  },

  async createBatch(data: CreateBillingDTO[]): Promise<Billing[]> {
    await validator.validateBatch(data);
    return billingRepository.createBatch(data);
  },

  async search(options: BillingSearchOptions): Promise<PaginatedResult<Billing>> {
    return billingRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      filters: {
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async getById(id: string): Promise<Billing | null> {
    return billingRepository.getById(id);
  },

  async update(id: string, data: Partial<CreateBillingDTO>): Promise<Billing> {
    await validator.validateUpdate(data);
    return billingRepository.update(id, data);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateBillingDTO>}[]): Promise<Billing[]> {
    await validator.validateUpdateBatch(updates);
    return billingRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    return billingRepository.delete(id);
  },

  async softDelete(id: string): Promise<Billing> {
    return billingRepository.softDelete(id);
  },
};
