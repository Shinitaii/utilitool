import {Timestamp} from "firebase-admin/firestore";
import {meterGroupRepository} from "./meter-group.repository";
import {MeterGroup, MeterGroupVersionEntry} from "./meter-group.model";
import {CreateMeterGroupDTO} from "./meter-group.dto";
import {readingRepository} from "../reading/reading.repository";
import {PaginatedResult} from "../../utils/pagination.util";
import {MeterGroupValidator} from "./meter-group.validator";
import {AppError, getOrThrow} from "../../utils/error.util";
import {collectionRef} from "../../lib/firestore.lib";
import {COLLECTIONS} from "../../constants/collection.constants";
import {listRemove} from "../../utils/list-cache.util";
import {cacheDel, cacheSet} from "../../utils/cache.util";
import {cascadeDeleteMeterGroup, cascadeRestoreMeterGroup, cascadePurgeMeterGroup} from "../../utils/cascade-delete.util";
import {CachedRepository} from "../../lib/cached-repository.lib";

const validator = new MeterGroupValidator();
const CACHE_TTL = 30 * 60; // 30 minutes

function repoFor(userId: string): CachedRepository<MeterGroup> {
  return new CachedRepository(meterGroupRepository, userId, "meter-groups", CACHE_TTL);
}

type MeterGroupSearchOptions = {
  meterName?: string;
  utilityType?: MeterGroup["utility_type"];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  minimal?: boolean;
  summary?: boolean;
  archived?: boolean;
};

type MinimalMeterGroup = {
  id: string;
  meter_name: string;
};

type SummaryMeterGroup = Omit<MeterGroup, "versions">;

function applyProjections(
  result: PaginatedResult<MeterGroup>,
  options: MeterGroupSearchOptions
): PaginatedResult<MeterGroup | MinimalMeterGroup | SummaryMeterGroup> {
  if (options.minimal) {
    return {
      ...result,
      data: result.data.map((mg) => ({
        id: mg.id,
        meter_name: mg.meter_name,
      })),
    };
  }

  if (options.summary) {
    return {
      ...result,
      data: result.data.map((mg) => {
        const {versions, ...rest} = mg;
        return rest;
      }),
    };
  }

  return result;
}

export const meterGroupService = {
  async create(userId: string, data: CreateMeterGroupDTO): Promise<MeterGroup> {
    await validator.validateCreate(data);
    return repoFor(userId).create({
      ...data,
      current_version: 1,
      versions: {},
    });
  },

  async createBatch(userId: string, data: CreateMeterGroupDTO[]): Promise<MeterGroup[]> {
    await validator.validateBatch(data);
    return repoFor(userId).createBatch(
      data.map((item) => ({
        ...item,
        current_version: 1,
        versions: {},
      }))
    );
  },

  async search(
    userId: string,
    options: MeterGroupSearchOptions
  ): Promise<PaginatedResult<MeterGroup | MinimalMeterGroup | SummaryMeterGroup>> {
    const result = await repoFor(userId).search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.meterName ? {meter_name: options.meterName} : {}),
        ...(options.utilityType ? {utility_type: options.utilityType} : {}),
      },
    });
    return applyProjections(result, options);
  },

  async getById(userId: string, id: string): Promise<MeterGroup | null> {
    return repoFor(userId).getById(id);
  },

  async update(userId: string, id: string, data: Partial<CreateMeterGroupDTO>): Promise<MeterGroup> {
    await getOrThrow(meterGroupRepository.getById.bind(meterGroupRepository), id, "Meter group");
    return repoFor(userId).update(id, data);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateMeterGroupDTO>}[]): Promise<MeterGroup[]> {
    return repoFor(userId).updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    // Prevent hard delete if any active readings reference this meter group
    const readingsSnap = await collectionRef(COLLECTIONS.READINGS)
      .where("meter_group_id", "==", id)
      .where("is_deleted", "==", false)
      .limit(1)
      .get();

    if (!readingsSnap.empty) {
      throw new AppError(409, "Cannot delete meter group: it has active readings. Archive readings first.");
    }

    await repoFor(userId).delete(id);
  },

  async softDelete(userId: string, id: string): Promise<MeterGroup> {
    await getOrThrow(meterGroupRepository.getById.bind(meterGroupRepository), id, "Meter group");

    await cascadeDeleteMeterGroup(id);
    const deleted = await meterGroupRepository.getById(id);
    await listRemove(`utilitool:meter-groups:all:${userId}`, id);
    await cacheDel(`utilitool:meter-groups:id:${id}`);
    return deleted!;
  },

  async restore(userId: string, id: string): Promise<MeterGroup> {
    await getOrThrow(meterGroupRepository.getById.bind(meterGroupRepository), id, "Meter group");
    // cascadeRestoreMeterGroup already refreshes id caches and invalidates list
    // caches (wholesale, for all users) for meter-groups/readings/billings —
    // appending here would race with that invalidation and risk duplicates.
    await cascadeRestoreMeterGroup(id);
    const restored = await meterGroupRepository.getById(id);
    await cacheSet(`utilitool:meter-groups:id:${id}`, restored!, CACHE_TTL);
    return restored!;
  },

  /**
   * Submeter version tracking has moved to `Property.meter_groups[entry]`
   * (see `propertyService.recordMeterGroupReset`) — main-meter resets still
   * route through this endpoint and remain the active source of truth for
   * `Reading.meter_version` (see `reading.service.ts`), so it is not
   * deprecated despite the field-level `@deprecated` notes on the model.
   */
  async recordReset(userId: string, id: string): Promise<MeterGroup> {
    const meterGroup = await getOrThrow(meterGroupRepository.getById.bind(meterGroupRepository), id, "Meter group");

    const latestReadingsResult = await readingRepository.search({
      limit: 1,
      orderBy: "reading_date",
      orderDirection: "desc",
      archived: false,
      filters: {meter_group_id: id},
    });

    if (latestReadingsResult.data.length === 0) {
      throw new AppError(422, "Cannot record reset: no readings found for this meter group");
    }

    const latestReading = latestReadingsResult.data[0];
    const currentVersion = meterGroup.current_version ?? 1;

    const updatedVersions: Record<string, MeterGroupVersionEntry> = {
      ...(meterGroup.versions ?? {}),
      [String(currentVersion)]: {
        reset_at: Timestamp.now(),
        last_reading: latestReading.reading_amount,
      },
    };

    const updatePayload: Partial<MeterGroup> = {
      current_version: currentVersion + 1,
      versions: updatedVersions,
    };
    return repoFor(userId).update(id, updatePayload);
  },

  /**
   * Permanently delete an already-archived meter group and its already-archived
   * readings/billings. Second step of the archive-then-purge lifecycle — throws
   * 409 if the meter group is still active. See cascadePurgeMeterGroup.
   */
  async purge(id: string): Promise<void> {
    await cascadePurgeMeterGroup(id);
  },
};
