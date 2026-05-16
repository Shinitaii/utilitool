import {Timestamp} from "firebase-admin/firestore";
import {AppError} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {tenantRepository} from "./tenant.repository";
import {CreateTenantDTO, UpdateTenantDTO} from "./tenant.dto";
import {Tenant} from "./tenant.model";
import {TenantValidator} from "./tenant.validator";

const validator = new TenantValidator();

type TenantSearchOptions = {
  tenantName?: string;
  propertyId?: string;
  limit: number;
  cursor?: string | null;
};

export const tenantService = {
  async create(data: CreateTenantDTO): Promise<Tenant> {
    await validator.validateCreate(data);

    return tenantRepository.create({
      ...data,
      tenant_start_date: Timestamp.now(),
    });
  },

  async createBatch(data: CreateTenantDTO[]): Promise<Tenant[]> {
    await validator.validateBatchCreate(data);

    return tenantRepository.createBatch(
      data.map((item) => ({
        ...item,
        tenant_start_date: Timestamp.now(),
      }))
    );
  },

  async getById(id: string): Promise<Tenant | null> {
    return tenantRepository.getById(id);
  },

  async search(options: TenantSearchOptions): Promise<PaginatedResult<Tenant>> {
    return tenantRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      filters: {
        ...(options.tenantName ? {tenant_name: options.tenantName} : {}),
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async update(id: string, data: UpdateTenantDTO): Promise<Tenant> {
    const tenant = await tenantRepository.getById(id);

    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    await validator.validateUpdate(tenant, data);
    return tenantRepository.update(id, data);
  },

  async updateBatch(updates: { id: string; data: UpdateTenantDTO }[]): Promise<Tenant[]> {
    await validator.validateBatchUpdate(updates);

    const results: Tenant[] = [];
    for (const update of updates) {
      results.push(await tenantRepository.update(update.id, update.data));
    }

    return results;
  },

  async delete(id: string): Promise<void> {
    const tenant = await tenantRepository.getById(id);

    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    await tenantRepository.delete(id);
  },

  async softDelete(id: string): Promise<Tenant> {
    const tenant = await tenantRepository.getById(id);

    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    return tenantRepository.softDelete(id);
  },
};
