import {AppError} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property} from "./property.model";
import {MeterGroupVersionEntry} from "../meter-group/meter-group.model";
import {readingRepository} from "../reading/reading.repository";
import {PropertyValidator} from "./property.validator";
import {listRemove} from "../../utils/list-cache.util";
import {cacheDel, cacheSet} from "../../utils/cache.util";
import {cascadeDeleteProperty, cascadeRestoreProperty, cascadePurgeProperty} from "../../utils/cascade-delete.util";
import {CachedRepository} from "../../lib/cached-repository.lib";
import {Timestamp} from "firebase-admin/firestore";

const validator = new PropertyValidator();
const CACHE_TTL = 20 * 60; // 20 minutes

type PropertySearchOptions = {
  roomName?: string;
  meterGroupId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

// Remove undefined values from meter_groups (DTO allows undefined, model doesn't)
function cleanMeterGroups(meterGroups: Record<string, {meter_group_id: string; is_main_meter: boolean} | undefined>) {
  return Object.fromEntries(
    Object.entries(meterGroups).filter(([, v]) => v !== undefined)
  ) as Record<string, {meter_group_id: string; is_main_meter: boolean}>;
}

export const propertyService = {
  async create(userId: string, data: CreatePropertyDTO): Promise<Property> {
    await validator.validateCreate(data);
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    return cachedRepo.create({...data, meter_groups: cleanMeterGroups(data.meter_groups)});
  },

  async createBatch(userId: string, data: CreatePropertyDTO[]): Promise<Property[]> {
    await validator.validateBatchCreate(data);
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    return cachedRepo.createBatch(data.map((d) => ({...d, meter_groups: cleanMeterGroups(d.meter_groups)})));
  },

  async getById(userId: string, id: string): Promise<Property | null> {
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async search(
    userId: string,
    options: PropertySearchOptions
  ): Promise<PaginatedResult<Property>> {
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);

    // Need custom filtering for meter_group_id since it's in a nested map
    const result = await cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.roomName ? {room_name: options.roomName} : {}),
      },
    });

    // Post-filter for meterGroupId (nested structure can't be queried directly)
    if (options.meterGroupId) {
      result.data = result.data.filter((property) =>
        Object.values(property.meter_groups).some((entry: any) => {
          if (typeof entry === "string") {
            return entry === options.meterGroupId;
          }
          return entry?.meter_group_id === options.meterGroupId;
        })
      );
    }

    return result;
  },

  async update(userId: string, id: string, data: UpdatePropertyDTO): Promise<Property> {
    const property = await propertyRepository.getById(id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    await validator.validateUpdate(property, data);
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    const cleanData = data.meter_groups ? {...data, meter_groups: cleanMeterGroups(data.meter_groups)} : (data as any);
    return cachedRepo.update(id, cleanData);
  },

  async updateBatch(userId: string, updates: { id: string; data: UpdatePropertyDTO }[]): Promise<Property[]> {
    await validator.validateBatchUpdate(updates);
    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    const cleanUpdates = updates.map((u) => ({
      id: u.id,
      data: u.data.meter_groups ? {...u.data, meter_groups: cleanMeterGroups(u.data.meter_groups)} : (u.data as any),
    }));
    return cachedRepo.updateBatch(cleanUpdates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const property = await propertyRepository.getById(id);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Property> {
    const property = await propertyRepository.getById(id);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    await cascadeDeleteProperty(id);
    const deleted = await propertyRepository.getById(id);
    await listRemove(`utilitool:properties:all:${userId}`, id);
    await cacheDel(`utilitool:properties:id:${id}`);
    return deleted!;
  },

  async restore(userId: string, id: string): Promise<Property> {
    const property = await propertyRepository.getById(id);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    // cascadeRestoreProperty already refreshes id caches and invalidates list
    // caches (wholesale, for all users) for properties/readings/billings —
    // appending here would race with that invalidation and risk duplicates.
    await cascadeRestoreProperty(id);
    const restored = await propertyRepository.getById(id);
    await cacheSet(`utilitool:properties:id:${id}`, restored!, CACHE_TTL);
    return restored!;
  },

  /**
   * Permanently delete an already-archived property and its already-archived
   * readings/billings. Second step of the archive-then-purge lifecycle — throws
   * 409 if the property is still active. See cascadePurgeProperty.
   */
  async purge(id: string): Promise<void> {
    await cascadePurgeProperty(id);
  },

  /**
   * Record a physical meter reset for a SUBMETER entry on a property.
   * Mirrors meterGroupService.recordReset(), but scoped to the property's
   * own MeterGroupEntry version tracking (main meters stay on the meter group).
   */
  async recordMeterGroupReset(userId: string, propertyId: string, meterGroupId: string): Promise<Property> {
    const property = await propertyRepository.getById(propertyId);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const entryKey = Object.keys(property.meter_groups).find(
      (key) => property.meter_groups[key].meter_group_id === meterGroupId
    );
    const entry = entryKey ? property.meter_groups[entryKey] : undefined;
    if (!entry || !entryKey) {
      throw new AppError(404, "This property is not associated with the given meter group");
    }
    if (entry.is_main_meter) {
      throw new AppError(
        400,
        "This property is the main meter for this meter group. Record the reset on the meter group instead."
      );
    }

    const latestReadingsResult = await readingRepository.search({
      limit: 1,
      orderBy: "reading_date",
      orderDirection: "desc",
      archived: false,
      filters: {meter_group_id: meterGroupId, property_id: propertyId},
    });

    if (latestReadingsResult.data.length === 0) {
      throw new AppError(422, "Cannot record reset: no readings found for this property's meter");
    }

    const latestReading = latestReadingsResult.data[0];
    const currentVersion = entry.current_version ?? 1;

    const updatedVersions: Record<string, MeterGroupVersionEntry> = {
      ...(entry.versions ?? {}),
      [String(currentVersion)]: {
        reset_at: Timestamp.now(),
        last_reading: latestReading.reading_amount,
      },
    };

    const updatedEntry = {
      ...entry,
      current_version: currentVersion + 1,
      versions: updatedVersions,
    };

    const cachedRepo = new CachedRepository(propertyRepository, userId, "properties", CACHE_TTL);
    return cachedRepo.update(propertyId, {
      meter_groups: {
        ...property.meter_groups,
        [entryKey]: updatedEntry,
      },
    } as Partial<Property>);
  },
};
