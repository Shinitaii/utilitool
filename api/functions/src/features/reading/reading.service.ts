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
import {createReadingWithAutoBilling, createBatchReadingsWithAutoBilling} from "./reading.util";
import {propertyRepository} from "../property/property.repository";

const validator = new ReadingValidator();
const CACHE_TTL = 10 * 60; // 10 minutes

type ReadingCreatePayload = CreateReadingDTO & { meter_version: number };


type ReadingSearchOptions = {
  meterGroupId?: string;
  propertyId?: string;
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
    const meter_version = meterGroup!.current_version ?? 1;
    await validator.validateAnomalous(data.meter_group_id, data.reading_amount, meter_version);

    return createReadingWithAutoBilling(userId, data, meter_version);
  },

  /**
   * Batch create with simple auto-billing: for each reading, if a previous-month
   * reading exists for that meter group, create a billing automatically.
   * Uses atomic transactions per reading to ensure consistency.
   */
  async createBatch(userId: string, data: CreateReadingDTO[]): Promise<Reading[]> {
    await validator.validateBatch(data);

    // Reject if any reading targets a main meter property — those are derived automatically
    for (const r of data) {
      const property = await propertyRepository.getById(r.property_id);
      if (!property) continue;
      const entry = Object.values(property.meter_groups).find(
        (e) => e.meter_group_id === r.meter_group_id
      );
      if (entry?.is_main_meter) {
        throw new AppError(
          400,
          `Property ${r.property_id} is the main meter for meter group ${r.meter_group_id}. ` +
          `Its readings are derived automatically. Use POST /readings/seed for the first-time baseline.`
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
      meter_version: meterGroupMap.get(r.meter_group_id)?.current_version ?? 1,
    }));

    for (const r of readingsWithVersion) {
      await validator.validateAnomalous(r.meter_group_id, r.reading_amount, r.meter_version);
    }

    return createBatchReadingsWithAutoBilling(userId, readingsWithVersion);
  },

  async createSeed(userId: string, data: CreateReadingDTO): Promise<Reading> {
    await validator.validateSeedCreate(data);
    const meterGroup = await meterGroupRepository.getById(data.meter_group_id);
    const meter_version = meterGroup!.current_version ?? 1;
    const payload: ReadingCreatePayload = { ...data, meter_version };
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
    return cachedRepo.create(payload);
  },

  async search(userId: string, options: ReadingSearchOptions): Promise<PaginatedResult<Reading>> {
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
    return cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterGroupId ? { meter_group_id: options.meterGroupId } : {}),
        ...(options.propertyId ? { property_id: options.propertyId } : {}),
      },
    });
  },

  async getById(userId: string, id: string): Promise<Reading | null> {
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async update(userId: string, id: string, data: Partial<CreateReadingDTO>): Promise<Reading> {
    await validator.validateUpdate(data);
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateReadingDTO>}[]): Promise<Reading[]> {
    await validator.validateUpdateBatch(updates);
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = new CachedRepository(readingRepository, userId, 'readings', CACHE_TTL);
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

    // Cascade restore + update caches (cascade is custom logic, not generic)
    await cascadeRestoreReading(id);
    const restored = await readingRepository.getById(id);
    await cacheSet(`utilitool:readings:id:${restored!.id}`, restored!, CACHE_TTL);
    return restored!;
  },
};
