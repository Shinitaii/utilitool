import {Timestamp} from "firebase-admin/firestore";
import {AppError, getOrThrow} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {tenantRepository} from "./tenant.repository";
import {CreateTenantDTO, UpdateTenantDTO} from "./tenant.dto";
import {Tenant} from "./tenant.model";
import {TenantValidator} from "./tenant.validator";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {firestore} from "../../config/firebase.config";
import {collectionRef} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {Property} from "../property/property.model";

const validator = new TenantValidator();
const CACHE_TTL = 20 * 60; // 20 minutes

function repoFor(userId: string): CachedRepository<Tenant> {
  return new CachedRepository(tenantRepository, userId, "tenants", CACHE_TTL);
}

/**
 * Atomically re-checks the tenant-count cap and creates the tenant doc inside
 * one Firestore transaction. This closes the TOCTOU race where two concurrent
 * requests both read a stale (pre-write) count and both pass validation —
 * Firestore retries the transaction on write conflict, so a losing request
 * re-reads the updated count and throws the same capacity error instead of
 * a raw transaction-conflict error.
 */
async function createTenantWithCapacityCheck(
  propertyId: string,
  tenantAmount: number,
  data: CreateTenantDTO
): Promise<Tenant> {
  return firestore.runTransaction(async (txn) => {
    const tenantsQuery = collectionRef(COLLECTIONS.TENANTS)
      .where("property_id", "==", propertyId)
      .where("is_deleted", "==", false);
    const snap = await txn.get(tenantsQuery);

    if (snap.size >= tenantAmount) {
      throw new AppError(409, "Property has reached the maximum number of tenants allowed");
    }

    const docRef = collectionRef(COLLECTIONS.TENANTS).doc();
    const now = Timestamp.now();
    const tenant = {
      ...data,
      id: docRef.id,
      tenant_start_date: now,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    } as unknown as Tenant;

    txn.set(docRef, tenant);
    return tenant;
  });
}

/**
 * Atomically re-checks the tenant-count cap for the destination property and
 * applies the update inside one Firestore transaction. Same race-closing
 * rationale as createTenantWithCapacityCheck.
 */
async function updateTenantWithCapacityCheck(
  tenant: Tenant,
  newProperty: Property,
  data: UpdateTenantDTO
): Promise<Tenant> {
  return firestore.runTransaction(async (txn) => {
    const tenantsQuery = collectionRef(COLLECTIONS.TENANTS)
      .where("property_id", "==", newProperty.id)
      .where("is_deleted", "==", false);
    const snap = await txn.get(tenantsQuery);

    if (snap.size >= newProperty.tenant_amount) {
      throw new AppError(409, "Property has reached the maximum number of tenants allowed");
    }

    const tenantRef = collectionRef(COLLECTIONS.TENANTS).doc(tenant.id);
    const now = Timestamp.now();
    const updateData = {...data, updated_at: now};
    txn.update(tenantRef, updateData);

    return {...tenant, ...updateData} as Tenant;
  });
}

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
    const property = await validator.validateCreate(data);
    const tenant = await createTenantWithCapacityCheck(data.property_id, property.tenant_amount, data);

    await repoFor(userId).cacheCreatedItem(tenant);

    return tenant;
  },

  async createBatch(userId: string, data: CreateTenantDTO[]): Promise<Tenant[]> {
    const propertyMap = await validator.validateBatchCreate(data);
    const cachedRepo = repoFor(userId);

    // Sequential, one transaction per item (not a single batch write): each item
    // re-checks the tenant-count cap for its property inside its own transaction,
    // the same race-closing pattern as create(). Sequential because Firestore
    // transactions can't safely interleave reads/writes for multiple properties
    // in one transaction, and later items in the same request must see earlier
    // items' writes when they share a property.
    const results: Tenant[] = [];
    for (const item of data) {
      const property = propertyMap.get(item.property_id)!;
      const tenant = await createTenantWithCapacityCheck(item.property_id, property.tenant_amount, item);
      await cachedRepo.cacheCreatedItem(tenant);
      results.push(tenant);
    }

    return results;
  },

  async getById(userId: string, id: string): Promise<Tenant | null> {
    return repoFor(userId).getById(id);
  },

  async search(userId: string, options: TenantSearchOptions): Promise<PaginatedResult<Tenant>> {
    return repoFor(userId).search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.tenantName ? {tenant_name: options.tenantName} : {}),
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async update(userId: string, id: string, data: UpdateTenantDTO): Promise<Tenant> {
    const tenant = await getOrThrow(tenantRepository.getById.bind(tenantRepository), id, "Tenant");

    const newProperty = await validator.validateUpdate(tenant, data);
    const cachedRepo = repoFor(userId);

    if (newProperty) {
      const updated = await updateTenantWithCapacityCheck(tenant, newProperty, data);
      await cachedRepo.cacheUpdatedItem(updated);
      return updated;
    }

    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: { id: string; data: UpdateTenantDTO }[]): Promise<Tenant[]> {
    const transferMap = await validator.validateBatchUpdate(updates);
    const cachedRepo = repoFor(userId);

    const results: Tenant[] = new Array(updates.length);
    const nonTransferUpdates: { id: string; data: UpdateTenantDTO }[] = [];
    const nonTransferIndexes: number[] = [];

    for (let i = 0; i < updates.length; i++) {
      const {id, data} = updates[i];
      const transfer = transferMap.get(id);

      if (transfer) {
        const updated = await updateTenantWithCapacityCheck(transfer.tenant, transfer.newProperty, data);
        await cachedRepo.cacheUpdatedItem(updated);
        results[i] = updated;
      } else {
        nonTransferUpdates.push({id, data});
        nonTransferIndexes.push(i);
      }
    }

    if (nonTransferUpdates.length > 0) {
      const updatedBatch = await cachedRepo.updateBatch(nonTransferUpdates);
      nonTransferIndexes.forEach((idx, j) => {
        results[idx] = updatedBatch[j];
      });
    }

    return results;
  },

  async delete(userId: string, id: string): Promise<void> {
    await getOrThrow(tenantRepository.getById.bind(tenantRepository), id, "Tenant");
    await repoFor(userId).delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Tenant> {
    await getOrThrow(tenantRepository.getById.bind(tenantRepository), id, "Tenant");
    return repoFor(userId).softDelete(id);
  },

  async restore(userId: string, id: string): Promise<Tenant> {
    await getOrThrow(tenantRepository.getById.bind(tenantRepository), id, "Tenant");
    return repoFor(userId).restore(id);
  },

  /**
   * Permanently delete an already-archived tenant. Second step of the
   * archive-then-purge lifecycle — throws 409 if the tenant is still active.
   */
  async purge(userId: string, id: string): Promise<void> {
    await repoFor(userId).purge(id);
  },
};
