import {AppError} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property} from "./property.model";
import {PropertyValidator} from "./property.validator";
import {listRemove} from "../../utils/list-cache.util";
import {cacheDel} from "../../utils/cache.util";
import {cascadeDeleteProperty, cascadeRestoreProperty} from "../../utils/cascade-delete.util";
import {CachedRepository} from "../../lib/cached-repository.lib";

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

export const propertyService = {
  async create(userId: string, data: CreatePropertyDTO): Promise<Property> {
    await validator.validateCreate(data);
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
    return cachedRepo.create(data);
  },

  async createBatch(userId: string, data: CreatePropertyDTO[]): Promise<Property[]> {
    await validator.validateBatchCreate(data);
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
    return cachedRepo.createBatch(data);
  },

  async getById(userId: string, id: string): Promise<Property | null> {
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async search(
    userId: string,
    options: PropertySearchOptions
  ): Promise<PaginatedResult<Property>> {
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);

    // Need custom filtering for meter_group_id since it's in a nested map
    const result = await cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.roomName ? { room_name: options.roomName } : {}),
      },
    });

    // Post-filter for meterGroupId (nested structure can't be queried directly)
    if (options.meterGroupId) {
      result.data = result.data.filter((property) =>
        Object.values(property.meter_groups).some((entry: any) => {
          if (typeof entry === 'string') {
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
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
    return cachedRepo.update(id, data);
  },

  async updateBatch(userId: string, updates: { id: string; data: UpdatePropertyDTO }[]): Promise<Property[]> {
    await validator.validateBatchUpdate(updates);
    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const property = await propertyRepository.getById(id);
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const cachedRepo = new CachedRepository(propertyRepository, userId, 'properties', CACHE_TTL);
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

    await cascadeRestoreProperty(id);
    const restored = await propertyRepository.getById(id);
    return restored!;
  },
};
