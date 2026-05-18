import {AppError} from "../../utils/error.util";
import {PaginatedResult} from "../../utils/pagination.util";
import {propertyRepository} from "./property.repository";
import {CreatePropertyDTO, UpdatePropertyDTO} from "./property.dto";
import {Property} from "./property.model";
import {PropertyValidator} from "./property.validator";

const validator = new PropertyValidator();

type PropertySearchOptions = {
  roomName?: string;
  meterGroupId?: string;
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const propertyService = {
  async create(data: CreatePropertyDTO): Promise<Property> {
    await validator.validateCreate(data);
    return propertyRepository.create(data);
  },

  async createBatch(data: CreatePropertyDTO[]): Promise<Property[]> {
    await validator.validateBatchCreate(data);
    return propertyRepository.createBatch(data);
  },

  async getById(id: string): Promise<Property | null> {
    return propertyRepository.getById(id);
  },

  async search(
    options: PropertySearchOptions
  ): Promise<PaginatedResult<Property>> {
    const result = await propertyRepository.search({
      limit: options.limit,
      orderBy: "created_at",
      orderDirection: "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.roomName ? {room_name: options.roomName} : {}),
      },
    });

    if (options.meterGroupId) {
      result.data = result.data.filter((property) =>
        Object.values(property.meter_groups).includes(options.meterGroupId!)
      );
    }

    return result;
  },

  async update(id: string, data: UpdatePropertyDTO): Promise<Property> {
    const property = await propertyRepository.getById(id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    await validator.validateUpdate(property, data);
    return propertyRepository.update(id, data);
  },

  async updateBatch(updates: { id: string; data: UpdatePropertyDTO }[]): Promise<Property[]> {
    await validator.validateBatchUpdate(updates);

    const results: Property[] = [];
    for (const update of updates) {
      results.push(await propertyRepository.update(update.id, update.data));
    }

    return results;
  },

  async delete(id: string): Promise<void> {
    const property = await propertyRepository.getById(id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    await propertyRepository.delete(id);
  },

  async softDelete(id: string): Promise<Property> {
    const property = await propertyRepository.getById(id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    return propertyRepository.softDelete(id);
  },

  async restore(id: string): Promise<Property> {
    const property = await propertyRepository.getById(id);

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    return propertyRepository.restore(id);
  },
};
