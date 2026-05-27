import {Timestamp} from "firebase-admin/firestore";
import {AppError} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {tenantRepository} from "./tenant.repository";
import {CreateTenantDTO, UpdateTenantDTO} from "./tenant.dto";
import {Tenant} from "./tenant.model";
import {TenantValidator} from "./tenant.validator";
import {CachedRepository} from "../../lib/cached-repository.lib";

const validator = new TenantValidator();
const CACHE_TTL = 20 * 60; // 20 minutes

type TenantSearchOptions = {
  tenantName?: string;
  propertyId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const tenantService = {
  async create(userId: string, data: CreateTenantDTO): Promise<Tenant> {
    await validator.validateCreate(data);
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.create({
      ...data,
      tenant_start_date: Timestamp.now(),
    });
  },

  async createBatch(userId: string, data: CreateTenantDTO[]): Promise<Tenant[]> {
    await validator.validateBatchCreate(data);
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.createBatch(
      data.map((item) => ({
        ...item,
        tenant_start_date: Timestamp.now(),
      }))
    );
  },

  async getById(userId: string, id: string): Promise<Tenant | null> {
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async search(userId: string, options: TenantSearchOptions): Promise<PaginatedResult<Tenant>> {
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.tenantName ? { tenant_name: options.tenantName } : {}),
        ...(options.propertyId ? { property_id: options.propertyId } : {}),
      },
    });
  },

  async update(userId: string, id: string, data: UpdateTenantDTO): Promise<Tenant> {
    const tenant = await tenantRepository.getById(id);
    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    await validator.validateUpdate(tenant, data);
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: { id: string; data: UpdateTenantDTO }[]): Promise<Tenant[]> {
    await validator.validateBatchUpdate(updates);
    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const tenant = await tenantRepository.getById(id);
    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Tenant> {
    const tenant = await tenantRepository.getById(id);
    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.softDelete(id);
  },

  async restore(userId: string, id: string): Promise<Tenant> {
    const tenant = await tenantRepository.getById(id);
    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    const cachedRepo = new CachedRepository(tenantRepository, userId, 'tenants', CACHE_TTL);
    return cachedRepo.restore(id);
  },
};
