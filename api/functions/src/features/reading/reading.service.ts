import {readingRepository} from "./reading.repository";
import {Reading} from "./reading.model";
import {CreateReadingDTO} from "./reading.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {ReadingValidator} from "./reading.validator";
import {AppError} from "../../utils/error.util";
import {meterGroupRepository} from "../meter-group/meter-group.repository";
import {MeterGroup} from "../meter-group/meter-group.model";
import {cacheSet, cacheDel} from "../../utils/cache.util";
import {listRemove} from "../../utils/list-cache.util";
import {cascadeDeleteReading, cascadeRestoreReading} from "../../utils/cascade-delete.util";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {createReadingWithAutoBilling, createBatchReadingsWithAutoBilling, resolveMeterVersion} from "./reading.util";
import {propertyRepository} from "../property/property.repository";
import {Property} from "../property/property.model";
import {collectionRef} from "../../lib/firestore.lib";
import {snapshotToModel} from "../../utils/firestore.util";
import type {Query} from "firebase-admin/firestore";

const validator = new ReadingValidator();
const CACHE_TTL = 10 * 60; // 10 minutes

type ReadingCreatePayload = CreateReadingDTO & { meter_version: number };


type ReadingSearchOptions = {
  meterGroupId?: string;
  propertyId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const readingService = {
  /**
   * Create a reading. If a reading already exists in the previous calendar
   * month (Asia/Manila) for the same meter_group, this automatically creates
   * one billing per property that references this meter_group, atomically
   * inside a Firestore transaction.
   *
   * Auto-billing is a side effect, invisible to the caller. The duplicate
   * "one reading per meter_group per month" rule is enforced by the validator
   * (see ReadingValidator.validateMeterGroupConstraints), which prevents
   * duplicate auto-billings from arising in the first place.
   */
  async create(userId: string, data: CreateReadingDTO): Promise<Reading> {
    await validator.validateCreate(data);

    const meterGroup = await meterGroupRepository.getById(data.meter_group_id);
    const property = await propertyRepository.getById(data.property_id);
    const meter_version = resolveMeterVersion(property, data.meter_group_id, meterGroup);
    await validator.validateAnomalous(
      data.meter_group_id,
      data.reading_amount,
      meter_version,
      data.property_id
    );
    await validator.validateMeterRollback(
      data.meter_group_id,
      data.property_id,
      data.reading_amount,
      meter_version,
      data.reading_date
    );

    return createReadingWithAutoBilling(userId, data, meter_version);
  },

  /**
   * Batch create with simple auto-billing: for each reading, if a previous-month
   * reading exists for that meter group, create a billing automatically.
   * Uses atomic transactions per reading to ensure consistency.
   *
   * All validations (including meter rollback) are performed BEFORE any writes,
   * ensuring that if any reading fails validation, the entire batch fails atomically.
   */
  async createBatch(userId: string, data: CreateReadingDTO[]): Promise<Reading[]> {
    await validator.validateBatch(data);

    // Reject if any reading targets a main meter property — those are derived automatically
    const propertyIds = [...new Set(data.map((r) => r.property_id))];
    const propertyMap = new Map<string, Property>();
    for (const propertyId of propertyIds) {
      const property = await propertyRepository.getById(propertyId);
      if (property) propertyMap.set(propertyId, property);
    }

    for (const r of data) {
      const property = propertyMap.get(r.property_id);
      if (!property) continue;
      const entry = Object.values(property.meter_groups).find(
        (e) => e.meter_group_id === r.meter_group_id
      );
      if (entry?.is_main_meter) {
        throw new AppError(
          400,
          `Property ${r.property_id} is the main meter for meter group ${r.meter_group_id}. ` +
          "Its readings are derived automatically. Use POST /readings/seed for the first-time baseline."
        );
      }
    }

    const meterGroupIds = [...new Set(data.map((r) => r.meter_group_id))];
    const meterGroupMap = new Map<string, MeterGroup>();
    for (const mgId of meterGroupIds) {
      const mg = await meterGroupRepository.getById(mgId);
      if (mg) meterGroupMap.set(mgId, mg);
    }

    const readingsWithVersion: ReadingCreatePayload[] = data.map((r) => ({
      ...r,
      meter_version: resolveMeterVersion(propertyMap.get(r.property_id), r.meter_group_id, meterGroupMap.get(r.meter_group_id)),
    }));

    // Validate ALL readings for anomalies before any writes
    for (const r of readingsWithVersion) {
      await validator.validateAnomalous(r.meter_group_id, r.reading_amount, r.meter_version);
    }

    // Validate ALL readings for meter rollback before any writes
    // This ensures if ANY reading would violate meter rollback, the entire batch fails
    for (const r of readingsWithVersion) {
      await validator.validateMeterRollback(
        r.meter_group_id,
        r.property_id,
        r.reading_amount,
        r.meter_version,
        r.reading_date
      );
    }

    return createBatchReadingsWithAutoBilling(userId, readingsWithVersion);
  },

  async createSeed(userId: string, data: CreateReadingDTO): Promise<Reading> {
    await validator.validateSeedCreate(data);
    const meterGroup = await meterGroupRepository.getById(data.meter_group_id);
    const meter_version = meterGroup!.current_version ?? 1;
    const payload: ReadingCreatePayload = {...data, meter_version};
    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    return cachedRepo.create(payload);
  },

  async search(userId: string, options: ReadingSearchOptions): Promise<PaginatedResult<Reading>> {
    // If date range filters are present, use custom query logic
    if (options.startDate || options.endDate) {
      let query: Query = collectionRef("readings") as Query;

      if (options.meterGroupId) {
        query = query.where("meter_group_id", "==", options.meterGroupId);
      }
      if (options.propertyId) {
        query = query.where("property_id", "==", options.propertyId);
      }
      query = query.where("is_deleted", "==", options.archived ?? false);

      if (options.startDate) {
        const startDate = new Date(options.startDate);
        query = query.where("reading_date", ">=", startDate);
      }
      if (options.endDate) {
        const endDate = new Date(options.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.where("reading_date", "<=", endDate);
      }

      query = query.orderBy(options.sortBy ?? "created_at", options.sortOrder ?? "desc");

      const snapshot = await query.limit(options.limit + 1).get();
      const hasMore = snapshot.docs.length > options.limit;
      const docs = hasMore ? snapshot.docs.slice(0, options.limit) : snapshot.docs;

      return {
        data: docs.map((doc) => snapshotToModel(doc)),
        hasMore,
        nextCursor: hasMore ? docs[docs.length - 1].id : null,
      };
    }

    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    return cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterGroupId ? {meter_group_id: options.meterGroupId} : {}),
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async getById(userId: string, id: string): Promise<Reading | null> {
    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async update(userId: string, id: string, data: Partial<CreateReadingDTO>): Promise<Reading> {
    await validator.validateUpdate(data);
    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateReadingDTO>}[]): Promise<Reading[]> {
    await validator.validateUpdateBatch(updates);
    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = new CachedRepository(readingRepository, userId, "readings", CACHE_TTL);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Reading> {
    const reading = await readingRepository.getById(id);
    if (!reading) {
      throw new AppError(404, "Reading not found");
    }

    // Cascade delete + invalidate caches (cascade is custom logic, not generic)
    await cascadeDeleteReading(id);
    const deleted = await readingRepository.getById(id);
    await listRemove(`utilitool:readings:all:${userId}`, id);
    await cacheDel(`utilitool:readings:id:${id}`);
    return deleted!;
  },

  async restore(userId: string, id: string): Promise<Reading> {
    const reading = await readingRepository.getById(id);
    if (!reading) {
      throw new AppError(404, "Reading not found");
    }

    // cascadeRestoreReading already refreshes id caches and invalidates list
    // caches (wholesale, for all users) for readings/billings — appending here
    // would race with that invalidation and risk duplicates.
    await cascadeRestoreReading(id);
    const restored = await readingRepository.getById(id);
    await cacheSet(`utilitool:readings:id:${restored!.id}`, restored!, CACHE_TTL);
    return restored!;
  },
};
